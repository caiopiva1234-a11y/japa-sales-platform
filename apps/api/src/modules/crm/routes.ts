import type { FastifyInstance } from "fastify";
import dayjs from "dayjs";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";

export async function crmRoutes(app: FastifyInstance) {
  app.get("/crm/summary", async (request) => {
    await request.jwtVerify();

    const startOfToday = dayjs().startOf("day").toDate();
    const endOfToday = dayjs().endOf("day").toDate();

    const [customers, leads, pendingTasks, followUpsCustomers, followUpsLeads, leadsByStage] = await Promise.all([
      prisma.customer.count(),
      prisma.lead.count(),
      prisma.outreachTask.count({ where: { status: "pending" } }),
      prisma.customer.count({
        where: { nextFollowUpAt: { gte: startOfToday, lte: endOfToday } }
      }),
      prisma.lead.count({
        where: { nextFollowUpAt: { gte: startOfToday, lte: endOfToday } }
      }),
      prisma.lead.groupBy({
        by: ["stage"],
        _count: { _all: true }
      })
    ]);

    const stageCounts = leadsByStage.reduce<Record<string, number>>((acc, row) => {
      acc[row.stage] = row._count._all;
      return acc;
    }, {});

    return {
      customers,
      leads,
      pendingTasks,
      followUpsToday: followUpsCustomers + followUpsLeads,
      leadsByStage: stageCounts
    };
  });

  app.get("/crm/tasks", async (request) => {
    await request.jwtVerify();
    return prisma.outreachTask.findMany({
      where: { status: "pending" },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
      include: {
        customer: true,
        lead: true
      }
    });
  });

  const createTaskSchema = z.object({
    lane: z.string().min(2),
    reason: z.string().min(2),
    suggestedText: z.string().optional(),
    priority: z.coerce.number().int().min(0).max(100).default(50),
    dueInHours: z.coerce.number().min(1).max(24 * 30).default(24),
    customerId: z.string().optional(),
    leadId: z.string().optional()
  });

  app.post("/crm/tasks", async (request) => {
    await request.jwtVerify();
    const body = createTaskSchema.parse(request.body);
    if (!body.customerId && !body.leadId) {
      return { message: "Informe customerId ou leadId." };
    }

    return prisma.outreachTask.create({
      data: {
        lane: body.lane,
        reason: body.reason,
        suggestedText: body.suggestedText,
        priority: body.priority,
        dueAt: dayjs().add(body.dueInHours, "hour").toDate(),
        customerId: body.customerId,
        leadId: body.leadId
      }
    });
  });
}
