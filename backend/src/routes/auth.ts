import { type NextFunction, type Request, type Response, Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import type { AuthUser } from "../types/auth";
import {
  sendPasswordResetEmail,
  sendVerificationEmail
} from "../utils/email";

export const authRouter = Router();

const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
    schoolId: z.string().min(1).optional()
  })
  .strict();

const registerSchoolSchema = z
  .object({
    schoolName: z.string().trim().min(2),
    schoolEmail: z.string().email().optional(),
    adminName: z.string().trim().min(1),
    adminEmail: z.string().email().optional(),
    email: z.string().email().optional(),
    adminPassword: z.string().min(6).optional(),
    password: z.string().min(6).optional(),
    location: z.string().trim().min(1).default(""),
    adminContactNumber: z.string().trim().min(1).default(""),
    domain: z.string().trim().min(2).optional()
  })
  .strict();

const registerTeacherSchema = z
  .object({
    schoolId: z.string().min(1).optional(),
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().trim().min(1),
    employeeId: z.string().trim().min(1).optional()
  })
  .strict();

const devTokenSchema = z
  .object({
    role: z.enum(["TEACHER", "STUDENT", "PARENT", "ADMIN", "SUPER_ADMIN"]),
    schoolId: z.string().min(1),
    teacherId: z.string().min(1).optional(),
    studentId: z.string().min(1).optional(),
    studentIds: z.array(z.string().min(1)).optional(),
    parentId: z.string().min(1).optional(),
    adminId: z.string().min(1).optional(),
    classId: z.string().min(1).optional(),
    classLevel: z.coerce.number().int().min(1).max(12).optional(),
    sectionId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    email: z.string().email().optional()
  })
  .strict();

const requestPasswordResetSchema = z
  .object({
    email: z.string().email(),
    schoolId: z.string().min(1).optional()
  })
  .strict();

const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(6).optional(),
    password: z.string().min(6).optional()
  })
  .strict()
  .refine((value) => Boolean(value.newPassword ?? value.password), {
    message: "A new password is required",
    path: ["newPassword"]
  });

const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(6),
    newPassword: z.string().min(6)
  })
  .strict();

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

function buildToken(payload: AuthUser) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

function getFrontendUrl(pathname: string) {
  const frontendBase =
    env.FRONTEND_URL ?? env.CORS_ORIGIN.split(",")[0]?.trim() ?? "http://localhost:3000";
  return `${frontendBase.replace(/\/+$/, "")}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generatePublicId() {
  return `EB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function generateUniquePublicId() {
  let publicId = generatePublicId();
  // Extremely low collision risk, but keep it deterministic and cheap.
  while (await prisma.user.findFirst({ where: { publicId }, select: { id: true } })) {
    publicId = generatePublicId();
  }
  return publicId;
}

async function issueEmailVerification(userId: string, email: string) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(rawToken);
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  await sendVerificationEmail(email, getFrontendUrl(`/verify-email/${rawToken}`));
}

const handlePasswordResetRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
    const parsed = requestPasswordResetSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(400, "Invalid password reset request"));
    }

    try {
      const { email, schoolId } = parsed.data;
      const user = schoolId
        ? await prisma.user.findUnique({
            where: { schoolId_email: { schoolId, email } },
            select: { id: true, email: true, schoolId: true }
          })
        : await prisma.user.findFirst({
            where: { email, role: "SUPER_ADMIN" },
            select: { id: true, email: true, schoolId: true }
          });

      if (!user) {
        return next(new HttpError(404, "User not found"));
      }

      await prisma.passwordResetToken.deleteMany({
        where: {
          email: user.email,
          ...(schoolId ? { schoolId: user.schoolId } : { schoolId: null })
        }
      });

      const token = crypto.randomBytes(32).toString("hex");

      await prisma.passwordResetToken.create({
        data: {
          email: user.email,
          schoolId: schoolId ? user.schoolId : null,
          token,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
      });

      const frontendBase = env.FRONTEND_URL ?? env.CORS_ORIGIN.split(",")[0]?.trim() ?? "http://localhost:3000";
      const resetLink = `${frontendBase.replace(/\/+$/, "")}/reset-password/${token}`;

      await sendPasswordResetEmail(user.email, resetLink);

      res.json({ message: "Password reset link sent" });
    } catch (error) {
      next(error);
    }
  };

