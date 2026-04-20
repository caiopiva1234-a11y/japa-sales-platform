import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../../config/env.js";
import {
  INTEGRATION_SETTING_KEYS,
  readDecryptedIntegrationSetting
} from "../integrationCredentials.js";
import { assertOlistRemoteCallAllowed, runOlistOrderSync } from "./olistSyncService.js";
import { normalizeOlistBaseUrl, OLIST_TINY_V3_ORDERS_LIST_PATH } from "./olistUrl.js";
import { resolveOlistBearerAccessToken } from "./olistTinyToken.js";

const syncBodySchema = z
  .object({
    months: z.coerce.number().int().min(1).max(60).optional(),
    since: z.coerce.date().optional(),
    until: z.coerce.date().optional(),
    mode: z.enum(["window", "since_last"]).optional()
  })
  .optional();

export async function olistRoutes(app: FastifyInstance) {
  app.post("/integrations/olist/sync", async (request) => {
    const token = await request.jwtVerify<{ role?: string }>();
    if (token.role !== "admin") {
      return { message: "Apenas admin pode importar dados da OLIST." };
    }

    const body = syncBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return { message: "Payload invalido para sincronizacao.", issues: body.error.flatten() };
    }

    const baseUrl =
      (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistApiBaseUrl)) ||
      env.OLIST_API_BASE_URL ||
      "";
    const resolvedBearer = await resolveOlistBearerAccessToken();
    if ("error" in resolvedBearer) {
      return { message: resolvedBearer.error };
    }
    const apiToken = resolvedBearer.accessToken;

    if (!baseUrl) {
      return { message: "Configure OLIST_API_BASE_URL (ou salve em /settings)." };
    }

    const normalizedBase = normalizeOlistBaseUrl(baseUrl);
    if (!normalizedBase.ok) {
      return { message: `OLIST URL invalida: ${normalizedBase.message}` };
    }

    const gate = await assertOlistRemoteCallAllowed();
    if (!gate.ok) {
      return {
        message: `Limite de requisicoes OLIST: aguarde ${gate.retryAfterSeconds}s (minimo configurado: ${gate.minMinutes} minutos entre importacoes).`,
        retryAfterSeconds: gate.retryAfterSeconds
      };
    }

    const mode = body.data?.mode ?? "window";
    const months = body.data?.months ?? 6;
    const explicitSince = body.data?.since ?? null;
    const explicitUntil = body.data?.until ?? null;

    let cutoff: Date;
    let until: Date | null = explicitUntil;

    if (mode === "since_last") {
      const lastRaw = await readDecryptedIntegrationSetting(
        INTEGRATION_SETTING_KEYS.olistLastSuccessfulFetchAt
      );
      if (lastRaw) {
        const last = new Date(lastRaw);
        if (Number.isNaN(last.getTime())) {
          cutoff = new Date();
          cutoff.setMonth(cutoff.getMonth() - months);
        } else {
          cutoff = new Date(last.getTime() - 5 * 60_000);
        }
      } else {
        cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
      }
    } else {
      cutoff =
        explicitSince ??
        (() => {
          const date = new Date();
          date.setMonth(date.getMonth() - months);
          return date;
        })();
    }

    try {
      const result = await runOlistOrderSync({ baseUrl: normalizedBase.baseUrl, apiToken, cutoff, until });

      return {
        ...result,
        syncWindow: {
          ...result.syncWindow,
          months: explicitSince ? null : months,
          mode
        }
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "ERR_INVALID_URL") {
        return {
          message: `OLIST URL invalida (nao foi possivel montar a URL absoluta para ${OLIST_TINY_V3_ORDERS_LIST_PATH}).`
        };
      }
      const msg = error instanceof Error ? error.message : "Erro desconhecido na sincronizacao.";
      return { message: msg };
    }
  });
}
