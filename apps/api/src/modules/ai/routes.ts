import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { env } from "../../config/env.js";
import { prisma } from "../../shared/prisma.js";

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

function heuristicClassification(text: string) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes("fechado") || lowerText.includes("vou pedir")) {
    return { result: "sucesso", qualityScore: 85 };
  }
  if (lowerText.includes("depois") || lowerText.includes("amanha")) {
    return { result: "pendente", qualityScore: 60 };
  }
  if (lowerText.includes("nao") || lowerText.includes("caro")) {
    return { result: "sem_sucesso", qualityScore: 30 };
  }
  return { result: "sem_resposta", qualityScore: 45 };
}

export async function aiRoutes(app: FastifyInstance) {
  app.post("/ai/analyze/:conversationId", async (request) => {
    await request.jwtVerify();
    const { conversationId } = request.params as { conversationId: string };

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" }
    });

    const transcript = messages
      .map((message) => `${message.direction === "outbound" ? "vendedor" : "cliente"}: ${message.content}`)
      .join("\n");

    let result = "pendente";
    let qualityScore = 60;
    let reasons: string[] = ["Sem classificacao detalhada."];
    let suggestions: string[] = ["Melhorar CTA final da abordagem."];

    if (openai) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Classifique o atendimento de vendas no WhatsApp. Responda JSON com result, qualityScore (0-100), reasons (array), suggestions (array). Result pode ser sucesso, pendente, sem_sucesso ou sem_resposta."
          },
          { role: "user", content: transcript || "Sem mensagens." }
        ]
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      result = parsed.result ?? result;
      qualityScore = parsed.qualityScore ?? qualityScore;
      reasons = parsed.reasons ?? reasons;
      suggestions = parsed.suggestions ?? suggestions;
    } else {
      const heuristic = heuristicClassification(transcript);
      result = heuristic.result;
      qualityScore = heuristic.qualityScore;
      reasons = ["Classificacao heuristica sem OpenAI API."];
      suggestions = ["Configure OPENAI_API_KEY para analises mais precisas."];
    }

    const analysis = await prisma.conversationAnalysis.upsert({
      where: { conversationId },
      update: { result, qualityScore, reasons, suggestions, analyzedAt: new Date() },
      create: { conversationId, result, qualityScore, reasons, suggestions }
    });

    return analysis;
  });
}
