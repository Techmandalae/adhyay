import { Router } from "express";
import { z } from "zod";

import {
  buildAdminAnalytics,
  buildParentAnalytics,
  buildStudentAnalytics,
  buildTeacherAnalytics
} from "../services/analytics.service";
import {
  requireAdmin,
  requireParent,
  requireStudent,
  requireTeacherOrAdmin
} from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { prisma } from "../db/prisma";

export const analyticsRouter = Router();

const dateSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed;
}, z.date().optional());

const difficultySchema = z.preprocess(
  (value) => (typeof value === "string" ? value.toLowerCase() : value),
  z.enum(["easy", "medium", "hard"])
);

const analyticsQuerySchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  subject: z.string().trim().min(1).optional(),
  classLevel: z.coerce.number().int().min(1).max(12).optional(),
  difficulty: difficultySchema.optional(),
  studentIds: z.string().optional(),
  teacherId: z.string().optional()
});

function parseStudentIds(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function validateDateRange(startDate?: Date, endDate?: Date) {
  if (startDate && endDate && startDate > endDate) {
    return false;
  }
  return true;
}

analyticsRouter.get("/student", requireStudent, async (req, res, next) => {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid analytics request", details));
  }

  try {
    if (!validateDateRange(parsed.data.startDate, parsed.data.endDate)) {
      return next(new HttpError(400, "Invalid date range"));
    }
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }

    const studentId = user.studentId ?? user.id;
    if (!studentId) {
      return next(new HttpError(403, "Student context required"));
    }

    const analytics = await buildStudentAnalytics({
      schoolId: user.schoolId,
      studentId,
      ...(parsed.data.startDate ? { startDate: parsed.data.startDate } : {}),
      ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
      ...(parsed.data.subject ? { subject: parsed.data.subject } : {}),
      ...(parsed.data.classLevel !== undefined
        ? { classLevel: parsed.data.classLevel }
        : {}),
      ...(parsed.data.difficulty ? { difficulty: parsed.data.difficulty } : {})
    });

    return res.status(200).json(analytics);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get("/student/:id", requireParent, async (req, res, next) => {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid analytics request", details));
  }

  try {
    if (!validateDateRange(parsed.data.startDate, parsed.data.endDate)) {
      return next(new HttpError(400, "Invalid date range"));
    }
    const user = req.user;
    if (!user?.parentId) {
      return next(new HttpError(403, "Parent context required"));
    }
    const studentIdParam = req.params.id;
    const studentId = Array.isArray(studentIdParam) ? studentIdParam[0] : studentIdParam;
    if (!studentId) {
      return next(new HttpError(400, "Student id is required"));
    }

    const link = await prisma.parentStudent.findFirst({
      where: { parentId: user.parentId, studentId, schoolId: user.schoolId }
    });

    if (!link) {
      return next(new HttpError(403, "Parent does not have access to student"));
    }

    const analytics = await buildStudentAnalytics({
      schoolId: user.schoolId,
      studentId,
      ...(parsed.data.startDate ? { startDate: parsed.data.startDate } : {}),
      ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
      ...(parsed.data.subject ? { subject: parsed.data.subject } : {}),
      ...(parsed.data.classLevel !== undefined
        ? { classLevel: parsed.data.classLevel }
        : {}),
      ...(parsed.data.difficulty ? { difficulty: parsed.data.difficulty } : {})
    });

    return res.status(200).json(analytics);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get("/parent", requireParent, async (req, res, next) => {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid analytics request", details));
  }

  try {
    if (!validateDateRange(parsed.data.startDate, parsed.data.endDate)) {
      return next(new HttpError(400, "Invalid date range"));
    }
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }

    const allowedStudentIds = user.studentIds ?? (user.studentId ? [user.studentId] : []);
    const requestedIds = parseStudentIds(parsed.data.studentIds);
    const studentIds = requestedIds.length > 0 ? requestedIds : allowedStudentIds;

    const unauthorized = studentIds.some((id) => !allowedStudentIds.includes(id));
    if (unauthorized || studentIds.length === 0) {
      return next(new HttpError(403, "Parent does not have access to requested students"));
    }

    const analytics = await buildParentAnalytics({
      schoolId: user.schoolId,
      studentIds,
      ...(parsed.data.startDate ? { startDate: parsed.data.startDate } : {}),
      ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
      ...(parsed.data.subject ? { subject: parsed.data.subject } : {}),
      ...(parsed.data.classLevel !== undefined
        ? { classLevel: parsed.data.classLevel }
        : {}),
      ...(parsed.data.difficulty ? { difficulty: parsed.data.difficulty } : {})
    });

    return res.status(200).json(analytics);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get(
  "/teacher",
  requireTeacherOrAdmin,
  async (req, res, next) => {
    const parsed = analyticsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }));
      return next(new HttpError(400, "Invalid analytics request", details));
    }

    try {
      if (!validateDateRange(parsed.data.startDate, parsed.data.endDate)) {
        return next(new HttpError(400, "Invalid date range"));
      }
      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const teacherId =
        user.role === "TEACHER" ? user.teacherId ?? null : parsed.data.teacherId ?? null;

      if (user.role === "TEACHER" && !teacherId) {
        return next(new HttpError(403, "Teacher context required"));
      }

      const analytics = await buildTeacherAnalytics({
        schoolId: user.schoolId,
        ...(teacherId ? { teacherId } : {}),
        ...(parsed.data.startDate ? { startDate: parsed.data.startDate } : {}),
        ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
        ...(parsed.data.subject ? { subject: parsed.data.subject } : {}),
        ...(parsed.data.classLevel !== undefined
          ? { classLevel: parsed.data.classLevel }
          : {}),
        ...(parsed.data.difficulty ? { difficulty: parsed.data.difficulty } : {})
      });

      return res.status(200).json(analytics);
    } catch (error) {
      return next(error);
    }
  }
);

analyticsRouter.get("/admin", requireAdmin, async (req, res, next) => {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid analytics request", details));
  }

  try {
    if (!validateDateRange(parsed.data.startDate, parsed.data.endDate)) {
      return next(new HttpError(400, "Invalid date range"));
    }
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }

    const analytics = await buildAdminAnalytics({
      schoolId: user.schoolId,
      ...(parsed.data.startDate ? { startDate: parsed.data.startDate } : {}),
      ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
      ...(parsed.data.subject ? { subject: parsed.data.subject } : {}),
      ...(parsed.data.classLevel !== undefined
        ? { classLevel: parsed.data.classLevel }
        : {}),
      ...(parsed.data.difficulty ? { difficulty: parsed.data.difficulty } : {})
    });

    return res.status(200).json(analytics);
  } catch (error) {
    return next(error);
  }
});
