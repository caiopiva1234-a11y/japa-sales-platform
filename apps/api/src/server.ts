import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import { env } from "./config/env.js";
import { prisma } from "./shared/prisma.js";
import { authRoutes } from "./modules/auth/routes.js";
import { clientRoutes } from "./modules/clients/routes.js";
import { salesRoutes } from "./modules/sales/routes.js";
import { recommendationRoutes } from "./modules/recommendations/routes.js";
import { whatsappRoutes } from "./modules/whatsapp/routes.js";
import { aiRoutes } from "./modules/ai/routes.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import { automationRoutes } from "./modules/automation/routes.js";
import { leadRoutes } from "./modules/leads/routes.js";
import { olistRoutes } from "./modules/integrations/olist/routes.js";

async function bootstrap() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.JWT_SECRET });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ready" };
  });

  await app.register(authRoutes);
  await app.register(clientRoutes);
  await app.register(salesRoutes);
  await app.register(recommendationRoutes);
  await app.register(whatsappRoutes);
  await app.register(aiRoutes);
  await app.register(dashboardRoutes);
  await app.register(automationRoutes);
  await app.register(leadRoutes);
  await app.register(olistRoutes);

  const adminEmail = "admin@japaatacado.com";
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) {
    const passwordHash = await bcrypt.hash("12345678", 10);
    await prisma.user.create({
      data: {
        name: "Administrador",
        email: adminEmail,
        passwordHash,
        role: "admin"
      }
    });
  }

  await app.listen({ port: 3333, host: "0.0.0.0" });
}

bootstrap().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
