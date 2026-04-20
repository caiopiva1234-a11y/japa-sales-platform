import type { FastifyInstance } from "fastify";
import { z } from "zod";
import axios from "axios";
import OpenAI from "openai";
import { prisma } from "../../shared/prisma.js";
import { decryptSecret, encryptSecret } from "../../shared/crypto.js";
import { env } from "../../config/env.js";

const upsertSettingsSchema = z.object({
  openaiApiKey: z.string().optional(),
  olistApiBaseUrl: z.string().optional(),
  olistApiToken: z.string().optional(),
  evolutionApiToken: z.string().optional()
});

const SETTINGS_KEYS = {
  openaiApiKey: "OPENAI_API_KEY",
  olistApiBaseUrl: "OLIST_API_BASE_URL",
  olistApiToken: "OLIST_API_TOKEN",
  evolutionApiToken: "EVOLUTION_API_TOKEN"
} as const;

const testSettingsSchema = z.object({
  provider: z.enum(["openai", "olist", "evolution"])
});

function maskValue(raw: string) {
  if (raw.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, raw.length - 4))}${raw.slice(-4)}`;
}

export async function settingsRoutes(app: FastifyInstance) {
  const readDecrypted = async (key: string) => {
    const setting = await prisma.integrationSetting.findUnique({ where: { key } });
    if (!setting) return "";
    try {
      return decryptSecret(setting.valueEncrypted);
    } catch {
      return "";
    }
  };

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

    return {
      openaiApiKey: readMasked(SETTINGS_KEYS.openaiApiKey),
      olistApiBaseUrl: readMasked(SETTINGS_KEYS.olistApiBaseUrl),
      olistApiToken: readMasked(SETTINGS_KEYS.olistApiToken),
      evolutionApiToken: readMasked(SETTINGS_KEYS.evolutionApiToken)
    };
  });

  app.post("/settings/integrations", async (request) => {
    const token = await request.jwtVerify<{ role?: string }>();
    if (token.role !== "admin") return { message: "Apenas admin pode alterar configuracoes." };

    const body = upsertSettingsSchema.parse(request.body);
    const entries = Object.entries(body).filter(([, value]) => value && value.trim().length > 0);

    await Promise.all(
      entries.map(([field, value]) =>
        prisma.integrationSetting.upsert({
          where: { key: SETTINGS_KEYS[field as keyof typeof SETTINGS_KEYS] },
          update: { valueEncrypted: encryptSecret(value as string) },
          create: {
            key: SETTINGS_KEYS[field as keyof typeof SETTINGS_KEYS],
            valueEncrypted: encryptSecret(value as string)
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
      const apiKey = (await readDecrypted(SETTINGS_KEYS.openaiApiKey)) || env.OPENAI_API_KEY || "";
      if (!apiKey) {
        return { ok: false, provider, message: "OpenAI API Key nao configurada." };
      }
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return { ok: true, provider, message: "Conexao com OpenAI validada com sucesso." };
    }

    if (provider === "olist") {
      const baseUrl = (await readDecrypted(SETTINGS_KEYS.olistApiBaseUrl)) || env.OLIST_API_BASE_URL || "";
      const apiToken = (await readDecrypted(SETTINGS_KEYS.olistApiToken)) || env.OLIST_API_TOKEN || "";
      if (!baseUrl || !apiToken) {
        return { ok: false, provider, message: "OLIST URL e token sao obrigatorios." };
      }
      await axios.get(`${baseUrl}/orders`, {
        headers: { Authorization: `Bearer ${apiToken}` },
        timeout: 10000
      });
      return { ok: true, provider, message: "Conexao com OLIST validada com sucesso." };
    }

    const evolutionToken =
      (await readDecrypted(SETTINGS_KEYS.evolutionApiToken)) || env.EVOLUTION_API_TOKEN || "";
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
