import { Router } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import bcrypt from "bcrypt";
import { Readable } from "stream";
import XLSX from "xlsx";
import { z } from "zod";

import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { requireAdmin } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { sendLoginDetailsEmail } from "../utils/email";

const csvParser = require("csv-parser") as () => NodeJS.ReadWriteStream;

export const adminRouter = Router();

adminRouter.use(requireAdmin);

const listSchema = z
  .object({
    role: z.enum(["TEACHER", "STUDENT", "PARENT"]).optional(),
    query: z.string().trim().min(1).optional()
  })
  .strict();

const createSchema = z
  .object({
    role: z.enum(["TEACHER", "STUDENT", "PARENT"]),
    email: z.string().email(),
    name: z.string().min(1).optional(),
    password: z.string().min(6),
    classId: z.string().min(1).optional(),
    sectionId: z.string().min(1).optional()
  })
  .strict();

const updateSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
    password: z.string().min(6).optional(),
    isActive: z.boolean().optional(),
    classId: z.string().min(1).optional(),
    sectionId: z.string().min(1).optional()
  })
  .strict();

const linkSchema = z
  .object({
    studentId: z.string().min(1)
  })
  .strict();

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_LOGO_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new HttpError(400, "Only PNG, JPEG, and WEBP logos are allowed"));
  },
  limits: {
    fileSize: Math.min(env.UPLOAD_MAX_BYTES, 2 * 1024 * 1024)
  }
});
const uploadStudentImport = multer();

const academicSetupSchema = z
  .object({
    classes: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          hasStreams: z.boolean().optional(),
          sections: z.array(z.string().trim().min(1)).default([])
        })
      )
      .min(1)
  })
  .strict();

const importStudentRowSchema = z
  .object({
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    password: z.string().trim().min(6).optional(),
    className: z.string().trim().min(1),
    sectionName: z.string().trim().min(1),
    parentEmail: z.string().trim().email(),
    parentName: z.string().trim().min(1).optional(),
    rollNumber: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    location: z.string().trim().optional(),
    dob: z.string().trim().optional()
  })
  .strict();

const importTeacherRowSchema = z
  .object({
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    password: z.string().trim().min(6).optional(),
    phone: z.string().trim().optional(),
    subject: z.string().trim().optional()
  })
  .strict();

type ImportIssue = {
  rowNumber: number;
  message: string;
  values: Record<string, string>;
};

type ParsedImportResult<T> = {
  validRows: Array<T & { rowNumber: number; values: Record<string, string> }>;
  errors: ImportIssue[];
  totalRows: number;
};

const STREAM_SUBJECTS: Record<string, string[]> = {
  Science: ["Physics", "Chemistry", "Mathematics", "Biology"],
  Commerce: ["Accountancy", "Business Studies", "Economics"],
  Arts: ["Political Science", "History", "Geography"]
};

const COMMON_SUBJECTS = ["Mathematics", "Science", "Social Science", "English", "Hindi"];
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function getLogoExtension(mimeType: string, originalName: string) {
  return (
    {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp"
    }[mimeType] ??
    path.extname(originalName || "").toLowerCase() ??
    ".png"
  );
}

function getClassLevel(name: string): number | null {
  const match = name.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function compareClassNames(left: string, right: string) {
  const leftLevel = getClassLevel(left);
  const rightLevel = getClassLevel(right);

  if (leftLevel !== null && rightLevel !== null && leftLevel !== rightLevel) {
    return leftLevel - rightLevel;
  }

  if (leftLevel !== null && rightLevel === null) {
    return -1;
  }

  if (leftLevel === null && rightLevel !== null) {
    return 1;
  }

  return left.localeCompare(right);
}

function buildSubjectPoolForSections(sections: string[], hasStreams: boolean) {
  if (!hasStreams) {
    return COMMON_SUBJECTS;
  }
  const pool = new Set<string>();
  sections.forEach((section) => {
    const subjects = STREAM_SUBJECTS[section] ?? [];
    subjects.forEach((subject) => pool.add(subject));
  });
  return Array.from(pool);
}

function normalizeImportKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

function normalizeImportRow(row: Record<string, unknown>) {
  return Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[normalizeImportKey(key)] =
      typeof value === "string" ? value.trim() : String(value ?? "").trim();
    return acc;
  }, {});
}