authRouter.post("/request-password-reset", passwordResetLimiter, handlePasswordResetRequest);
authRouter.post("/forgot-password", passwordResetLimiter, handlePasswordResetRequest);

authRouter.post("/reset-password", async (req, res, next) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid reset password request"));
  }

  try {
    const { token, newPassword, password } = parsed.data;
    const record = await prisma.passwordResetToken.findFirst({
      where: { token }
    });

    if (!record) {
      return next(new HttpError(400, "Invalid token"));
    }

    if (record.expiresAt < new Date()) {
      await prisma.passwordResetToken.delete({ where: { token: record.token } });
      return next(new HttpError(400, "Token expired"));
    }

    const resolvedPassword = newPassword ?? password;
    if (!resolvedPassword) {
      return next(new HttpError(400, "New password is required"));
    }

    const hashedPassword = await bcrypt.hash(resolvedPassword, 12);

    const user = record.schoolId
      ? await prisma.user.findUnique({
          where: { schoolId_email: { schoolId: record.schoolId, email: record.email } },
          select: { id: true }
        })
      : await prisma.user.findFirst({
          where: { email: record.email, role: "SUPER_ADMIN" },
          select: { id: true }
        });

    if (!user) {
      await prisma.passwordResetToken.delete({ where: { token: record.token } });
      return next(new HttpError(404, "User not found"));
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword }
    });

    await prisma.passwordResetToken.delete({ where: { token: record.token } });

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid change password request"));
  }

  try {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true }
    });

    if (!existingUser) {
      return next(new HttpError(404, "User not found"));
    }

    const valid = await bcrypt.compare(parsed.data.oldPassword, existingUser.passwordHash);
    if (!valid) {
      return next(new HttpError(400, "Wrong password"));
    }

    const hash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { passwordHash: hash }
    });

    res.json({ message: "Password updated" });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/request-email-verification", requireAuth, async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        emailVerified: true
      }
    });

    if (!existingUser) {
      return next(new HttpError(404, "User not found"));
    }

    if (existingUser.emailVerified) {
      return res.json({ message: "Email already verified" });
    }

    await issueEmailVerification(existingUser.id, existingUser.email);
    return res.json({ message: "Verification email sent" });
  } catch (error) {
    return next(error);
  }
});

