import type { FastifyInstance } from "fastify";
import { env } from "../../../config/env.js";
import {
  INTEGRATION_SETTING_KEYS,
  readDecryptedIntegrationSetting
} from "../integrationCredentials.js";
import { assertOlistRemoteCallAllowed, readNumberSetting, runOlistOrderSync } from "./olistSyncService.js";

let schedulerStarted = false;
let lastAutoAttemptAtMs = 0;

export function registerOlistScheduler(app: FastifyInstance) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(() => {
    void tick(app);
  }, 60_000);
}

async function tick(app: FastifyInstance) {
  try {
    const enabledRaw = await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistAutoSyncEnabled);
    if (enabledRaw !== "true") return;

    const intervalMinutes = await readNumberSetting(
      INTEGRATION_SETTING_KEYS.olistAutoSyncIntervalMinutes,
      120
    );

    const now = Date.now();
    if (now - lastAutoAttemptAtMs < intervalMinutes * 60_000) return;
    lastAutoAttemptAtMs = now;

    const baseUrl =
      (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistApiBaseUrl)) ||
      env.OLIST_API_BASE_URL ||
      "";
    const apiToken =
      (await readDecryptedIntegrationSetting(INTEGRATION_SETTING_KEYS.olistApiToken)) ||
      env.OLIST_API_TOKEN ||
      "";

    if (!baseUrl || !apiToken) return;

    const gate = await assertOlistRemoteCallAllowed();
    if (!gate.ok) {
      app.log.warn(
        { retryAfterSeconds: gate.retryAfterSeconds },
        "OLIST auto-sync skipped due to remote call throttle"
      );
      return;
    }

    const monthsFallback = 6;
    const lastRaw = await readDecryptedIntegrationSetting(
      INTEGRATION_SETTING_KEYS.olistLastSuccessfulFetchAt
    );

    let cutoff: Date;
    if (lastRaw) {
      const last = new Date(lastRaw);
      if (Number.isNaN(last.getTime())) {
        cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - monthsFallback);
      } else {
        cutoff = new Date(last.getTime() - 5 * 60_000);
      }
    } else {
      cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthsFallback);
    }

    const result = await runOlistOrderSync({ baseUrl, apiToken, cutoff, until: null });
    app.log.info({ syncedOrders: result.syncedOrders, totalReceived: result.totalReceived }, "OLIST auto-sync");
  } catch (error) {
    app.log.error({ err: error }, "OLIST auto-sync failed");
  }
}
