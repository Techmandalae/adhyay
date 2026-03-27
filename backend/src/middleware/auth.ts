import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { HttpError } from "./error";
import type { AuthUser } from "../types/auth";

export function isSuperAdmin(role?: AuthUser["role"]) {
  return role === "SUPER_ADMIN";
}

export function isAdmin(role?: AuthUser["role"]) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function isTeacher(role?: AuthUser["role"]) {
  return role === "TEACHER";
}

export function isStudent(role?: AuthUser["role"]) {
  return role === "STUDENT";
}

export function isParent(role?: AuthUser["role"]) {
  return role === "PARENT";
}

function ensureApproved(user?: AuthUser) {
  if (!user) {
    throw new HttpError(401, "Authentication required");
  }
  if (isSuperAdmin(user.role)) {
    return;
  }
  if (user.approvalStatus !== "APPROVED") {
    throw new HttpError(403, "Approval required");
  }
  if (user.schoolStatus && user.schoolStatus !== "ACTIVE") {
    throw new HttpError(403, "School is not active");
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next(new HttpError(401, "Authentication required"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === "string") {
      return next(new HttpError(401, "Invalid token payload"));
    }
    req.user = decoded as AuthUser;
    return next();
  } catch (_error) {
    return next(new HttpError(401, "Invalid or expired token"));
  }
}

export function requireTeacher(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new HttpError(401, "Authentication required"));
  }
  try {
    ensureApproved(req.user);
  } catch (error) {
    return next(error as Error);
  }

  if (!isTeacher(req.user.role)) {
    return next(new HttpError(403, "Teacher role required"));
  }

  if (!req.user.teacherId || !req.user.schoolId) {
    return next(new HttpError(403, "Teacher context required"));
  }

  return next();
}

export function requireTeacherOrAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return next(new HttpError(401, "Authentication required"));
  }
  try {
    ensureApproved(req.user);
  } catch (error) {
    return next(error as Error);
  }

  const role = req.user.role;
  if (!isTeacher(role) && !isAdmin(role)) {
    return next(new HttpError(403, "Teacher or admin role required"));
  }

  if (!req.user.schoolId) {
    return next(new HttpError(403, "School context required"));
  }

  if (role === "TEACHER" && !req.user.teacherId) {
    return next(new HttpError(403, "Teacher context required"));
  }

  return next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new HttpError(401, "Authentication required"));
  }
  try {
    ensureApproved(req.user);
  } catch (error) {
    return next(error as Error);
  }

  if (!isAdmin(req.user.role)) {
    return next(new HttpError(403, "Admin role required"));
  }

  if (!req.user.schoolId) {
    return next(new HttpError(403, "School context required"));
  }

  return next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new HttpError(401, "Authentication required"));
  }

  if (!isSuperAdmin(req.user.role)) {
    return next(new HttpError(403, "Super admin role required"));
  }

  return next();
}

export function requireStudent(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new HttpError(401, "Authentication required"));
  }
  try {
    ensureApproved(req.user);
  } catch (error) {
    return next(error as Error);
  }

  if (!isStudent(req.user.role)) {
    return next(new HttpError(403, "Student role required"));
  }

  const studentId = req.user.studentId ?? req.user.id;
  if (!studentId) {
    return next(new HttpError(403, "Student context required"));
  }

  return next();
}

export function requireStudentOrParent(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return next(new HttpError(401, "Authentication required"));
  }
  try {
    ensureApproved(req.user);
  } catch (error) {
    return next(error as Error);
  }

  const role = req.user.role;
  if (isStudent(role)) {
    const studentId = req.user.studentId ?? req.user.id;
    if (!studentId) {
      return next(new HttpError(403, "Student context required"));
    }
    return next();
  }

  if (isParent(role)) {
    const studentIds =
      req.user.studentIds ?? (req.user.studentId ? [req.user.studentId] : []);
    if (studentIds.length === 0) {
      return next(new HttpError(403, "Parent student context required"));
    }
    return next();
  }

  return next(new HttpError(403, "Student or parent role required"));
}

export function requireParent(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new HttpError(401, "Authentication required"));
  }
  try {
    ensureApproved(req.user);
  } catch (error) {
    return next(error as Error);
  }

  if (!isParent(req.user.role)) {
    return next(new HttpError(403, "Parent role required"));
  }

  if (!req.user.schoolId) {
    return next(new HttpError(403, "School context required"));
  }

  const studentIds = req.user.studentIds ?? (req.user.studentId ? [req.user.studentId] : []);
  if (studentIds.length === 0) {
    return next(new HttpError(403, "Parent student context required"));
  }

  return next();
}
