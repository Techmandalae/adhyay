import { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import bcrypt from "bcrypt";
import { Readable } from "stream";
import XLSX from "xlsx";
import { z } from "zod";
import nodemailer from "nodemailer";

import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { requireAdmin } from "../middleware/auth";
import { HttpError } from "../middleware/error";

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

const logoStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
    const targetDir = path.join(uploadRoot, "logos");
    await fs.promises.mkdir(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const safeName = `school-logo-${Date.now()}${ext}`;
    cb(null, safeName);
  }
});

const uploadLogo = multer({ storage: logoStorage });
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
    rollNumber: z.string().trim().min(1),
    studentName: z.string().trim().min(1),
    className: z.string().trim().min(1),
    sectionName: z.string().trim().min(1),
    studentEmail: z.string().trim().email(),
    parentName: z.string().trim().min(1),
    parentEmail: z.string().trim().email(),
    phone: z.string().trim().min(1),
    location: z.string().trim().min(1),
    dob: z.string().trim().min(1)
  })
  .strict();

const importTeacherRowSchema = z
  .object({
    name: z.string().trim().min(1),
    contact: z.string().trim().min(1),
    email: z.string().trim().email(),
    subject: z.string().trim().min(1)
  })
  .strict();

const STREAM_SUBJECTS: Record<string, string[]> = {
  Science: ["Physics", "Chemistry", "Mathematics", "Biology"],
  Commerce: ["Accountancy", "Business Studies", "Economics"],
  Arts: ["Political Science", "History", "Geography"]
};

const COMMON_SUBJECTS = ["Mathematics", "Science", "Social Science", "English", "Hindi"];

function getClassLevel(name: string): number | null {
  const match = name.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
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
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function parseImportedClassLevel(value: string) {
  const match = value.match(/(\d{1,2})/);
  if (!match) {
    return null;
  }
  const level = Number(match[1]);
  return Number.isFinite(level) ? level : null;
}

function createImportedPasswordHashSource(email: string) {
  return `ImportedUser@${email.toLowerCase()}`;
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

function createTransporter() {
  const smtpUser = env.SMTP_USER ?? env.EMAIL_USER;
  const smtpPass = env.SMTP_PASS ?? env.EMAIL_PASS;

  if (!smtpUser || !smtpPass) {
    return null;
  }

  return env.SMTP_HOST && env.SMTP_PORT
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      })
    : nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
}

async function sendImportedLoginEmail(params: {
  to: string;
  userId: string;
  schoolId: string;
  email: string;
  password: string;
}) {
  const transporter = createTransporter();
  if (!transporter) {
    return;
  }

  const loginUrl = env.FRONTEND_URL ?? env.CORS_ORIGIN.split(",")[0]?.trim() ?? "http://localhost:3000";

  await transporter.sendMail({
    from: env.SMTP_FROM_EMAIL ?? env.SMTP_USER ?? env.EMAIL_USER,
    to: params.to,
    subject: "Adhyay Login Details",
    html: `
      <p>Your Adhyay account is ready.</p>
      <p>User ID: ${params.userId}</p>
      <p>School ID: ${params.schoolId || "Independent"}</p>
      <p>Email: ${params.email}</p>
      <p>Password: ${params.password}</p>
      <p>Login here: <a href="${loginUrl}">${loginUrl}</a></p>
    `
  });
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

function mapImportRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const normalized = Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[normalizeImportKey(key)] = typeof value === "string" ? value.trim() : String(value ?? "").trim();
      return acc;
    }, {});

    return importStudentRowSchema.parse({
      rollNumber: normalized.rollnumber,
      studentName: normalized.studentname,
      className: normalized.class,
      sectionName: normalized.section,
      studentEmail: normalized.studentemail,
      parentName: normalized.parentname,
      parentEmail: normalized.parentemail,
      phone: normalized.phone,
      location: normalized.location,
      dob: normalized.dob
    });
  });
}

function mapTeacherImportRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const normalized = Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[normalizeImportKey(key)] = typeof value === "string" ? value.trim() : String(value ?? "").trim();
      return acc;
    }, {});

    return importTeacherRowSchema.parse({
      name: normalized.name,
      contact: normalized.contact,
      email: normalized.email,
      subject: normalized.subject
    });
  });
}

