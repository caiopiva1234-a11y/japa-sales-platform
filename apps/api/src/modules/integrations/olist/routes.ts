import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../../config/env.js";
import {
  INTEGRATION_SETTING_KEYS,
  readDecryptedIntegrationSetting
} from "../integrationCredentials.js";
import { assertOlistRemoteCallAllowed, runOlistOrderSync } from "./olistSyncService.js";

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
    const apiToken =
      (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistApiToken)) ||
      env.OLIST_API_TOKEN ||
      "";

    if (!baseUrl || !apiToken) {
      return { message: "Configure OLIST_API_BASE_URL e OLIST_API_TOKEN (ou salve em /settings)." };
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

    const result = await runOlistOrderSync({ baseUrl, apiToken, cutoff, until });

    return {
      ...result,
      syncWindow: {
        ...result.syncWindow,
        months: explicitSince ? null : months,
        mode
      }
    };
  });
}