function firstNonEmptyValue(
  row: Record<string, string>,
  ...keys: string[]
) {
  return keys.map((key) => row[key]).find((value) => typeof value === "string" && value.trim().length > 0);
}

function parseImportedClassLevel(value: string) {
  const match = value.match(/(\d{1,2})/);
  if (!match) {
    return null;
  }
  const level = Number(match[1]);
  return Number.isFinite(level) ? level : null;
}

function generateTemporaryPassword() {
  return `Temp@${Math.floor(1000 + Math.random() * 9000)}`;
}

function createMustChangePasswordToken() {
  return `must-change-password:${crypto.randomBytes(16).toString("hex")}`;
}

function generatePublicId() {
  return `EB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function generateUniquePublicId() {
  let publicId = generatePublicId();
  while (await prisma.user.findFirst({ where: { publicId }, select: { id: true } })) {
    publicId = generatePublicId();
  }
  return publicId;
}

async function sendUserOnboardingEmail(params: {
  to: string;
  userId: string;
  schoolId: string;
  email: string;
  role: "TEACHER" | "STUDENT" | "PARENT";
  tempPassword: string;
}) {
  await prisma.passwordResetToken.deleteMany({
    where: {
      email: params.email,
      schoolId: params.schoolId,
      token: {
        startsWith: "must-change-password:"
      }
    }
  });

  await prisma.passwordResetToken.create({
    data: {
      email: params.email,
      schoolId: params.schoolId,
      token: createMustChangePasswordToken(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  const sent = await sendLoginDetailsEmail({
    to: params.to,
    userId: params.userId,
    schoolId: params.schoolId,
    email: params.email,
    tempPassword: params.tempPassword
  });

  if (!sent) {
    console.warn("[email] onboarding email was not sent", {
      email: params.email,
      schoolId: params.schoolId,
      userId: params.userId,
      role: params.role
    });
  }
}

async function parseCsvRows(buffer: Buffer) {
  return new Promise<Record<string, string>[]>((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    Readable.from(buffer)
      .pipe(csvParser())
      .on("data", (row) => rows.push(row as Record<string, string>))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function mapImportRows(rows: Record<string, unknown>[]): ParsedImportResult<z.infer<typeof importStudentRowSchema>> {
  const errors: ImportIssue[] = [];
  const validRows: Array<
    z.infer<typeof importStudentRowSchema> & { rowNumber: number; values: Record<string, string> }
  > = [];

  rows.forEach((row, index) => {
    const normalized = normalizeImportRow(row);
    const candidate = {
      name: firstNonEmptyValue(normalized, "name", "studentname"),
      email: firstNonEmptyValue(normalized, "email", "studentemail"),
      password: firstNonEmptyValue(normalized, "password"),
      className: firstNonEmptyValue(normalized, "classname", "class"),
      sectionName: firstNonEmptyValue(normalized, "sectionname", "section"),
      parentEmail: firstNonEmptyValue(normalized, "parentemail"),
      parentName: firstNonEmptyValue(normalized, "parentname"),
      rollNumber: firstNonEmptyValue(normalized, "rollnumber"),
      phone: firstNonEmptyValue(normalized, "phone", "phonenumber"),
      location: firstNonEmptyValue(normalized, "location"),
      dob: firstNonEmptyValue(normalized, "dob", "dateofbirth")
    };

    const parsed = importStudentRowSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({
        rowNumber: index + 2,
        message: parsed.error.issues.map((issue) => issue.message).join("; "),
        values: normalized
      });
      return;
    }

    validRows.push({
      ...parsed.data,
      rowNumber: index + 2,
      values: normalized
    });
  });

  return {
    validRows,
    errors,
    totalRows: rows.length
  };
}

function mapTeacherImportRows(
  rows: Record<string, unknown>[]
): ParsedImportResult<z.infer<typeof importTeacherRowSchema>> {
  const errors: ImportIssue[] = [];
  const validRows: Array<
    z.infer<typeof importTeacherRowSchema> & { rowNumber: number; values: Record<string, string> }
  > = [];

  rows.forEach((row, index) => {
    const normalized = normalizeImportRow(row);
    const candidate = {
      name: firstNonEmptyValue(normalized, "name"),
      email: firstNonEmptyValue(normalized, "email"),
      password: firstNonEmptyValue(normalized, "password"),
      phone: firstNonEmptyValue(normalized, "phone", "contact"),
      subject: firstNonEmptyValue(normalized, "subject")
    };

    const parsed = importTeacherRowSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({
        rowNumber: index + 2,
        message: parsed.error.issues.map((issue) => issue.message).join("; "),
        values: normalized
      });
      return;
    }

    validRows.push({
      ...parsed.data,
      rowNumber: index + 2,
      values: normalized
    });
  });

  return {
    validRows,
    errors,
    totalRows: rows.length
  };
}

async function parseImportFile(
  file: { buffer: Buffer; originalname: string },
  mapper: (rows: Record<string, unknown>[]) => unknown
) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  if (extension === ".csv") {
    const rows = await parseCsvRows(file.buffer);
    return mapper(rows);
  }

  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new HttpError(400, "Uploaded file does not contain any sheets");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: ""
  });
  return mapper(rows);
}

adminRouter.get("/metrics", async (req, res, next) => {
  try {
    const admin = req.user!;
    const [totalExamsGenerated, activeTeachers] = await Promise.all([
      prisma.examPaper.count({ where: { schoolId: admin.schoolId } }),
      prisma.user.count({
        where: {
          schoolId: admin.schoolId,
          role: "TEACHER",
          approvalStatus: "APPROVED",
          isActive: true
        }
      })
    ]);

    res.json({ totalExamsGenerated, activeTeachers });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/users", async (req, res, next) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid user list request"));
  }

  try {
    const user = req.user!;
    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      role: parsed.data.role ?? undefined
    };

    if (parsed.data.query) {
      where.OR = [
        { email: { contains: parsed.data.query, mode: "insensitive" } },
        { name: { contains: parsed.data.query, mode: "insensitive" } }
      ];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        teacherProfile: true,
        studentProfile: true,
        parentProfile: true
      }
    });

    const items = users.map((item) => ({
      id: item.id,
      role: item.role,
      email: item.email,
      name: item.name,
      isActive: item.isActive,
      approvalStatus: item.approvalStatus,
      createdAt: item.createdAt.toISOString(),
      teacherId: item.teacherProfile?.id ?? null,
      studentId: item.studentProfile?.id ?? null,
      parentId: item.parentProfile?.id ?? null,
      classId: item.studentProfile?.classId ?? null,
      classLevel: item.studentProfile?.classLevel ?? null,
      sectionId: item.studentProfile?.sectionId ?? null
    }));

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/users", async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid create user request", details));
  }

  try {
    const admin = req.user!;
    const tempPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const publicId = await generateUniquePublicId();

    if (parsed.data.role === "STUDENT" && !parsed.data.classId) {
      return next(new HttpError(400, "classId is required for student"));
    }

    const classRecord = parsed.data.classId
      ? await prisma.academicClass.findFirst({
          where: { id: parsed.data.classId, schoolId: admin.schoolId }
        })
      : null;

    if (parsed.data.classId && !classRecord) {
      return next(new HttpError(404, "Class not found"));
    }

    let sectionId: string | null = null;
    let sectionName = "";
    if (parsed.data.sectionId) {
      if (!classRecord) {
        return next(new HttpError(400, "classId is required for section assignment"));
      }
      if (!classRecord.classStandardId) {
        return next(new HttpError(400, "Class standard is missing for section assignment"));
      }
      const section = await prisma.academicSection.findFirst({
        where: {
          id: parsed.data.sectionId,
          classStandardId: classRecord.classStandardId,
          schoolId: admin.schoolId
        },
        select: { id: true, name: true }
      });
      if (!section) {
        return next(new HttpError(404, "Section not found"));
      }
      sectionId = section.id;
      sectionName = section.name;
    }

    const created = await prisma.user.create({
      data: {
        publicId,
        schoolId: admin.schoolId,
        email: parsed.data.email,
        passwordHash,
        isVerified: true,
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        role: parsed.data.role,
        name: parsed.data.name ?? null,
        approvalStatus: "APPROVED",
        isActive: true,
        ...(parsed.data.role === "TEACHER"
          ? {
              teacherProfile: {
                create: {
                  schoolId: admin.schoolId,
                  fullName: parsed.data.name ?? "",
                  email: parsed.data.email
                }
              }
            }
          : {}),
        ...(parsed.data.role === "STUDENT"
          ? {
              studentProfile: {
                create: {
                  schoolId: admin.schoolId,
                  fullName: parsed.data.name ?? "",
                  className: classRecord!.name,
                  sectionName,
                  classId: classRecord!.id,
                  classLevel: classRecord!.classLevel,
                  sectionId,
                  email: parsed.data.email
                }
              }
            }
          : {}),
        ...(parsed.data.role === "PARENT"
          ? {
              parentProfile: {
                create: {
                  schoolId: admin.schoolId,
                  fullName: parsed.data.name ?? "",
                  email: parsed.data.email
                }
              }
            }
          : {})
      },
      include: {
        teacherProfile: true,
        studentProfile: true,
        parentProfile: true
      }
    });

    res.status(201).json({
      id: created.id,
      role: created.role,
      email: created.email,
      name: created.name,
      isActive: created.isActive,
      approvalStatus: created.approvalStatus,
      teacherId: created.teacherProfile?.id ?? null,
      studentId: created.studentProfile?.id ?? null,
      parentId: created.parentProfile?.id ?? null,
      classId: created.studentProfile?.classId ?? null,
      classLevel: created.studentProfile?.classLevel ?? null,
      sectionId: created.studentProfile?.sectionId ?? null
    });

    if (parsed.data.role === "TEACHER" && created.teacherProfile) {
      const classes = await prisma.academicClass.findMany({
        where: { schoolId: admin.schoolId },
        select: { id: true }
      });
      if (classes.length > 0) {
        await prisma.teacherClass.createMany({
          data: classes.map((klass) => ({
            schoolId: admin.schoolId,
            teacherId: created.teacherProfile!.id,
            classId: klass.id
          })),
          skipDuplicates: true
        });
      }
    }

    void sendUserOnboardingEmail({
      to: created.email,
      userId: created.publicId,
      schoolId: admin.schoolId,
      email: created.email,
      role: parsed.data.role,
      tempPassword
    }).catch((error) => {
      console.error("Failed to send onboarding email", error);
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/users/:id", async (req, res, next) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid update user request", details));
  }

  try {
    const admin = req.user!;
    const userId = req.params.id;

    const existing = await prisma.user.findFirst({
      where: { id: userId, schoolId: admin.schoolId },
      include: { studentProfile: true }
    });

    if (!existing) {
      return next(new HttpError(404, "User not found"));
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.email) updates.email = parsed.data.email;
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
    if (parsed.data.password) {
      updates.passwordHash = await bcrypt.hash(parsed.data.password, 12);
    }

    let studentUpdate: Record<string, unknown> | null = null;
    let resolvedClass = existing.studentProfile?.classId ?? null;
    let resolvedStandard = existing.studentProfile?.classId
      ? (
          await prisma.academicClass.findFirst({
            where: { id: existing.studentProfile.classId, schoolId: admin.schoolId },
            select: { classStandardId: true }
          })
        )?.classStandardId ?? null
      : null;
    if (parsed.data.classId) {
      if (existing.role !== "STUDENT") {
        return next(new HttpError(400, "classId can only be updated for students"));
      }
      const classRecord = await prisma.academicClass.findFirst({
        where: { id: parsed.data.classId, schoolId: admin.schoolId }
      });
      if (!classRecord) {
        return next(new HttpError(404, "Class not found"));
      }
      studentUpdate = {
        classId: classRecord.id,
        classLevel: classRecord.classLevel,
        className: classRecord.name
      };
      resolvedClass = classRecord.id;
      resolvedStandard = classRecord.classStandardId ?? null;
    }

    if (parsed.data.sectionId) {
      if (existing.role !== "STUDENT") {
        return next(new HttpError(400, "sectionId can only be updated for students"));
      }
      if (!resolvedClass || !resolvedStandard) {
        return next(new HttpError(400, "classId is required for section assignment"));
      }
      const section = await prisma.academicSection.findFirst({
        where: { id: parsed.data.sectionId, classStandardId: resolvedStandard, schoolId: admin.schoolId },
        select: { id: true, name: true }
      });
      if (!section) {
        return next(new HttpError(404, "Section not found"));
      }
      studentUpdate = {
        ...(studentUpdate ?? {}),
        sectionId: section.id,
        sectionName: section.name
      };
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...updates,
        ...(studentUpdate
          ? {
              studentProfile: {
                update: studentUpdate
              }
            }
          : {})
      },
    });

    const full = await prisma.user.findUnique({
      where: { id: updated.id },
      include: {
        teacherProfile: true,
        studentProfile: true,
        parentProfile: true
      }
    });

    if (!full) {
      return next(new HttpError(404, "User not found"));
    }

    res.json({
      id: full.id,
      role: full.role,
      email: full.email,
      name: full.name,
      isActive: full.isActive,
      approvalStatus: full.approvalStatus,
      teacherId: full.teacherProfile?.id ?? null,
      studentId: full.studentProfile?.id ?? null,
      parentId: full.parentProfile?.id ?? null,
      classId: full.studentProfile?.classId ?? null,
      classLevel: full.studentProfile?.classLevel ?? null,
      sectionId: full.studentProfile?.sectionId ?? null
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/parents/:parentId/links", async (req, res, next) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid link request", details));
  }

  try {
    const admin = req.user!;
    const parentId = req.params.parentId;

    const parent = await prisma.parentProfile.findFirst({
      where: { id: parentId, schoolId: admin.schoolId }
    });

    if (!parent) {
      return next(new HttpError(404, "Parent not found"));
    }

    const student = await prisma.studentProfile.findFirst({
      where: { id: parsed.data.studentId, schoolId: admin.schoolId }
    });

    if (!student) {
      return next(new HttpError(404, "Student not found"));
    }

    const link = await prisma.parentStudent.upsert({
      where: {
        parentId_studentId: {
          parentId: parent.id,
          studentId: student.id
        }
      },
      update: {},
      create: {
        schoolId: admin.schoolId,
        parentId: parent.id,
        studentId: student.id
      }
    });

    res.status(201).json({ parentId: link.parentId, studentId: link.studentId });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/academic-setup", async (req, res, next) => {
  const parsed = academicSetupSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid academic setup payload"));
  }

  try {
    const admin = req.user!;
    const payload = parsed.data;
    const createdStandards = await Promise.all(payload.classes.map(async (klass) => {
      const standard = await prisma.academicClassStandard.upsert({
        where: { schoolId_name: { schoolId: admin.schoolId, name: klass.name } },
        update: { hasStreams: klass.hasStreams ?? false },
        create: {
          schoolId: admin.schoolId,
          name: klass.name,
          hasStreams: klass.hasStreams ?? false
        }
      });

      const sectionNames = klass.sections ?? [];
      if (sectionNames.length > 0) {
        await prisma.academicSection.createMany({
          data: sectionNames.map((name) => ({
            schoolId: admin.schoolId,
            classStandardId: standard.id,
            name
          })),
          skipDuplicates: true
        });
      }

      const classLevel = getClassLevel(klass.name);
      if (classLevel !== null) {
        const academicClass = await prisma.academicClass.upsert({
          where: { schoolId_classLevel: { schoolId: admin.schoolId, classLevel } },
          update: {
            name: klass.name,
            classStandardId: standard.id
          },
          create: {
            schoolId: admin.schoolId,
            classLevel,
            name: klass.name,
            classStandardId: standard.id,
            isSystem: false
          }
        });

        const subjectPool = buildSubjectPoolForSections(sectionNames, klass.hasStreams ?? false);
        const existingSubjects = await prisma.academicSubject.findMany({
          where: {
            schoolId: admin.schoolId,
            classId: academicClass.id,
            name: { in: subjectPool }
          },
          select: { id: true, name: true }
        });

        const existingSubjectNames = new Set(existingSubjects.map((subject) => subject.name));
        const newSubjectNames = subjectPool.filter((subjectName) => !existingSubjectNames.has(subjectName));

        if (newSubjectNames.length > 0) {
          await prisma.academicSubject.createMany({
            data: newSubjectNames.map((subjectName) => ({
              schoolId: admin.schoolId,
              classId: academicClass.id,
              name: subjectName,
              isSystem: false
            })),
            skipDuplicates: true
          });
        }

        const subjects = await prisma.academicSubject.findMany({
          where: {
            schoolId: admin.schoolId,
            classId: academicClass.id,
            name: { in: subjectPool }
          },
          select: { id: true, name: true }
        });

        for (const subject of subjects) {
          const bookName = `${subject.name} NCERT`;
          const existingBook = await prisma.academicBook.findFirst({
            where: {
              schoolId: admin.schoolId,
              subjectId: subject.id,
              name: bookName
            },
            select: { id: true }
          });

          if (!existingBook) {
            await prisma.academicBook.create({
              data: {
                schoolId: admin.schoolId,
                subjectId: subject.id,
                name: bookName,
                type: "NCERT",
                isSystem: false,
                chapters: {
                  create: Array.from({ length: 5 }, (_val, idx) => ({
                    title: `Chapter ${idx + 1}`,
                    schoolId: admin.schoolId
                  }))
                }
              }
            });
          }
        }
      }

      return standard;
    }));

    res.status(201).json({ items: createdStandards });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  "/import-students",
  uploadStudentImport.single("file"),
  async (req, res, next) => {
    try {
      const admin = req.user!;
      const file = (req as typeof req & {
        file?: { buffer: Buffer; originalname: string };
      }).file;

      if (!file) {
        return next(new HttpError(400, "Import file is required"));
      }

      const parsedRows = (await parseImportFile(file, mapImportRows)) as ParsedImportResult<
        z.infer<typeof importStudentRowSchema>
      >;
      let importedCount = 0;
      const errors = [...parsedRows.errors];

      for (const row of parsedRows.validRows) {
        try {
          const classLevel = parseImportedClassLevel(row.className);
          if (classLevel === null) {
            throw new Error(`Invalid class value for ${row.email}`);
          }

          const academicClass = await prisma.academicClass.findFirst({
            where: { schoolId: admin.schoolId, classLevel },
            select: { id: true, classLevel: true, classStandardId: true }
          });

          if (!academicClass || !academicClass.classStandardId) {
            throw new Error(`Class not found for ${row.className}`);
          }

          const section = await prisma.academicSection.findFirst({
            where: {
              schoolId: admin.schoolId,
              classStandardId: academicClass.classStandardId,
              name: row.sectionName
            },
            select: { id: true }
          });

          if (!section) {
            throw new Error(`Section not found for ${row.sectionName}`);
          }

          const dob = row.dob ? new Date(row.dob) : null;
          if (row.dob && (!dob || Number.isNaN(dob.getTime()))) {
            throw new Error(`Invalid date of birth for ${row.email}`);
          }

          const parentName = row.parentName?.trim() || `${row.name} Parent`;
          const parentPassword = generateTemporaryPassword();
          const studentPassword = generateTemporaryPassword();
          const parentPasswordHash = await bcrypt.hash(parentPassword, 12);
          const studentPasswordHash = await bcrypt.hash(studentPassword, 12);

          const parent = await prisma.user.upsert({
            where: { schoolId_email: { schoolId: admin.schoolId, email: row.parentEmail } },
            update: {
              passwordHash: parentPasswordHash,
              isVerified: true,
              emailVerified: true,
              emailVerificationToken: null,
              emailVerificationExpires: null,
              name: parentName,
              role: "PARENT",
              approvalStatus: "APPROVED",
              isActive: true,
              parentProfile: {
                upsert: {
                  update: {
                    fullName: parentName,
                    email: row.parentEmail
                  },
                  create: {
                    schoolId: admin.schoolId,
                    fullName: parentName,
                    email: row.parentEmail
                  }
                }
              }
            },
            create: {
              publicId: await generateUniquePublicId(),
              schoolId: admin.schoolId,
              email: row.parentEmail,
              passwordHash: parentPasswordHash,
              isVerified: true,
              emailVerified: true,
              emailVerificationToken: null,
              emailVerificationExpires: null,
              role: "PARENT",
              name: parentName,
              approvalStatus: "APPROVED",
              isActive: true,
              parentProfile: {
                create: {
                  schoolId: admin.schoolId,
                  fullName: parentName,
                  email: row.parentEmail
                }
              }
            },
            include: { parentProfile: true }
          });

          const student = await prisma.user.upsert({
            where: { schoolId_email: { schoolId: admin.schoolId, email: row.email } },
            update: {
              passwordHash: studentPasswordHash,
              isVerified: true,
              emailVerified: true,
              emailVerificationToken: null,
              emailVerificationExpires: null,
              name: row.name,
              role: "STUDENT",
              approvalStatus: "APPROVED",
              isActive: true,
              studentProfile: {
                upsert: {
                  update: {
                    fullName: row.name,
                    className: row.className,
                    sectionName: row.sectionName,
                    classId: academicClass.id,
                    classLevel: academicClass.classLevel,
                    sectionId: section.id,
                    rollNumber: row.rollNumber?.trim() || null,
                    phoneNumber: row.phone?.trim() ?? "",
                    email: row.email,
                    location: row.location?.trim() ?? "",
                    dob
                  },
                  create: {
                    schoolId: admin.schoolId,
                    fullName: row.name,
                    className: row.className,
                    sectionName: row.sectionName,
                    classId: academicClass.id,
                    classLevel: academicClass.classLevel,
                    sectionId: section.id,
                    rollNumber: row.rollNumber?.trim() || null,
                    phoneNumber: row.phone?.trim() ?? "",
                    email: row.email,
                    location: row.location?.trim() ?? "",
                    dob
                  }
                }
              }
            },
            create: {
              publicId: await generateUniquePublicId(),
              schoolId: admin.schoolId,
              email: row.email,
              passwordHash: studentPasswordHash,
              isVerified: true,
              emailVerified: true,
              emailVerificationToken: null,
              emailVerificationExpires: null,
              role: "STUDENT",
              name: row.name,
              approvalStatus: "APPROVED",
              isActive: true,
              studentProfile: {
                create: {
                  schoolId: admin.schoolId,
                  fullName: row.name,
                  className: row.className,
                  sectionName: row.sectionName,
                  classId: academicClass.id,
                  classLevel: academicClass.classLevel,
                  sectionId: section.id,
                  rollNumber: row.rollNumber?.trim() || null,
                  phoneNumber: row.phone?.trim() ?? "",
                  email: row.email,
                  location: row.location?.trim() ?? "",
                  dob
                }
              }
            },
            include: { studentProfile: true }
          });

          if (!parent.parentProfile || !student.studentProfile) {
            throw new Error("Failed to create parent/student profiles during import");
          }

          await prisma.parentStudent.upsert({
            where: {
              parentId_studentId: {
                parentId: parent.parentProfile.id,
                studentId: student.studentProfile.id
              }
            },
            update: {},
            create: {
              schoolId: admin.schoolId,
              parentId: parent.parentProfile.id,
              studentId: student.studentProfile.id
            }
          });

          await Promise.all([
            sendUserOnboardingEmail({
              to: parent.email,
              userId: parent.publicId,
              schoolId: admin.schoolId,
              email: parent.email,
              role: "PARENT",
              tempPassword: parentPassword
            }).catch((error) => {
              console.error("Failed to send parent onboarding email", error);
            }),
            sendUserOnboardingEmail({
              to: student.email,
              userId: student.publicId,
              schoolId: admin.schoolId,
              email: student.email,
              role: "STUDENT",
              tempPassword: studentPassword
            }).catch((error) => {
              console.error("Failed to send student onboarding email", error);
            })
          ]);

          importedCount += 1;
        } catch (error) {
          errors.push({
            rowNumber: row.rowNumber,
            message: error instanceof Error ? error.message : "Student import failed",
            values: row.values
          });
        }
      }

      res.json({
        message:
          errors.length > 0
            ? "Student import completed with some row errors"
            : "Students imported successfully",
        importedCount,
        totalRows: parsedRows.totalRows,
        failedCount: errors.length,
        errors
      });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.post(
  "/import-teachers",
  uploadStudentImport.single("file"),
  async (req, res, next) => {
    try {
      const admin = req.user!;
      const file = (req as typeof req & {
        file?: { buffer: Buffer; originalname: string };
      }).file;

      if (!file) {
        return next(new HttpError(400, "Import file is required"));
      }

      const parsedRows = (await parseImportFile(file, mapTeacherImportRows)) as ParsedImportResult<
        z.infer<typeof importTeacherRowSchema>
      >;
      let importedCount = 0;
      const errors = [...parsedRows.errors];

      for (const row of parsedRows.validRows) {
        try {
          const teacherPassword = generateTemporaryPassword();
          const teacherPasswordHash = await bcrypt.hash(teacherPassword, 12);

          const teacher = await prisma.user.upsert({
            where: { schoolId_email: { schoolId: admin.schoolId, email: row.email } },
            update: {
              passwordHash: teacherPasswordHash,
              isVerified: true,
              emailVerified: true,
              emailVerificationToken: null,
              emailVerificationExpires: null,
              name: row.name,
              role: "TEACHER",
              approvalStatus: "APPROVED",
              isActive: true,
              teacherProfile: {
                upsert: {
                  update: {
                    fullName: row.name,
                    email: row.email,
                    contact: row.phone ?? "",
                    subject: row.subject ?? ""
                  },
                  create: {
                    schoolId: admin.schoolId,
                    fullName: row.name,
                    email: row.email,
                    contact: row.phone ?? "",
                    subject: row.subject ?? ""
                  }
                }
              }
            },
            create: {
              publicId: await generateUniquePublicId(),
              schoolId: admin.schoolId,
              email: row.email,
              passwordHash: teacherPasswordHash,
              isVerified: true,
              emailVerified: true,
              emailVerificationToken: null,
              emailVerificationExpires: null,
              role: "TEACHER",
              name: row.name,
              approvalStatus: "APPROVED",
              isActive: true,
              teacherProfile: {
                create: {
                  schoolId: admin.schoolId,
                  fullName: row.name,
                  email: row.email,
                  contact: row.phone ?? "",
                  subject: row.subject ?? ""
                }
              }
            },
            include: {
              teacherProfile: true
            }
          });

          if (teacher.teacherProfile) {
            const classes = await prisma.academicClass.findMany({
              where: { schoolId: admin.schoolId },
              select: { id: true }
            });
            if (classes.length > 0) {
              await prisma.teacherClass.createMany({
                data: classes.map((klass) => ({
                  schoolId: admin.schoolId,
                  teacherId: teacher.teacherProfile!.id,
                  classId: klass.id
                })),
                skipDuplicates: true
              });
            }
          }

          await sendUserOnboardingEmail({
            to: teacher.email,
            userId: teacher.publicId,
            schoolId: admin.schoolId,
            email: teacher.email,
            role: "TEACHER",
            tempPassword: teacherPassword
          }).catch((error) => {
            console.error("Failed to send teacher onboarding email", error);
          });

          importedCount += 1;
        } catch (error) {
          errors.push({
            rowNumber: row.rowNumber,
            message: error instanceof Error ? error.message : "Teacher import failed",
            values: row.values
          });
        }
      }

      res.json({
        message:
          errors.length > 0
            ? "Teacher import completed with some row errors"
            : "Teachers imported successfully",
        importedCount,
        totalRows: parsedRows.totalRows,
        failedCount: errors.length,
        errors
      });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.post(
  "/logo",
  uploadLogo.single("logo"),
  async (req, res, next) => {
    try {
      const admin = req.user!;
      const file = (
        req as unknown as {
          file?: {
            originalname: string;
            fieldname?: string;
            mimetype?: string;
            size?: number;
            buffer?: Buffer;
          };
        }
      ).file;
      console.log(file ?? null);
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      if (!file.buffer || !file.mimetype || !ALLOWED_LOGO_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: "Only PNG, JPEG, and WEBP logos are allowed" });
      }

      const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
      const logoDir = path.join(uploadRoot, "logos");
      await fs.promises.mkdir(logoDir, { recursive: true });

      const filename = `school-logo-${Date.now()}-${crypto.randomUUID()}${getLogoExtension(
        file.mimetype,
        file.originalname
      )}`;
      const absolutePath = path.join(logoDir, filename);
      await fs.promises.writeFile(absolutePath, file.buffer);

      const relativePath = path.join(env.UPLOAD_DIR, "logos", filename);
      const updated = await prisma.school.update({
        where: { id: admin.schoolId },
        data: { logoUrl: relativePath }
      });

      res.json({
        success: true,
        url: updated.logoUrl,
        logoUrl: updated.logoUrl
      });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.delete("/logo", async (req, res, next) => {
  try {
    const admin = req.user!;
    const updated = await prisma.school.update({
      where: { id: admin.schoolId },
      data: { logoUrl: null }
    });

    res.json({ logoUrl: updated.logoUrl });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/academic-setup", async (req, res, next) => {
  try {
    const admin = req.user!;
    const standards = await prisma.academicClassStandard.findMany({
      where: { schoolId: admin.schoolId },
      include: { sections: { orderBy: { name: "asc" }, select: { id: true, name: true } } }
    });
    res.json({
      items: [...standards]
        .sort((left, right) => compareClassNames(left.name, right.name))
        .map((standard) => ({
          id: standard.id,
          name: standard.name,
          hasStreams: standard.hasStreams,
          sections: standard.sections
        }))
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/parents/:parentId/links/:studentId", async (req, res, next) => {
  try {
    const admin = req.user!;
    const parentId = req.params.parentId;
    const studentId = req.params.studentId;

    const link = await prisma.parentStudent.findFirst({
      where: {
        parentId,
        studentId,
        schoolId: admin.schoolId
      }
    });

    if (!link) {
      return next(new HttpError(404, "Link not found"));
    }

    await prisma.parentStudent.delete({
      where: { parentId_studentId: { parentId, studentId } }
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
