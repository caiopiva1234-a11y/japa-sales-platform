import type { FastifyInstance } from "fastify";
import axios from "axios";
import { env } from "../../../config/env.js";
import { prisma } from "../../../shared/prisma.js";

type OlistOrder = {
  id: string;
  customer: { id: string; name: string; phone?: string };
  total: number;
  status: string;
  created_at: string;
  items: Array<{ sku: string; name: string; quantity: number; unit_price: number }>;
};

export async function olistRoutes(app: FastifyInstance) {
  app.post("/integrations/olist/sync", async (request) => {
    await request.jwtVerify();
    if (!env.OLIST_API_BASE_URL || !env.OLIST_API_TOKEN) {
      return { message: "Configure OLIST_API_BASE_URL e OLIST_API_TOKEN." };
    }

    const response = await axios.get<{ orders: OlistOrder[] }>(
      `${env.OLIST_API_BASE_URL}/orders`,
      { headers: { Authorization: `Bearer ${env.OLIST_API_TOKEN}` } }
    );

    const normalizedOrders = response.data.orders ?? [];
    let syncedOrders = 0;
    const skipped: string[] = [];

    for (const remoteOrder of normalizedOrders) {
      if (!remoteOrder.id || !remoteOrder.customer?.id) {
        skipped.push(remoteOrder.id ?? "sem-id");
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const customer = await tx.customer.upsert({
            where: { externalId: remoteOrder.customer.id },
            update: {
              name: remoteOrder.customer.name,
              phone: remoteOrder.customer.phone
            },
            create: {
              externalId: remoteOrder.customer.id,
              name: remoteOrder.customer.name,
              phone: remoteOrder.customer.phone
            }
          });

          const order = await tx.order.upsert({
            where: { externalId: remoteOrder.id },
            update: {
              totalValue: remoteOrder.total,
              status: remoteOrder.status,
              orderDate: new Date(remoteOrder.created_at),
              customerId: customer.id
            },
            create: {
              externalId: remoteOrder.id,
              customerId: customer.id,
              totalValue: remoteOrder.total,
              status: remoteOrder.status,
              orderDate: new Date(remoteOrder.created_at)
            }
          });

          for (const item of remoteOrder.items) {
            const product = await tx.product.upsert({
              where: { sku: item.sku },
              update: { name: item.name },
              create: { sku: item.sku, name: item.name }
            });

            await tx.orderItem.upsert({
              where: { orderId_productId: { orderId: order.id, productId: product.id } },
              update: {
                quantity: item.quantity,
                unitPrice: item.unit_price,
                totalPrice: item.quantity * item.unit_price
              },
              create: {
                orderId: order.id,
                productId: product.id,
                quantity: item.quantity,
                unitPrice: item.unit_price,
                totalPrice: item.quantity * item.unit_price
              }
            });
          }
        });
        syncedOrders += 1;
      } catch {
        skipped.push(remoteOrder.id);
      }
    }

    return {
      message: "Sincronizacao OLIST concluida.",
      totalReceived: normalizedOrders.length,
      syncedOrders,
      skippedOrders: skipped
    };
  });
}
