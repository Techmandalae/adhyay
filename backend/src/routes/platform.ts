import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db/prisma";
import { requireSuperAdmin } from "../middleware/auth";
import { HttpError } from "../middleware/error";

export const platformRouter = Router();

platformRouter.use(requireSuperAdmin);

platformRouter.get("/schools", async (_req, res, next) => {
  try {
    const schools = await prisma.school.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        aiMonthlyLimit: true,
        createdAt: true,
        users: {
          where: { role: "ADMIN" },
          select: {
            id: true,
            email: true,
            approvalStatus: true,
            isActive: true
          }
        }
      }
    });

    res.json({ items: schools });
  } catch (error) {
    next(error);
  }
});

platformRouter.get("/overview", async (_req, res, next) => {
  try {
    const [schoolsRegistered, teachersRegistered, examsGenerated, aiUsage] =
      await Promise.all([
        prisma.school.count(),
        prisma.user.count({ where: { role: "TEACHER" } }),
        prisma.exam.count(),
        prisma.aiUsage.aggregate({
          _sum: {
            totalTokens: true,
            promptTokens: true,
            completionTokens: true
          },
          _count: {
            _all: true
          }
        })
      ]);

    res.json({
      schoolsRegistered,
      teachersRegistered,
      examsGenerated,
      aiUsage: {
        totalRequests: aiUsage._count._all,
        totalTokens: aiUsage._sum.totalTokens ?? 0,
        promptTokens: aiUsage._sum.promptTokens ?? 0,
        completionTokens: aiUsage._sum.completionTokens ?? 0
      }
    });
  } catch (error) {
    next(error);
  }
});

const approveSchema = z
  .object({
    aiMonthlyLimit: z.coerce.number().int().min(0).optional(),
    monthlyExamLimit: z.coerce.number().int().min(0).optional()
  })
  .strict();

platformRouter.post("/schools/:id/approve", async (req, res, next) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid approval request"));
  }

  try {
    const schoolId = req.params.id;
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      return next(new HttpError(404, "School not found"));
    }

    const resolvedLimit =
      parsed.data.monthlyExamLimit !== undefined
        ? parsed.data.monthlyExamLimit
        : parsed.data.aiMonthlyLimit;

    const updated = await prisma.$transaction(async (tx) => {
      const updatedSchool = await tx.school.update({
        where: { id: schoolId },
        data: {
          status: "ACTIVE",
          ...(resolvedLimit !== undefined ? { aiMonthlyLimit: resolvedLimit } : {})
        }
      });

      await tx.user.updateMany({
        where: { schoolId, role: "ADMIN" },
        data: { approvalStatus: "APPROVED", isActive: true }
      });

      return updatedSchool;
    });

    res.json({ id: updated.id, status: updated.status, aiMonthlyLimit: updated.aiMonthlyLimit });
  } catch (error) {
    next(error);
  }
});

platformRouter.post("/schools/:id/suspend", async (req, res, next) => {
  try {
    const schoolId = req.params.id;
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      return next(new HttpError(404, "School not found"));
    }

    const updated = await prisma.school.update({
      where: { id: schoolId },
      data: { status: "SUSPENDED" }
    });

    res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    next(error);
  }
});
