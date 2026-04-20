import { prisma } from "../../shared/prisma.js";
import { decryptSecret } from "../../shared/crypto.js";

export const INTEGRATION_SETTING_KEYS = {
  olistApiBaseUrl: "OLIST_API_BASE_URL",
  olistApiToken: "OLIST_API_TOKEN",
  evolutionApiToken: "EVOLUTION_API_TOKEN",
  openaiApiKey: "OPENAI_API_KEY",
  olistAutoSyncEnabled: "OLIST_AUTO_SYNC_ENABLED",
  olistAutoSyncIntervalMinutes: "OLIST_AUTO_SYNC_INTERVAL_MINUTES",
  olistMinManualIntervalMinutes: "OLIST_MIN_MANUAL_INTERVAL_MINUTES",
  olistLastSuccessfulFetchAt: "OLIST_LAST_SUCCESSFUL_FETCH_AT",
  olistLastSyncAt: "OLIST_LAST_SYNC_AT"
} as const;

export async function readDecryptedIntegrationSetting(key: string) {
  const setting = await prisma.integrationSetting.findUnique({ where: { key } });
  if (!setting) return "";
  try {
    return decryptSecret(setting.valueEncrypted);
  } catch {
    return "";
  }
}
