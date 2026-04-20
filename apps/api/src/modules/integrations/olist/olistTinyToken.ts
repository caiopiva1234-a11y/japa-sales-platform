import axios from "axios";
import { createHash } from "node:crypto";
import { prisma } from "../../../shared/prisma.js";
import { encryptSecret } from "../../../shared/crypto.js";
import { env } from "../../../config/env.js";
import {
  INTEGRATION_SETTING_KEYS,
  readDecryptedIntegrationSetting
} from "../integrationCredentials.js";

/** Token OIDC da conta Tiny (Keycloak) — ver documentacao oficial da API v3. */
export const TINY_OIDC_TOKEN_URL =
  "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";

type TinyTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type CacheEntry = { accessToken: string; expiresAtMs: number };
const accessTokenCache = new Map<string, CacheEntry>();

function cacheKey(clientId: string, grant: "refresh" | "cc", extra: string) {
  return createHash("sha256").update(`${clientId}|${grant}|${extra}`).digest("hex");
}

function getCached(key: string): string | null {
  const row = accessTokenCache.get(key);
  if (!row || Date.now() >= row.expiresAtMs) {
    accessTokenCache.delete(key);
    return null;
  }
  return row.accessToken;
}

function setCached(key: string, accessToken: string, expiresInSeconds?: number) {
  const ttlMs = expiresInSeconds
    ? Math.max(30_000, Math.floor(expiresInSeconds * 1000 * 0.85))
    : 3_500_000;
  accessTokenCache.set(key, { accessToken, expiresAtMs: Date.now() + ttlMs });
}

async function persistRotatedRefreshToken(next: string | undefined, previous: string) {
  if (!next || next === previous) return;
  await prisma.integrationSetting.upsert({
    where: { key: INTEGRATION_SETTING_KEYS.olistTinyRefreshToken },
    update: { valueEncrypted: encryptSecret(next) },
    create: {
      key: INTEGRATION_SETTING_KEYS.olistTinyRefreshToken,
      valueEncrypted: encryptSecret(next)
    }
  });
}

function tinyTokenErrorMessage(data: TinyTokenResponse | undefined, fallback: string) {
  if (!data) return fallback;
  const msg = [data.error, data.error_description].filter(Boolean).join(" — ");
  return msg || fallback;
}

async function postTinyToken(body: URLSearchParams): Promise<TinyTokenResponse> {
  try {
    const { data } = await axios.post<TinyTokenResponse>(TINY_OIDC_TOKEN_URL, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 20_000
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      return error.response.data as TinyTokenResponse;
    }
    throw error;
  }
}

async function exchangeRefreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });
  const data = await postTinyToken(body);
  if (!data.access_token) {
    throw new Error(tinyTokenErrorMessage(data, "Falha ao renovar token Tiny (refresh_token)."));
  }
  await persistRotatedRefreshToken(data.refresh_token, refreshToken);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

async function exchangeClientCredentials(
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret
  });
  const data = await postTinyToken(body);
  if (!data.access_token) {
    const hint = tinyTokenErrorMessage(data, "client_credentials nao aceito ou credenciais invalidas.");
    throw new Error(hint);
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/**
 * Resolve o Bearer para chamadas a `api.tiny.com.br/public-api/v3`.
 * Ordem: refresh_token + client (documentado) → client_credentials (se habilitado na conta) → token estatico em OLIST_API_TOKEN.
 */
export async function resolveOlistBearerAccessToken(options?: {
  forceRefresh?: boolean;
}): Promise<{ accessToken: string } | { error: string }> {
  const clientId =
    (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistTinyClientId)) ||
    env.OLIST_TINY_CLIENT_ID ||
    "";
  const clientSecret =
    (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistTinyClientSecret)) ||
    env.OLIST_TINY_CLIENT_SECRET ||
    "";
  const refreshToken =
    (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistTinyRefreshToken)) ||
    env.OLIST_TINY_REFRESH_TOKEN ||
    "";
  const staticBearer =
    (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistApiToken)) ||
    env.OLIST_API_TOKEN ||
    "";

  if (clientId && clientSecret && refreshToken) {
    const key = cacheKey(clientId, "refresh", refreshToken);
    if (!options?.forceRefresh) {
      const hit = getCached(key);
      if (hit) return { accessToken: hit };
    }
    try {
      const { accessToken, expiresIn } = await exchangeRefreshToken(
        clientId,
        clientSecret,
        refreshToken
      );
      setCached(key, accessToken, expiresIn);
      return { accessToken };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro OAuth Tiny (refresh).";
      return { error: msg };
    }
  }

  if (clientId && clientSecret) {
    const key = cacheKey(clientId, "cc", clientSecret);
    if (!options?.forceRefresh) {
      const hit = getCached(key);
      if (hit) return { accessToken: hit };
    }
    try {
      const { accessToken, expiresIn } = await exchangeClientCredentials(clientId, clientSecret);
      setCached(key, accessToken, expiresIn);
      return { accessToken };
    } catch {
      /* fall through */
    }
  }

  if (staticBearer.trim()) {
    return { accessToken: staticBearer.trim() };
  }

  return {
    error:
      "OLIST Tiny: configure Client ID + Client Secret + Refresh Token (OAuth no ERP), ou Client ID + Secret se a conta permitir client_credentials, ou cole um access token valido em OLIST API Token. Documentacao: https://api-docs.erp.olist.com/documentacao/comecando/autenticacao"
  };
}
