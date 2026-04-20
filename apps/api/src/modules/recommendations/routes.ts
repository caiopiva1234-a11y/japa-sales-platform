import type { FastifyInstance } from "fastify";
import dayjs from "dayjs";
import { prisma } from "../../shared/prisma.js";

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

export async function recommendationRoutes(app: FastifyInstance) {
  app.post("/recommendations/recalculate/:customerId", async (request) => {
    await request.jwtVerify();
    const { customerId } = request.params as { customerId: string };

    const orders = await prisma.order.findMany({
      where: { customerId },
      orderBy: { orderDate: "asc" },
      include: { items: { include: { product: true } } }
    });

    const productHistory = new Map<
      string,
      { productId: string; quantities: number[]; dates: Date[] }
    >();

    for (const order of orders) {
      for (const item of order.items) {
        const key = item.productId;
        const existing = productHistory.get(key) ?? {
          productId: key,
          quantities: [],
          dates: []
        };
        existing.quantities.push(item.quantity);
        existing.dates.push(order.orderDate);
        productHistory.set(key, existing);
      }
    }

    for (const entry of productHistory.values()) {
      const sortedDates = entry.dates.sort((a, b) => a.getTime() - b.getTime());
      const intervals: number[] = [];
      for (let i = 1; i < sortedDates.length; i += 1) {
        intervals.push(dayjs(sortedDates[i]).diff(sortedDates[i - 1], "day"));
      }

      const frequencyDays = intervals.length ? average(intervals) : 30;
      const averageQuantity = average(entry.quantities.slice(-4));
      const lastPurchaseAt = sortedDates[sortedDates.length - 1];
      const daysWithoutBuying = lastPurchaseAt
        ? dayjs().diff(lastPurchaseAt, "day")
        : 0;
      const repurchaseScore = Math.min(100, (daysWithoutBuying / frequencyDays) * 100);
      const suggestedQuantity = Math.max(
        1,
        Math.round(
          averageQuantity *
            Math.min(1.3, Math.max(0.8, daysWithoutBuying / Math.max(1, frequencyDays)))
        )
      );
      const possibleForget = repurchaseScore >= 80;

      await prisma.customerItemMetric.upsert({
        where: { customerId_productId: { customerId, productId: entry.productId } },
        update: {
          averageQuantity,
          frequencyDays,
          daysWithoutBuying,
          repurchaseScore,
          suggestedQuantity,
          possibleForget,
          lastPurchaseAt
        },
        create: {
          customerId,
          productId: entry.productId,
          averageQuantity,
          frequencyDays,
          daysWithoutBuying,
          repurchaseScore,
          suggestedQuantity,
          possibleForget,
          lastPurchaseAt
        }
      });
    }

    return { message: "Metricas recalculadas com sucesso." };
  });

  app.get("/recommendations/:customerId", async (request) => {
    await request.jwtVerify();
    const { customerId } = request.params as { customerId: string };

    const metrics = await prisma.customerItemMetric.findMany({
      where: { customerId },
      orderBy: [{ repurchaseScore: "desc" }, { possibleForget: "desc" }],
      include: { product: true }
    });

    const topBoughtProducts = metrics.map((metric) => metric.productId).slice(0, 5);
    const crossSell = await prisma.crossSellRule.findMany({
      where: { baseProductId: { in: topBoughtProducts } },
      orderBy: { confidence: "desc" },
      take: 10
    });

    const suggestedProducts = await prisma.product.findMany({
      where: { id: { in: crossSell.map((item) => item.suggestedId) } }
    });

    return {
      repurchaseList: metrics.map((metric) => ({
        productId: metric.productId,
        sku: metric.product.sku,
        productName: metric.product.name,
        suggestedQuantity: metric.suggestedQuantity,
        repurchaseScore: metric.repurchaseScore,
        possibleForget: metric.possibleForget
      })),
      crossSell: suggestedProducts
    };
  });
}
