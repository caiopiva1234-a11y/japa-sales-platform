import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";

const createCustomerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  city: z.string().optional(),
  segment: z.string().optional()
});

const updateCustomerSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  segment: z.string().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  nextFollowUpAt: z.coerce.date().optional().nullable()
});

export async function clientRoutes(app: FastifyInstance) {
  app.get("/customers", async (request) => {
    await request.jwtVerify();
    return prisma.customer.findMany({
      orderBy: { updatedAt: "desc" },
      include: { orders: { take: 5, orderBy: { orderDate: "desc" } } }
    });
  });

  app.get("/customers/:id", async (request) => {
    await request.jwtVerify();
    const { id } = request.params as { id: string };
    return prisma.customer.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { orderDate: "desc" }, take: 20, include: { items: { include: { product: true } } } },
        metrics: { take: 10, orderBy: { repurchaseScore: "desc" }, include: { product: true } }
      }
    });
  });

  app.post("/customers", async (request) => {
    await request.jwtVerify();
    const body = createCustomerSchema.parse(request.body) as {
      name: string;
      phone?: string;
      city?: string;
      segment?: string;
    };
    return prisma.customer.create({
      data: {
        name: body.name,
        phone: body.phone,
        city: body.city,
        segment: body.segment
      }
    });
  });

  app.patch("/customers/:id", async (request) => {
    await request.jwtVerify();
    const { id } = request.params as { id: string };
    const body = updateCustomerSchema.parse(request.body);
    return prisma.customer.update({
      where: { id },
      data: {
        ...body,
        lastActivityAt: new Date()
      }
    });
  });
}
