import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";

const orderSchema = z.object({
  customerId: z.string(),
  totalValue: z.number().positive(),
  orderDate: z.coerce.date(),
  status: z.string().default("completed"),
  items: z.array(
    z.object({
      sku: z.string(),
      name: z.string(),
      category: z.string().optional(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().positive()
    })
  )
});

export async function salesRoutes(app: FastifyInstance) {
  app.get("/sales/orders", async (request) => {
    await request.jwtVerify();
    return prisma.order.findMany({
      orderBy: { orderDate: "desc" },
      include: { customer: true, items: { include: { product: true } } }
    });
  });

  app.post("/sales/orders", async (request) => {
    await request.jwtVerify();
    const body = orderSchema.parse(request.body);

    const createdOrder = await prisma.order.create({
      data: {
        customerId: body.customerId,
        totalValue: body.totalValue,
        orderDate: body.orderDate,
        status: body.status,
        items: {
          create: await Promise.all(
            body.items.map(async (item) => {
              const product = await prisma.product.upsert({
                where: { sku: item.sku },
                update: { name: item.name, category: item.category },
                create: { sku: item.sku, name: item.name, category: item.category }
              });
              return {
                productId: product.id,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.quantity * item.unitPrice
              };
            })
          )
        }
      },
      include: { items: true }
    });

    return createdOrder;
  });
}