authRouter.get("/verify-email/:token", async (req, res, next) => {
  try {
    const token = hashToken(req.params.token);
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: {
          gt: new Date()
        }
      },
      select: { id: true }
    });

    if (!user) {
      return next(new HttpError(400, "Invalid verification token"));
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null
      }
    });

    res.redirect(getFrontendUrl("/signin"));
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid login request", details));
  }

  try {
    const { email, password, schoolId } = parsed.data;
    const user = schoolId
      ? await prisma.user.findUnique({
          where: { schoolId_email: { schoolId, email } },
          include: {
            teacherProfile: true,
            studentProfile: true,
            parentProfile: {
              include: {
                children: {
                  include: { student: true }
                }
              }
            },
            adminProfile: true,
            school: { select: { meta: true, status: true, isIndependentWorkspace: true } }
          }
        })
      : await prisma.user.findFirst({
          where: { email, role: "SUPER_ADMIN" },
          include: {
            teacherProfile: true,
            studentProfile: true,
            parentProfile: {
              include: {
                children: {
                  include: { student: true }
                }
              }
            },
            adminProfile: true,
            school: { select: { meta: true, status: true, isIndependentWorkspace: true } }
          }
        });

    if (!schoolId && !user) {
      return next(new HttpError(400, "School ID is required"));
    }

    if (!user || !user.isActive) {
      return next(new HttpError(401, "Invalid email or password"));
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return next(new HttpError(401, "Invalid email or password"));
    }

    if (user.role !== "SUPER_ADMIN") {
      if (!user.emailVerified) {
        return next(new HttpError(403, "Please verify your email before logging in."));
      }
      if (user.approvalStatus !== "APPROVED") {
        return next(new HttpError(403, "Approval required"));
      }
      if (user.school?.status !== "ACTIVE") {
        return next(new HttpError(403, "School is not active"));
      }
    }

    const parentPrimaryStudent = user.parentProfile?.children[0]?.student ?? null;
    const isIndependentTeacher = Boolean(
      user.role === "TEACHER" &&
        (user.teacherProfile?.isIndependent || user.school?.isIndependentWorkspace)
    );
    const payload: AuthUser = {
      id: user.id,
      role: user.role,
      schoolId: user.schoolId,
      ...(user.teacherProfile ? { teacherId: user.teacherProfile.id } : {}),
      ...(user.studentProfile
        ? {
            studentId: user.studentProfile.id,
            classId: user.studentProfile.classId,
            classLevel: user.studentProfile.classLevel,
            ...(user.studentProfile.sectionId
              ? { sectionId: user.studentProfile.sectionId }
              : {})
          }
        : {}),
      ...(user.parentProfile ? { parentId: user.parentProfile.id } : {}),
      ...(user.adminProfile ? { adminId: user.adminProfile.id } : {}),
      ...(user.parentProfile
        ? {
            studentIds: user.parentProfile.children.map((link) => link.studentId),
            ...(parentPrimaryStudent
              ? {
                  classId: parentPrimaryStudent.classId,
                  classLevel: parentPrimaryStudent.classLevel,
                  ...(parentPrimaryStudent.sectionId
                    ? { sectionId: parentPrimaryStudent.sectionId }
                    : {})
                }
              : {})
          }
        : {}),
      ...(user.name ? { name: user.name } : {}),
      ...(user.email ? { email: user.email } : {}),
      ...(user.publicId ? { publicId: user.publicId } : {}),
      ...(user.role === "TEACHER"
        ? {
            canPublish: !isIndependentTeacher,
            isIndependentTeacher
          }
        : {}),
      emailVerified: user.emailVerified,
      ...(user.school?.meta ? { schoolMeta: user.school.meta as Record<string, unknown> } : {}),
      ...(user.school?.status ? { schoolStatus: user.school.status } : {}),
      ...(user.approvalStatus ? { approvalStatus: user.approvalStatus } : {})
    };

    const token = buildToken(payload);
    return res.status(200).json({ token, user: payload });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/register-school", async (req, res, next) => {
  const parsed = registerSchoolSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid school registration request", details));
  }

  try {
    const payload = parsed.data;
    const schoolEmail = payload.schoolEmail ?? payload.email ?? payload.adminEmail;
    const adminEmail = payload.adminEmail ?? payload.email ?? payload.schoolEmail;
    const adminPassword = payload.adminPassword ?? payload.password;
    if (!schoolEmail || !adminEmail || !adminPassword) {
      return next(
        new HttpError(400, "School email, admin email, and password are required")
      );
    }
    const school = await prisma.school.create({
      data: {
        name: payload.schoolName,
        email: schoolEmail,
        location: payload.location,
        status: "PENDING",
        isIndependentWorkspace: false,
        aiMonthlyLimit: 0,
        domain: payload.domain ?? null
      }
    });

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const adminPublicId = await generateUniquePublicId();
    const admin = await prisma.user.create({
      data: {
        publicId: adminPublicId,
        schoolId: school.id,
        email: adminEmail,
        passwordHash,
        emailVerified: false,
        role: "ADMIN",
        name: payload.adminName,
        approvalStatus: "APPROVED",
        isActive: true,
        adminProfile: {
          create: {
            schoolId: school.id,
            title: "Principal",
            fullName: payload.adminName,
            email: adminEmail,
            contact: payload.adminContactNumber,
            location: payload.location,
            contactNumber: payload.adminContactNumber
          }
        }
      }
    });

    void issueEmailVerification(admin.id, adminEmail).catch((error) => {
      console.error("Failed to send admin verification email", error);
    });

    return res.status(201).json({
      schoolId: school.id,
      adminId: admin.id,
      status: school.status
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/register-teacher", async (req, res, next) => {
  const parsed = registerTeacherSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid teacher registration request", details));
  }

  try {
    const requestedSchoolId = parsed.data.schoolId?.trim() || null;
    const school = requestedSchoolId
      ? await prisma.school.findUnique({
          where: { id: requestedSchoolId }
        })
      : null;
    if (requestedSchoolId && (!school || school.status !== "ACTIVE")) {
      return next(new HttpError(403, "School is not active"));
    }

    const targetSchool =
      school ??
      (await prisma.school.create({
        data: {
          name: `${parsed.data.name} Workspace`,
          email: parsed.data.email,
          location: "",
          status: "ACTIVE",
          isIndependentWorkspace: true,
          aiMonthlyLimit: 0
        }
      }));

    const existing = await prisma.user.findUnique({
      where: {
        schoolId_email: { schoolId: targetSchool.id, email: parsed.data.email }
      }
    });
    if (existing) {
      return next(new HttpError(409, "Teacher already registered"));
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const teacherPublicId = await generateUniquePublicId();
    const teacher = await prisma.user.create({
      data: {
        publicId: teacherPublicId,
        schoolId: targetSchool.id,
        email: parsed.data.email,
        passwordHash,
        emailVerified: false,
        role: "TEACHER",
        name: parsed.data.name,
        approvalStatus: "APPROVED",
        isActive: true,
        teacherProfile: {
          create: {
            schoolId: targetSchool.id,
            fullName: parsed.data.name,
            email: parsed.data.email,
            contact: "",
            subject: "",
            location: targetSchool.location,
            experience: "",
            education: "",
            employeeId: parsed.data.employeeId ?? null,
            isIndependent: targetSchool.isIndependentWorkspace
          }
        }
      },
      include: { teacherProfile: true }
    });

    void issueEmailVerification(teacher.id, parsed.data.email).catch((error) => {
      console.error("Failed to send teacher verification email", error);
    });

    if (teacher.teacherProfile && !targetSchool.isIndependentWorkspace) {
      const classes = await prisma.academicClass.findMany({
        where: { schoolId: targetSchool.id },
        select: { id: true }
      });
      if (classes.length > 0) {
        await prisma.teacherClass.createMany({
          data: classes.map((klass) => ({
            schoolId: targetSchool.id,
            teacherId: teacher.teacherProfile!.id,
            classId: klass.id
          })),
          skipDuplicates: true
        });
      }
    }

    return res.status(201).json({
      id: teacher.id,
      approvalStatus: teacher.approvalStatus,
      schoolId: targetSchool.id,
      canPublish: !targetSchool.isIndependentWorkspace
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/register-student", (_req, _res, next) => {
  return next(
    new HttpError(410, "Student registration is managed by school admins through imports")
  );
});

authRouter.post("/register-parent", (_req, _res, next) => {
  return next(
    new HttpError(410, "Parent accounts are created automatically when students are imported")
  );
});

authRouter.get("/me", async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    return next(new HttpError(401, "Authentication required"));
  }
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") {
    return next(new HttpError(401, "Authentication required"));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === "string") {
      return next(new HttpError(401, "Invalid token"));
    }
    return res.status(200).json({ user: decoded });
  } catch (_error) {
    return next(new HttpError(401, "Invalid or expired token"));
  }
});

