import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: "../../.env" });
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  OPENAI_API_KEY: z.string().optional(),
  OLIST_API_BASE_URL: z.string().optional(),
  OLIST_API_TOKEN: z.string().optional(),
  OLIST_TINY_CLIENT_ID: z.string().optional(),
  OLIST_TINY_CLIENT_SECRET: z.string().optional(),
  OLIST_TINY_REFRESH_TOKEN: z.string().optional(),
  EVOLUTION_API_URL: z.string().optional(),
  EVOLUTION_API_TOKEN: z.string().optional(),
  EVOLUTION_INSTANCE: z.string().optional()
});

export const env = envSchema.parse(process.env);
