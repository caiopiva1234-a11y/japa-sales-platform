import type { FastifyInstance } from "fastify";
import dayjs from "dayjs";
import { prisma } from "../../shared/prisma.js";

export async function automationRoutes(app: FastifyInstance) {
  app.post("/automation/run/daily-priorities", async (request) => {
    await request.jwtVerify();

    const riskyCustomers = await prisma.customer.findMany({
      where: {
        metrics: {
          some: {
            repurchaseScore: { gte: 80 }
          }
        }
      },
      take: 50
    });

    await prisma.automationRun.create({
      data: {
        ruleName: "daily-priorities",
        status: "success",
        details: `Clientes priorizados: ${riskyCustomers.length}`
      }
    });

    return {
      message: "Fila comercial do dia gerada.",
      prioritizedCustomers: riskyCustomers
    };
  });

  app.post("/automation/run/retention-capture", async (request) => {
    await request.jwtVerify();

    const [customers, leads] = await Promise.all([
      prisma.customer.findMany({
        include: { orders: { orderBy: { orderDate: "desc" }, take: 1 }, metrics: true }
      }),
      prisma.lead.findMany({ where: { stage: { in: ["new", "qualified", "contacted"] } } })
    ]);

    await prisma.outreachTask.deleteMany({
      where: { dueAt: { gte: dayjs().startOf("day").toDate() }, status: "pending" }
    });

    let createdTasks = 0;
    for (const customer of customers) {
      const lastOrderDate = customer.orders[0]?.orderDate;
      if (!lastOrderDate) continue;
      const daysInactive = dayjs().diff(lastOrderDate, "day");
      let lane: "recompra" | "inativo_30" | "inativo_60" | "inativo_90" | null = null;

      if (daysInactive >= 90) lane = "inativo_90";
      else if (daysInactive >= 60) lane = "inativo_60";
      else if (daysInactive >= 30) lane = "inativo_30";
      else {
        const highRisk = customer.metrics.some((metric) => metric.repurchaseScore >= 80);
        if (highRisk) lane = "recompra";
      }

      if (!lane) continue;
      const priority = lane === "inativo_90" ? 95 : lane === "inativo_60" ? 80 : lane === "inativo_30" ? 65 : 55;
      const suggestedText =
        lane === "recompra"
          ? `Oi ${customer.name}, montei sua reposicao com base nas ultimas compras. Posso te enviar o pedido sugerido?`
          : `Oi ${customer.name}, sentimos sua falta por aqui. Quer que eu monte uma sugestao rapida de reposicao para facilitar seu pedido?`;

      await prisma.outreachTask.create({
        data: {
          customerId: customer.id,
          lane,
          priority,
          reason: `Cliente ${daysInactive} dias sem pedido.`,
          suggestedText,
          dueAt: dayjs().add(1, "hour").toDate()
        }
      });
      createdTasks += 1;
    }

    for (const lead of leads) {
      await prisma.outreachTask.create({
        data: {
          leadId: lead.id,
          lane: "captacao",
          priority: Math.max(50, lead.score || 50),
          reason: `Lead ${lead.name} em etapa ${lead.stage}.`,
          suggestedText: `Oi ${lead.name}, atendemos atacado com reposicao rapida e mix completo. Posso te mandar uma proposta inicial?`,
          dueAt: dayjs().add(2, "hour").toDate()
        }
      });
      createdTasks += 1;
    }

    await prisma.automationRun.create({
      data: {
        ruleName: "retention-capture",
        status: "success",
        details: `Tarefas criadas: ${createdTasks}`
      }
    });

    return { message: "Esteiras de retencao e captacao atualizadas.", createdTasks };
  });

  app.get("/automation/outreach-tasks", async (request) => {
    await request.jwtVerify();
    return prisma.outreachTask.findMany({
      where: { status: "pending" },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }]
    });
  });
}