authRouter.post("/dev-token", (req, res, next) => {
  if (env.NODE_ENV === "production") {
    return next(new HttpError(404, "Not found"));
  }

  const parsed = devTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid dev token request", details));
  }

  const payload = parsed.data;
  const isTeacher = payload.role === "TEACHER";
  const isStudent = payload.role === "STUDENT";
  const isParent = payload.role === "PARENT";

  const id = isTeacher
    ? payload.teacherId ?? "dev-teacher"
    : isStudent
      ? payload.studentId ?? "dev-student"
      : isParent
        ? payload.parentId ?? "dev-parent"
        : payload.role === "SUPER_ADMIN"
          ? "dev-super-admin"
          : "dev-admin";

  const tokenPayload: AuthUser = {
    id,
    role: payload.role,
    schoolId: payload.schoolId,
    publicId: `EB-${id.toUpperCase()}`,
    ...(payload.teacherId ? { teacherId: payload.teacherId } : {}),
    ...(payload.studentId ? { studentId: payload.studentId } : {}),
    ...(payload.studentIds ? { studentIds: payload.studentIds } : {}),
    ...(payload.parentId ? { parentId: payload.parentId } : {}),
    ...(payload.adminId ? { adminId: payload.adminId } : {}),
    ...(payload.classId ? { classId: payload.classId } : {}),
    ...(payload.classLevel ? { classLevel: payload.classLevel } : {}),
    ...(payload.sectionId ? { sectionId: payload.sectionId } : {}),
    ...(payload.name ? { name: payload.name } : {}),
    ...(payload.email ? { email: payload.email } : {}),
    approvalStatus: "APPROVED",
    schoolStatus: "ACTIVE"
  };

  const token = buildToken(tokenPayload);
  return res.status(200).json({ token, user: tokenPayload });
});
