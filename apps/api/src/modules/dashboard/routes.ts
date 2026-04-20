import type { FastifyInstance } from "fastify";
import { prisma } from "../../shared/prisma.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/kpis", async (request) => {
    await request.jwtVerify();

    const [customers, orders, analyses, metrics] = await Promise.all([
      prisma.customer.count(),
      prisma.order.findMany(),
      prisma.conversationAnalysis.findMany(),
      prisma.customerItemMetric.findMany()
    ]);

    const monthlyRevenue = orders
      .filter((order) => new Date(order.orderDate).getMonth() === new Date().getMonth())
      .reduce((sum, order) => sum + order.totalValue, 0);

    const averageTicket = orders.length
      ? orders.reduce((sum, order) => sum + order.totalValue, 0) / orders.length
      : 0;

    const successRate = analyses.length
      ? (analyses.filter((analysis) => analysis.result === "sucesso").length / analyses.length) * 100
      : 0;

    const repurchaseAlerts = metrics.filter((metric) => metric.repurchaseScore >= 80).length;

    return {
      totalCustomers: customers,
      monthlyRevenue,
      averageTicket,
      whatsappSuccessRate: successRate,
      repurchaseAlerts
    };
  });

  app.get("/dashboard/retention-capture", async (request) => {
    await request.jwtVerify();

    const [tasks, leads, analyses] = await Promise.all([
      prisma.outreachTask.findMany(),
      prisma.lead.findMany(),
      prisma.conversationAnalysis.findMany()
    ]);

    const byLane = tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.lane] = (acc[task.lane] ?? 0) + 1;
      return acc;
    }, {});

    const convertedLeads = leads.filter((lead) => lead.convertedCustomerId).length;
    const successConversations = analyses.filter((analysis) => analysis.result === "sucesso").length;

    return {
      tasksByLane: byLane,
      activeLeads: leads.length,
      convertedLeads,
      leadConversionRate: leads.length ? (convertedLeads / leads.length) * 100 : 0,
      successfulApproaches: successConversations
    };
  });
}
