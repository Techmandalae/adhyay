import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db/prisma";
import { requireParent } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { buildParentAnalytics } from "../services/analytics.service";

export const parentRouter = Router();

parentRouter.use(requireParent);

parentRouter.get("/children", async (req, res, next) => {
  try {
    const user = req.user;
    if (!user?.parentId) {
      return next(new HttpError(403, "Parent context required"));
    }

    const links = await prisma.parentStudent.findMany({
      where: { parentId: user.parentId, schoolId: user.schoolId },
      include: { student: { include: { user: true, class: true } } }
    });

    const items = links.map((link) => ({
      id: link.student.id,
      name: link.student.user.name ?? link.student.user.email,
      email: link.student.user.email,
      classId: link.student.classId,
      classLevel: link.student.classLevel,
      rollNumber: link.student.rollNumber
    }));

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

const analyticsQuerySchema = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })
  .strict();

parentRouter.get("/children/:studentId/analytics", async (req, res, next) => {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid analytics request"));
  }

  try {
    const user = req.user;
    if (!user?.parentId) {
      return next(new HttpError(403, "Parent context required"));
    }

    const studentId = req.params.studentId;
    const link = await prisma.parentStudent.findFirst({
      where: { parentId: user.parentId, studentId, schoolId: user.schoolId }
    });

    if (!link) {
      return next(new HttpError(403, "Parent does not have access to student"));
    }

    const startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : undefined;
    const endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : undefined;

    const analytics = await buildParentAnalytics({
      schoolId: user.schoolId,
      studentIds: [studentId],
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {})
    });

    res.json(analytics);
  } catch (error) {
    next(error);
  }
});
