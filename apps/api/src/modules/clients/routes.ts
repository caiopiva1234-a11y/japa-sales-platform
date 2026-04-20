import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";

const createCustomerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  city: z.string().optional(),
  segment: z.string().optional()
});

export async function clientRoutes(app: FastifyInstance) {
  app.get("/customers", async (request) => {
    await request.jwtVerify();
    return prisma.customer.findMany({
      orderBy: { updatedAt: "desc" },
      include: { orders: { take: 5, orderBy: { orderDate: "desc" } } }
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
}
