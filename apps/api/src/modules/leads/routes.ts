import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";

const leadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  source: z.string().default("manual")
});

const leadUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional().nullable(),
  source: z.string().optional(),
  stage: z.string().optional(),
  score: z.coerce.number().int().min(0).max(100).optional(),
  notes: z.string().optional().nullable(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
  assignedTo: z.string().optional().nullable()
});

export async function leadRoutes(app: FastifyInstance) {
  app.get("/leads", async (request) => {
    await request.jwtVerify();
    return prisma.lead.findMany({ orderBy: { updatedAt: "desc" } });
  });

  app.get("/leads/:id", async (request) => {
    await request.jwtVerify();
    const { id } = request.params as { id: string };
    return prisma.lead.findUnique({ where: { id } });
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

  app.patch("/leads/:id", async (request) => {
    await request.jwtVerify();
    const { id } = request.params as { id: string };
    const body = leadUpdateSchema.parse(request.body);
    return prisma.lead.update({
      where: { id },
      data: {
        ...body,
        lastActivityAt: new Date()
      }
    });
  });
}
