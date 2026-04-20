import type { FastifyInstance } from "fastify";
import { z } from "zod";
import axios from "axios";
import OpenAI from "openai";
import { prisma } from "../../shared/prisma.js";
import { decryptSecret, encryptSecret } from "../../shared/crypto.js";
import { env } from "../../config/env.js";
import {
  INTEGRATION_SETTING_KEYS,
  readDecryptedIntegrationSetting
} from "../integrations/integrationCredentials.js";
import {
  normalizeOlistBaseUrl,
  OLIST_TINY_V3_ORDERS_LIST_PATH
} from "../integrations/olist/olistUrl.js";

const upsertSettingsSchema = z.object({
  openaiApiKey: z.string().optional(),
  olistApiBaseUrl: z.string().optional(),
  olistApiToken: z.string().optional(),
  evolutionApiToken: z.string().optional(),
  olistAutoSyncEnabled: z.boolean().optional(),
  olistAutoSyncIntervalMinutes: z.coerce.number().int().min(15).max(24 * 60).optional(),
  olistMinManualIntervalMinutes: z.coerce.number().int().min(5).max(24 * 60).optional()
});

const testSettingsSchema = z.object({
  provider: z.enum(["openai", "olist", "evolution"])
});

function maskValue(raw: string) {
  if (raw.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, raw.length - 4))}${raw.slice(-4)}`;
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/settings/integrations", async (request) => {
    const token = await request.jwtVerify<{ role?: string }>();
    if (token.role !== "admin") return { message: "Apenas admin pode acessar configuracoes." };

    const settings = await prisma.integrationSetting.findMany();
    const map = new Map<string, string>(settings.map((item) => [item.key, item.valueEncrypted]));

    const readMasked = (key: string) => {
      const valueEncrypted = map.get(key) as string | undefined;
      if (!valueEncrypted) return "";
      try {
        return maskValue(decryptSecret(valueEncrypted));
      } catch {
        return "********";
      }
    };

    const readPlain = async (key: string) => {
      const raw = await readDecryptedIntegrationSetting(key);
      return raw;
    };

    const parseNumber = (raw: string, fallback: number) => {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
      return parsed;
    };

    return {
      openaiApiKey: readMasked(INTEGRATION_SETTING_KEYS.openaiApiKey),
      olistApiBaseUrl: await readPlain(INTEGRATION_SETTING_KEYS.olistApiBaseUrl),
      olistApiToken: readMasked(INTEGRATION_SETTING_KEYS.olistApiToken),
      evolutionApiToken: readMasked(INTEGRATION_SETTING_KEYS.evolutionApiToken),
      olistAutoSyncEnabled: (await readPlain(INTEGRATION_SETTING_KEYS.olistAutoSyncEnabled)) === "true",
      olistAutoSyncIntervalMinutes: parseNumber(
        await readPlain(INTEGRATION_SETTING_KEYS.olistAutoSyncIntervalMinutes),
        120
      ),
      olistMinManualIntervalMinutes: parseNumber(
        await readPlain(INTEGRATION_SETTING_KEYS.olistMinManualIntervalMinutes),
        10
      )
    };
  });

  app.post("/settings/integrations", async (request) => {
    const token = await request.jwtVerify<{ role?: string }>();
    if (token.role !== "admin") return { message: "Apenas admin pode alterar configuracoes." };

    const body = upsertSettingsSchema.parse(request.body);
    const entries: Array<[keyof typeof INTEGRATION_SETTING_KEYS, string]> = [];

    if (body.openaiApiKey?.trim()) entries.push(["openaiApiKey", body.openaiApiKey.trim()]);
    if (body.olistApiBaseUrl?.trim()) {
      const normalized = normalizeOlistBaseUrl(body.olistApiBaseUrl);
      if (!normalized.ok) {
        return { message: `OLIST URL invalida: ${normalized.message}` };
      }
      entries.push(["olistApiBaseUrl", normalized.baseUrl]);
    }
    if (body.olistApiToken?.trim()) entries.push(["olistApiToken", body.olistApiToken.trim()]);
    if (body.evolutionApiToken?.trim()) entries.push(["evolutionApiToken", body.evolutionApiToken.trim()]);

    if (body.olistAutoSyncEnabled !== undefined) {
      entries.push(["olistAutoSyncEnabled", body.olistAutoSyncEnabled ? "true" : "false"]);
    }
    if (body.olistAutoSyncIntervalMinutes !== undefined) {
      entries.push(["olistAutoSyncIntervalMinutes", String(body.olistAutoSyncIntervalMinutes)]);
    }
    if (body.olistMinManualIntervalMinutes !== undefined) {
      entries.push(["olistMinManualIntervalMinutes", String(body.olistMinManualIntervalMinutes)]);
    }

    await Promise.all(
      entries.map(([field, value]) =>
        prisma.integrationSetting.upsert({
          where: { key: INTEGRATION_SETTING_KEYS[field] },
          update: { valueEncrypted: encryptSecret(value) },
          create: {
            key: INTEGRATION_SETTING_KEYS[field],
            valueEncrypted: encryptSecret(value)
          }
        })
      )
    );

    return { message: "Configuracoes salvas com sucesso." };
  });

  app.post("/settings/integrations/test", async (request) => {
    const token = await request.jwtVerify<{ role?: string }>();
    if (token.role !== "admin") return { message: "Apenas admin pode testar integracoes." };

    const { provider } = testSettingsSchema.parse(request.body);

    if (provider === "openai") {
      const apiKey =
        (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.openaiApiKey)) ||
        env.OPENAI_API_KEY ||
        "";
      if (!apiKey) {
        return { ok: false, provider, message: "OpenAI API Key nao configurada." };
      }
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return { ok: true, provider, message: "Conexao com OpenAI validada com sucesso." };
    }

    if (provider === "olist") {
      const baseUrlRaw =
        (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistApiBaseUrl)) ||
        env.OLIST_API_BASE_URL ||
        "";
      const apiToken =
        (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistApiToken)) ||
        env.OLIST_API_TOKEN ||
        "";
      if (!baseUrlRaw || !apiToken) {
        return { ok: false, provider, message: "OLIST URL e token sao obrigatorios." };
      }

      const normalized = normalizeOlistBaseUrl(baseUrlRaw);
      if (!normalized.ok) {
        return { ok: false, provider, message: `OLIST URL invalida: ${normalized.message}` };
      }

      try {
        await axios.get(`${normalized.baseUrl}${OLIST_TINY_V3_ORDERS_LIST_PATH}`, {
          headers: { Authorization: `Bearer ${apiToken}` },
          timeout: 10000
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "ERR_INVALID_URL") {
          return { ok: false, provider, message: "OLIST URL invalida (nao foi possivel montar a URL absoluta)." };
        }
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 404) {
            return {
              ok: false,
              provider,
              message:
                "OLIST: rota nao encontrada (404). Confirme a base da API v3 da Tiny: https://api.tiny.com.br/public-api/v3 (nao use so o dominio sem /public-api/v3)."
            };
          }
          if (status === 401) {
            return {
              ok: false,
              provider,
              message:
                "OLIST: nao autorizado (401). Na API v3 o campo de token deve ser um Bearer valido (access token do aplicativo OAuth), nao apenas o Client Secret."
            };
          }
        }
        throw error;
      }
      return { ok: true, provider, message: "Conexao com OLIST validada com sucesso." };
    }

    const evolutionToken =
      (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.evolutionApiToken)) ||
      env.EVOLUTION_API_TOKEN ||
      "";
    const evolutionUrl = env.EVOLUTION_API_URL || "http://evolution-api:8080";
    if (!evolutionToken) {
      return { ok: false, provider, message: "Token da Evolution nao configurado." };
    }
    await axios.get(`${evolutionUrl}/instance/fetchInstances`, {
      headers: { apikey: evolutionToken },
      timeout: 10000
    });
    return { ok: true, provider, message: "Conexao com Evolution validada com sucesso." };
  });
}