async function parseImportFile(
  file: { buffer: Buffer; originalname: string },
  mapper: (rows: Record<string, unknown>[]) => unknown[]
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
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
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

    const results = await prisma.$transaction(async (tx) => {
      const createdStandards = [];

      for (const klass of payload.classes) {
        const standard = await tx.academicClassStandard.upsert({
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
          await tx.academicSection.createMany({
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
          await tx.academicClass.upsert({
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
          for (const subjectName of subjectPool) {
            const subject = await tx.academicSubject.upsert({
              where: {
                schoolId_classId_name: {
                  schoolId: admin.schoolId,
                  classId: (await tx.academicClass.findUnique({
                    where: { schoolId_classLevel: { schoolId: admin.schoolId, classLevel } },
                    select: { id: true }
                  }))!.id,
                  name: subjectName
                }
              },
              update: {},
              create: {
                schoolId: admin.schoolId,
                classId: (await tx.academicClass.findUnique({
                  where: { schoolId_classLevel: { schoolId: admin.schoolId, classLevel } },
                  select: { id: true }
                }))!.id,
                name: subjectName,
                isSystem: false
              }
            });

            const book = await tx.academicBook.findFirst({
              where: { schoolId: admin.schoolId, subjectId: subject.id, type: "NCERT" }
            });
            if (!book) {
              await tx.academicBook.create({
                data: {
                  schoolId: admin.schoolId,
                  subjectId: subject.id,
                  name: `${subjectName} NCERT`,
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

        createdStandards.push(standard);
      }

      return createdStandards;
    });

    res.status(201).json({ items: results });
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

      const parsedRows = await parseImportFile(file, mapImportRows) as z.infer<
        typeof importStudentRowSchema
      >[];
      let importedCount = 0;

      for (const row of parsedRows) {
        const classLevel = parseImportedClassLevel(row.className);
        if (classLevel === null) {
          throw new HttpError(400, `Invalid class value for ${row.studentEmail}`);
        }

        const academicClass = await prisma.academicClass.findFirst({
          where: { schoolId: admin.schoolId, classLevel },
          select: { id: true, classLevel: true, classStandardId: true }
        });

        if (!academicClass || !academicClass.classStandardId) {
          throw new HttpError(404, `Class not found for ${row.className}`);
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
          throw new HttpError(404, `Section not found for ${row.sectionName}`);
        }

        const dob = new Date(row.dob);
        if (Number.isNaN(dob.getTime())) {
          throw new HttpError(400, `Invalid DOB for ${row.studentEmail}`);
        }

        const parentPassword = createImportedPasswordHashSource(row.parentEmail);
        const studentPassword = createImportedPasswordHashSource(row.studentEmail);
        const parentPasswordHash = await bcrypt.hash(parentPassword, 12);
        const studentPasswordHash = await bcrypt.hash(studentPassword, 12);

        const parent = await prisma.user.upsert({
          where: { schoolId_email: { schoolId: admin.schoolId, email: row.parentEmail } },
          update: {
            emailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpires: null,
            name: row.parentName,
            role: "PARENT",
            approvalStatus: "APPROVED",
            isActive: true,
            parentProfile: {
              upsert: {
                update: {
                  fullName: row.parentName,
                  email: row.parentEmail
                },
                create: {
                  schoolId: admin.schoolId,
                  fullName: row.parentName,
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
            emailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpires: null,
            role: "PARENT",
            name: row.parentName,
            approvalStatus: "APPROVED",
            isActive: true,
            parentProfile: {
              create: {
                schoolId: admin.schoolId,
                fullName: row.parentName,
                email: row.parentEmail
              }
            }
          },
          include: { parentProfile: true }
        });

        const student = await prisma.user.upsert({
          where: { schoolId_email: { schoolId: admin.schoolId, email: row.studentEmail } },
          update: {
            emailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpires: null,
            name: row.studentName,
            role: "STUDENT",
            approvalStatus: "APPROVED",
            isActive: true,
            studentProfile: {
              upsert: {
                update: {
                  fullName: row.studentName,
                  className: row.className,
                  sectionName: row.sectionName,
                  classId: academicClass.id,
                  classLevel: academicClass.classLevel,
                  sectionId: section.id,
                  rollNumber: row.rollNumber,
                  phoneNumber: row.phone,
                  email: row.studentEmail,
                  location: row.location,
                  dob
                },
                create: {
                  schoolId: admin.schoolId,
                  fullName: row.studentName,
                  className: row.className,
                  sectionName: row.sectionName,
                  classId: academicClass.id,
                  classLevel: academicClass.classLevel,
                  sectionId: section.id,
                  rollNumber: row.rollNumber,
                  phoneNumber: row.phone,
                  email: row.studentEmail,
                  location: row.location,
                  dob
                }
              }
            }
          },
          create: {
            publicId: await generateUniquePublicId(),
            schoolId: admin.schoolId,
            email: row.studentEmail,
            passwordHash: studentPasswordHash,
            emailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpires: null,
            role: "STUDENT",
            name: row.studentName,
            approvalStatus: "APPROVED",
            isActive: true,
            studentProfile: {
              create: {
                schoolId: admin.schoolId,
                fullName: row.studentName,
                className: row.className,
                sectionName: row.sectionName,
                classId: academicClass.id,
                classLevel: academicClass.classLevel,
                sectionId: section.id,
                rollNumber: row.rollNumber,
                phoneNumber: row.phone,
                email: row.studentEmail,
                location: row.location,
                dob
              }
            }
          },
          include: { studentProfile: true }
        });

        if (!parent.parentProfile || !student.studentProfile) {
          throw new HttpError(500, "Failed to create parent/student profiles during import");
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
          sendImportedLoginEmail({
            to: parent.email,
            userId: parent.publicId,
            schoolId: admin.schoolId,
            email: parent.email,
            password: parentPassword
          }).catch((error) => {
            console.error("Failed to send parent import email", error);
          }),
          sendImportedLoginEmail({
            to: student.email,
            userId: student.publicId,
            schoolId: admin.schoolId,
            email: student.email,
            password: studentPassword
          }).catch((error) => {
            console.error("Failed to send student import email", error);
          })
        ]);

        importedCount += 1;
      }

      res.json({ message: "Students imported successfully", importedCount });
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

      const parsedRows = await parseImportFile(file, mapTeacherImportRows) as z.infer<
        typeof importTeacherRowSchema
      >[];
      let importedCount = 0;

      for (const row of parsedRows) {
        const teacherPassword = createImportedPasswordHashSource(row.email);
        const teacherPasswordHash = await bcrypt.hash(teacherPassword, 12);

        const teacher = await prisma.user.upsert({
          where: { schoolId_email: { schoolId: admin.schoolId, email: row.email } },
          update: {
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
                  contact: row.contact,
                  subject: row.subject
                },
                create: {
                  schoolId: admin.schoolId,
                  fullName: row.name,
                  email: row.email,
                  contact: row.contact,
                  subject: row.subject
                }
              }
            }
          },
          create: {
            publicId: await generateUniquePublicId(),
            schoolId: admin.schoolId,
            email: row.email,
            passwordHash: teacherPasswordHash,
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
                contact: row.contact,
                subject: row.subject
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

        await sendImportedLoginEmail({
          to: teacher.email,
          userId: teacher.publicId,
          schoolId: admin.schoolId,
          email: teacher.email,
          password: teacherPassword
        }).catch((error) => {
          console.error("Failed to send teacher import email", error);
        });

        importedCount += 1;
      }

      res.json({ message: "Teachers imported successfully", importedCount });
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
      const file = (req as unknown as { file?: { filename: string } }).file;
      if (!file) {
        return next(new HttpError(400, "Logo file is required"));
      }

      const relativePath = path.join(env.UPLOAD_DIR, "logos", file.filename);
      const updated = await prisma.school.update({
        where: { id: admin.schoolId },
        data: { logoUrl: relativePath }
      });

      res.json({ logoUrl: updated.logoUrl });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.get("/academic-setup", async (req, res, next) => {
  try {
    const admin = req.user!;
    const standards = await prisma.academicClassStandard.findMany({
      where: { schoolId: admin.schoolId },
      orderBy: { name: "asc" },
      include: { sections: { orderBy: { name: "asc" }, select: { id: true, name: true } } }
    });
    res.json({
      items: standards.map((standard) => ({
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
