import type { FastifyInstance } from "fastify";
import axios from "axios";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../shared/prisma.js";

const sendMessageSchema = z.object({
  conversationId: z.string(),
  content: z.string().min(1),
  templateKey: z.string().optional()
});

const outcomeSchema = z.object({
  result: z.enum(["sucesso", "pendente", "sem_sucesso", "sem_resposta"]),
  note: z.string().optional()
});

export async function whatsappRoutes(app: FastifyInstance) {
  app.post("/whatsapp/connect", async (request) => {
    await request.jwtVerify();

    if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_TOKEN || !env.EVOLUTION_INSTANCE) {
      return { message: "Evolution API nao configurada nas variaveis de ambiente." };
    }

    const response = await axios.post(
      `${env.EVOLUTION_API_URL}/instance/create`,
      { instanceName: env.EVOLUTION_INSTANCE, qrcode: true },
      { headers: { apikey: env.EVOLUTION_API_TOKEN } }
    );

    return response.data;
  });

  app.post("/whatsapp/send", async (request) => {
    await request.jwtVerify();
    const body = sendMessageSchema.parse(request.body);

    const conversation = await prisma.conversation.findUnique({
      where: { id: body.conversationId },
      include: { customer: true }
    });
    if (!conversation || !conversation.customer.phone) {
      return { message: "Conversa ou telefone do cliente nao encontrado." };
    }

    if (env.EVOLUTION_API_URL && env.EVOLUTION_API_TOKEN && env.EVOLUTION_INSTANCE) {
      await axios.post(
        `${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE}`,
        {
          number: conversation.customer.phone,
          text: body.content
        },
        { headers: { apikey: env.EVOLUTION_API_TOKEN } }
      );
    }

    await prisma.message.create({
      data: {
        conversationId: body.conversationId,
        direction: "outbound",
        content: body.content,
        templateKey: body.templateKey,
        status: "sent"
      }
    });

    await prisma.conversation.update({
      where: { id: body.conversationId },
      data: { lastMessageAt: new Date(), status: "waiting_customer" }
    });

    return { message: "Mensagem enviada." };
  });

  app.post("/webhooks/whatsapp", async (request) => {
    const payload = request.body as Record<string, unknown>;

    const number = String(payload?.["from"] ?? "");
    const text = String(payload?.["body"] ?? "");
    if (!number || !text) return { ok: true };

    const customer = await prisma.customer.findFirst({ where: { phone: number } });
    if (!customer) return { ok: true };

    let conversation = await prisma.conversation.findFirst({
      where: { customerId: customer.id, status: { not: "closed" } },
      orderBy: { updatedAt: "desc" }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { customerId: customer.id, channel: "whatsapp", status: "open" }
      });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "inbound",
        content: text,
        status: "received"
      }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: "open" }
    });

    return { ok: true };
  });

  app.get("/conversations", async (request) => {
    await request.jwtVerify();
    return prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: { customer: true, messages: { take: 1, orderBy: { createdAt: "desc" } } }
    });
  });

  app.get("/conversations/:id/messages", async (request) => {
    await request.jwtVerify();
    const { id } = request.params as { id: string };
    return prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" }
    });
  });

  app.post("/conversations/:id/outcome", async (request) => {
    await request.jwtVerify();
    const { id } = request.params as { id: string };
    const body = outcomeSchema.parse(request.body);

    await prisma.conversationAnalysis.upsert({
      where: { conversationId: id },
      update: {
        result: body.result,
        reasons: [body.note ?? "Resultado marcado manualmente."],
        suggestions: ["Acompanhar performance por template e horario."],
        analyzedAt: new Date()
      },
      create: {
        conversationId: id,
        result: body.result,
        qualityScore: body.result === "sucesso" ? 85 : 55,
        reasons: [body.note ?? "Resultado marcado manualmente."],
        suggestions: ["Acompanhar performance por template e horario."]
      }
    });

    await prisma.conversation.update({
      where: { id },
      data: { status: body.result === "pendente" ? "waiting_customer" : "closed" }
    });

    return { message: "Resultado da conversa atualizado." };
  });

  app.get("/whatsapp/templates/performance", async (request) => {
    await request.jwtVerify();

    const outboundTemplateMessages = await prisma.message.findMany({
      where: { direction: "outbound", templateKey: { not: null } },
      include: { conversation: { include: { analysis: true } } }
    });

    const performance = new Map<
      string,
      { sends: number; successes: number; pendings: number; noSuccess: number }
    >();

    for (const message of outboundTemplateMessages) {
      const templateKey = message.templateKey ?? "sem-template";
      const current = performance.get(templateKey) ?? {
        sends: 0,
        successes: 0,
        pendings: 0,
        noSuccess: 0
      };
      current.sends += 1;
      const result = message.conversation.analysis?.result;
      if (result === "sucesso") current.successes += 1;
      else if (result === "pendente") current.pendings += 1;
      else if (result === "sem_sucesso") current.noSuccess += 1;
      performance.set(templateKey, current);
    }

    return Array.from(performance.entries()).map(([templateKey, totals]) => ({
      templateKey,
      sends: totals.sends,
      conversionRate: totals.sends ? (totals.successes / totals.sends) * 100 : 0,
      pendingRate: totals.sends ? (totals.pendings / totals.sends) * 100 : 0,
      failRate: totals.sends ? (totals.noSuccess / totals.sends) * 100 : 0
    }));
  });
}
