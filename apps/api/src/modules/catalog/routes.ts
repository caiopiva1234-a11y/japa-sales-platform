import type { FastifyInstance } from "fastify";
import { prisma } from "../../shared/prisma.js";

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/catalog/products", async (request) => {
    await request.jwtVerify();
    return prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { orderItems: true } } }
    });
  });
}
