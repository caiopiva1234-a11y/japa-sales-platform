import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";

const leadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  source: z.string().default("manual")
});

export async function leadRoutes(app: FastifyInstance) {
  app.get("/leads", async (request) => {
    await request.jwtVerify();
    return prisma.lead.findMany({ orderBy: { updatedAt: "desc" } });
  });

  app.post("/leads", async (request) => {
    await request.jwtVerify();
    const body = leadSchema.parse(request.body) as {
      name: string;
      phone?: string;
      source?: string;
    };
    return prisma.lead.create({
      data: {
        name: body.name,
        phone: body.phone,
        source: body.source ?? "manual"
      }
    });
  });
}
