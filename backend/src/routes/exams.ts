import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import {
  ACADEMIC_CATALOG,
  CatalogClass,
  CatalogSubject
} from "../catalog/academicCatalog";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import {
  requireAuth,
  requireStudent,
  requireStudentOrParent,
  requireTeacher,
  requireTeacherOrAdmin
} from "../middleware/auth";
import { HttpError } from "../middleware/error";
import {
  DEFAULT_CBSE_TEMPLATE_SECTIONS,
  type ExamTemplateSection,
  type ExamPayload,
  type ExamQuestion,
  type NormalizedQuestionType
} from "../types/exam";
import type { GenerateExamInput } from "../types/exam";
import {
  resolveSchoolBranding,
  streamExamPdf,
  streamAnswerKeyPdf,
  streamQuestionPaperPdf
} from "../services/pdf.service";
import { buildExamDocx } from "../services/docx.service";
import {
  buildFallbackExam,
  generateExam,
  inferNcertTemplateSections
} from "../services/ai.exam.service";
import { notificationService } from "../services/notifications";
import { buildFallbackBooks, buildFallbackSubjects } from "../utils/catalogLoader";
import type { AuthUser, MetaBlob } from "../types/auth";

export const examsRouter = Router();

/* ======================================================
   HELPERS
====================================================== */

type ExamMeta = {
  subject?: string;
  classLevel?: number;
  language?: string;
  difficulty?: string;
  ncertChapters?: string[];
  questionCount?: number;
  choicesPerQuestion?: number;
  templateId?: string;
  teacherId?: string;
  schoolId?: string;
  subjectId?: string;
  classId?: string;
  sectionId?: string;
  mode?: string;
  status?: string;
  answerKeyReleased?: boolean;
};

type UsageLimit = {
  monthlyExamLimit?: number;
};

type SelectedChapter = {
  id: string;
  title: string;
  chapterNumber?: number | null;
  summary?: string | null;
  keywords?: string | null;
};

type SelectedBook = {
  id: string;
  name: string;
  type: "NCERT" | "REFERENCE";
  chapters: SelectedChapter[];
};

type SelectedSubject = {
  id: string;
  name: string;
  books: SelectedBook[];
};

const normalizedTemplateType = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "mcq") return "mcq";
  if (normalized === "very_short" || normalized === "very short") return "very_short";
  if (normalized === "short_answer" || normalized === "short answer" || normalized === "short") {
    return "short";
  }
  if (normalized === "long_answer" || normalized === "long answer" || normalized === "long") {
    return "long";
  }
  if (
    normalized === "fill_in_the_blanks" ||
    normalized === "fill in the blanks" ||
    normalized === "fib"
  ) {
    return "fill_in_the_blanks";
  }
  return normalized;
}, z.enum(["mcq", "very_short", "short", "long", "fill_in_the_blanks"]));

const templateSectionSchema = z
  .object({
    title: z.string().min(1),
    type: normalizedTemplateType,
    questionsToGenerate: z.coerce.number().int().positive(),
    questionsToAttempt: z.coerce.number().int().positive(),
    marksPerQuestion: z.coerce.number().positive()
  })
  .strict();

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim().length > 0) as string[];
}

function parseExamMeta(meta: unknown): ExamMeta {
  if (!meta || typeof meta !== "object") return {};
  const record = meta as Record<string, unknown>;
  const parsed: ExamMeta = {};
  const subject = normalizeString(record.subject);
  if (subject) parsed.subject = subject;
  const classLevel = normalizeNumber(record.classLevel);
  if (classLevel !== undefined) parsed.classLevel = classLevel;
  const language = normalizeString(record.language);
  if (language) parsed.language = language;
  const difficulty = normalizeString(record.difficulty);
  if (difficulty) parsed.difficulty = difficulty;
  const ncertChapters = normalizeStringArray(record.ncertChapters);
  if (ncertChapters.length > 0) parsed.ncertChapters = ncertChapters;
  const questionCount = normalizeNumber(record.questionCount);
  if (questionCount !== undefined) parsed.questionCount = questionCount;
  const choicesPerQuestion = normalizeNumber(record.choicesPerQuestion);
  if (choicesPerQuestion !== undefined) parsed.choicesPerQuestion = choicesPerQuestion;
  const templateId = normalizeString(record.templateId);
  if (templateId) parsed.templateId = templateId;
  const teacherId = normalizeString(record.teacherId);
  if (teacherId) parsed.teacherId = teacherId;
  const schoolId = normalizeString(record.schoolId);
  if (schoolId) parsed.schoolId = schoolId;
  const subjectId = normalizeString(record.subjectId);
  if (subjectId) parsed.subjectId = subjectId;
  const classId = normalizeString(record.classId);
  if (classId) parsed.classId = classId;
  const sectionId = normalizeString(record.sectionId);
  if (sectionId) parsed.sectionId = sectionId;
  const mode = normalizeString(record.mode);
  if (mode) parsed.mode = mode;
  const status = normalizeString(record.status);
  if (status) parsed.status = status;
  if (typeof record.answerKeyReleased === "boolean") {
    parsed.answerKeyReleased = record.answerKeyReleased;
  }
  return parsed;
}

function stripAnswerKey(questions: unknown[]): unknown[] {
  return questions.map((question) => {
    if (!question || typeof question !== "object") {
      return question;
    }
    const record = question as Record<string, unknown>;
    const { answerIndex, explanation, ...rest } = record;
    return rest;
  });
}

function parseUsageLimit(meta?: MetaBlob): UsageLimit {
  if (!meta || typeof meta !== "object") return {};
  const record = meta as Record<string, unknown>;
  const limit = normalizeNumber(record.monthlyExamLimit ?? record.examLimit ?? record.monthly_limit);
  return limit !== undefined ? { monthlyExamLimit: limit } : {};
}

function getPeriodKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getPeriodBounds(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

function isTeacher(user: AuthUser) {
  return user.role === "TEACHER";
}

async function ensureTeacherCanPublish(user: AuthUser) {
  if (!user.teacherId) {
    throw new HttpError(403, "Teacher context required");
  }

  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: user.teacherId },
    select: {
      isIndependent: true,
      school: {
        select: {
          isIndependentWorkspace: true
        }
      }
    }
  });

  if (!teacher) {
    throw new HttpError(404, "Teacher profile not found");
  }

  if (teacher.isIndependent || teacher.school.isIndependentWorkspace) {
    throw new HttpError(403, "Independent teachers can generate and export exams but cannot publish them");
  }
}

function getParamId(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function getStudentExamWhere(user: AuthUser) {
  if (!user.studentId && user.role !== "STUDENT") {
    throw new HttpError(403, "Student context required");
  }

  const profileId = user.studentId ?? user.id;
  const student = await prisma.studentProfile.findFirst({
    where: {
      id: profileId,
      schoolId: user.schoolId
    },
    select: {
      classId: true,
      sectionId: true,
      class: {
        select: {
          classStandardId: true
        }
      }
    }
  });

  if (!student?.class.classStandardId) {
    throw new HttpError(404, "Student class context not found");
  }

  return {
    schoolId: user.schoolId,
    status: "PUBLISHED" as const,
    class: {
      classStandardId: student.class.classStandardId
    },
    ...(student.sectionId
      ? { OR: [{ sectionId: student.sectionId }, { sectionId: null }] }
      : {})
  };
}

function buildExamPreviewResponse(exam: {
  id: string;
  status: string;
  meta: Prisma.JsonValue;
  sectionId: string | null;
  assignedClassId: string | null;
  assignedClassLevel: number | null;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  examPaper?: { id: string; payload: Prisma.JsonValue } | null;
}) {
  const meta = parseExamMeta(exam.meta);
  const payload = exam.examPaper?.payload as Record<string, unknown> | undefined;
  const sections = Array.isArray(payload?.sections) ? payload.sections : [];
  const questions = Array.isArray(payload?.questions) ? payload.questions : [];
  const allowAnswerKey = Boolean(
    (exam.meta as Record<string, unknown>)?.answerKeyReleased
  );

  return {
    id: exam.id,
    examPaperId: exam.examPaper?.id ?? null,
    metadata: {
      ...meta,
      status: exam.status,
      sectionId: exam.sectionId ?? meta.sectionId,
      assignedClassId: exam.assignedClassId,
      assignedClassLevel: exam.assignedClassLevel
    },
    sections,
    questions: allowAnswerKey ? questions : stripAnswerKey(questions),
    generatedAt: exam.generatedAt.toISOString(),
    createdAt: exam.createdAt.toISOString(),
    updatedAt: exam.updatedAt.toISOString()
  };
}

function mapSectionTypeToQuestionBankType(type?: string) {
  switch (type) {
    case "mcq":
      return "mcq";
    case "very_short":
      return "very_short";
    case "short":
      return "short";
    case "long":
      return "long";
    case "fill_in_the_blanks":
      return "fill_in_the_blanks";
    default:
      return "short";
  }
}

function normalizeStoredQuestionType(type?: string | null): NormalizedQuestionType {
  const value = (type ?? "").trim().toLowerCase();
  if (value === "mcq") return "mcq";
  if (value === "very_short" || value === "very short") return "very_short";
  if (value === "short_answer" || value === "short answer" || value === "short") return "short";
  if (value === "long_answer" || value === "long answer" || value === "long") return "long";
  if (
    value === "fill_in_the_blanks" ||
    value === "fill in the blanks" ||
    value === "fib"
  ) {
    return "fill_in_the_blanks";
  }
  return "short";
}

function shuffleArray<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function buildQuestionChoices(row: {
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
}) {
  return [row.optionA, row.optionB, row.optionC, row.optionD].filter(
    (choice): choice is string => Boolean(choice && choice.trim())
  );
}

function getSectionTitleForType(type: NormalizedQuestionType, index: number) {
  const prefix = `Section ${String.fromCharCode(65 + index)}`;
  switch (type) {
    case "mcq":
      return `${prefix} - MCQ`;
    case "very_short":
      return `${prefix} - Very Short Answer`;
    case "short":
      return `${prefix} - Short Answer`;
    case "long":
      return `${prefix} - Long Answer`;
    case "fill_in_the_blanks":
      return `${prefix} - Fill in the Blanks`;
    default:
      return prefix;
  }
}

function buildExamFromQuestionBank(input: {
  rows: Array<{
    id: string;
    question: string;
    answer: string | null;
    type: string;
    optionA: string | null;
    optionB: string | null;
    optionC: string | null;
    optionD: string | null;
    chapterTitle: string | null;
  }>;
  chapterTitles: string[];
  templateSections: ExamTemplateSection[];
  strictTemplate: boolean;
  metadata: {
    topic: string;
    subject: string;
    classLevel: number;
    language: GenerateExamInput["language"];
    difficulty: GenerateExamInput["difficulty"];
    mode: GenerateExamInput["mode"];
    templateId?: string;
    sectionId?: string;
  };
}): { exam: ExamPayload; answerKey: ExamPayload } {
  const grouped = new Map<NormalizedQuestionType, typeof input.rows>();
  for (const row of input.rows) {
    const type = normalizeStoredQuestionType(row.type);
    const list = grouped.get(type) ?? [];
    list.push(row);
    grouped.set(type, list);
  }

  const sections = input.templateSections.map((section, index) => ({
    sectionNumber: index + 1,
    title: section.title,
    type: section.type,
    questionsToGenerate: section.questionsToGenerate,
    questionsToAttempt: section.questionsToAttempt,
    marksPerQuestion: section.marksPerQuestion,
    questionNumbers: Array.from(
      { length: section.questionsToGenerate },
      (_value, offset) =>
        input.templateSections
          .slice(0, index)
          .reduce((sum, current) => sum + current.questionsToGenerate, 0) +
        offset +
        1
    )
  }));

  const questions: ExamQuestion[] = [];

  for (const section of sections) {
    const pool = shuffleArray(grouped.get(section.type ?? "short") ?? []);
    if (pool.length < (section.questionsToGenerate ?? 0)) {
      throw new HttpError(
        400,
        input.strictTemplate
          ? `Insufficient questions for template section type: ${section.type}`
          : `Insufficient questions found for type: ${section.type}`
      );
    }

    const selected = pool.slice(0, section.questionsToGenerate);
    selected.forEach((row, idx) => {
      const choices = buildQuestionChoices(row);
      const normalizedType = normalizeStoredQuestionType(row.type);
      const answerIndex =
        normalizedType === "mcq" && row.answer
          ? choices.findIndex((choice) => choice.trim().toLowerCase() === row.answer?.trim().toLowerCase())
          : undefined;

      questions.push({
        id: row.id,
        number: section.questionNumbers[idx] ?? questions.length + 1,
        sectionNumber: section.sectionNumber,
        chapter: row.chapterTitle ?? input.chapterTitles[0] ?? "General",
        prompt: row.question,
        type: normalizedType,
        choices,
        ...(typeof answerIndex === "number" && answerIndex >= 0 ? { answerIndex } : {}),
        ...(row.answer ? { explanation: row.answer } : {})
      });
    });
  }

  const questionCount = questions.length;
  const examId = randomUUID();
  const metadata = {
    ...input.metadata,
    questionCount,
    choicesPerQuestion: 4,
    generatedAt: new Date().toISOString(),
    ncertChapters: input.chapterTitles,
    ...(input.metadata.templateId ? { templateId: input.metadata.templateId } : {}),
    ...(input.metadata.sectionId ? { sectionId: input.metadata.sectionId } : {})
  };

  const examSections = sections.map((section) => ({
    ...section
  }));

  return {
    exam: {
      examId,
      metadata,
      sections: examSections,
      questions: questions.map((question) => {
        const { answerIndex, explanation, ...rest } = question;
        return rest;
      })
    },
    answerKey: {
      examId,
      metadata,
      sections: examSections,
      questions
    }
  };
}

async function findAccessibleExamForPreview(user: AuthUser, examId: string) {
  if (user.role === "TEACHER" || user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    return prisma.exam.findFirst({
      where: {
        id: examId,
        schoolId: user.schoolId,
        ...(user.role === "TEACHER" && user.teacherId ? { teacherId: user.teacherId } : {})
      },
      include: {
        examPaper: {
          select: { id: true, payload: true }
        }
      }
    });
  }

  if (user.role === "PARENT") {
    const classId = user.classId;
    const sectionId = user.sectionId ?? null;
    if (!classId) {
      throw new HttpError(403, "Class context required");
    }

    return prisma.exam.findFirst({
      where: {
        id: examId,
        status: "PUBLISHED",
        schoolId: user.schoolId,
        classId,
        ...(sectionId ? { sectionId } : {})
      },
      include: {
        examPaper: {
          select: { id: true, payload: true }
        }
      }
    });
  }

  const studentWhere = await getStudentExamWhere(user);
  return prisma.exam.findFirst({
    where: {
      id: examId,
      ...studentWhere
    },
    include: {
      examPaper: {
        select: { id: true, payload: true }
      }
    }
  });
}

function isLifecycleTransitionAllowed(current: string, next: string) {
  if (current === "DRAFT" && next === "PUBLISHED") return true;
  if (current === "PUBLISHED" && next === "ARCHIVED") return true;
  return false;
}

async function enforceUsageLimit(user: AuthUser, meta?: MetaBlob) {
  const limit = parseUsageLimit(meta).monthlyExamLimit;
  if (!limit || limit <= 0) {
    return { exceeded: false, notified: false, usedCount: 0, limitCount: null, periodStart: null, periodEnd: null };
  }

  const now = new Date();
  const periodKey = getPeriodKey(now);
  const { start, end } = getPeriodBounds(now);
  let notify = false;

  const counter = await prisma.$transaction(async (tx) => {
    const existing = await tx.usageCounter.findUnique({
      where: { schoolId_periodKey: { schoolId: user.schoolId, periodKey } }
    });

    if (existing && existing.examCount >= limit) {
      throw new HttpError(429, "Monthly exam limit reached");
    }

    const updated = await tx.usageCounter.upsert({
      where: { schoolId_periodKey: { schoolId: user.schoolId, periodKey } },
      update: {
        examCount: { increment: 1 },
        limitCount: limit
      },
      create: {
        schoolId: user.schoolId,
        periodKey,
        periodStart: start,
        periodEnd: end,
        examCount: 1,
        limitCount: limit
      }
    });

    const usagePercent = updated.limitCount
      ? updated.examCount / updated.limitCount
      : 0;

    if (
      updated.limitCount &&
      usagePercent >= env.NOTIFICATION_USAGE_THRESHOLD &&
      !updated.limitNotifiedAt
    ) {
      notify = true;
      await tx.usageCounter.update({
        where: { id: updated.id },
        data: { limitNotifiedAt: new Date() }
      });
    }

    return updated;
  });

  return {
    exceeded: false,
    notified: notify,
    usedCount: counter.examCount,
    limitCount: counter.limitCount ?? null,
    periodStart: counter.periodStart,
    periodEnd: counter.periodEnd
  };
}

async function ensureAiUsageWithinLimit(user: AuthUser) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [usageCount, school] = await Promise.all([
    prisma.examPaper.count({
      where: {
        schoolId: user.schoolId,
        createdAt: { gte: periodStart }
      }
    }),
    prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { aiMonthlyLimit: true }
    })
  ]);

  const limit = school?.aiMonthlyLimit ?? 0;
  if (!limit || limit <= 0) {
    return;
  }

  if (usageCount >= limit) {
    throw new HttpError(400, "Monthly AI usage limit reached");
  }
}

async function ensureDailyTeacherLimit(user: AuthUser) {
  if (user.role !== "TEACHER" || !user.teacherId) {
    return;
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const count = await prisma.exam.count({
    where: {
      schoolId: user.schoolId,
      teacherId: user.teacherId,
      createdAt: { gte: start, lte: end }
    }
  });
  if (count >= 10) {
    throw new HttpError(429, "Daily exam limit reached");
  }
}

/* ======================================================
   SCHEMAS
====================================================== */

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().trim().min(1).optional());

const generateExamSchema = z
  .object({
    subject: z.string().trim().min(2),
    subjectId: z.string().trim().min(1),
    subjectIds: z.array(z.string().trim().min(1)).optional(),
    classId: z.string().trim().min(1),
    sectionId: optionalTrimmedString,
    classLevel: z.coerce.number().int().min(1).max(12).optional(),
    language: z.enum(["english", "hindi", "punjabi"]).default("english"),
    difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
    includeAnswerKey: z.coerce.boolean().optional(),
    templateId: optionalTrimmedString,
    mode: z.enum(["NCERT_ONLY", "NCERT_PLUS_REFERENCE", "REFERENCE_ONLY"]),
    ncertBookIds: z.array(z.string()).default([]),
    referenceBookIds: z.array(z.string()).default([]),
    ncertChapters: z.array(z.string()).default([]),
    bookIds: z.array(z.string()).default([]),
    chapterIds: z.array(z.string()).default([]),
    topic: optionalTrimmedString
  })
  .strict();

const listSchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional()
  })
  .strict();

const statusSchema = z
  .object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  assignedClassId: z.string().trim().min(1).optional()
})
  .strict();

/* ======================================================
   GENERATE EXAM
====================================================== */

examsRouter.post("/generate", requireTeacher, async (req, res, next) => {
  console.log("=== EXAM REQUEST START ===");
  console.log("BODY:", req.body);
  console.log("USER:", req.user?.email);

  const {
    classId,
    subjectId,
    bookIds = [],
    chapterIds = [],
    difficulty,
    templateId
  } = req.body ?? {};

  if (!classId) {
    return res.status(400).json({ error: "Class missing" });
  }

  if (!subjectId) {
    return res.status(400).json({ error: "Subject missing" });
  }

  console.log("Validated Inputs:", {
    classId,
    subjectId,
    bookIds,
    chapterIds,
    difficulty,
    templateId
  });

  const parsed = generateExamSchema.safeParse(req.body);

  if (!parsed.success) {
    console.log("Exam request validation error:", parsed.error.flatten());
    return next(new HttpError(400, "Invalid exam generation request"));
  }

  try {
    const payload = parsed.data;
    const user = req.user!;
    const { teacherId, schoolId } = user;
    const isDefaultClass = payload.classId.startsWith("default-");

    const academicClass = await prisma.academicClass.findFirst({
      where: { id: payload.classId, schoolId: user.schoolId },
      include: {
        subjects: {
          include: {
            books: {
              include: { chapters: true }
            }
          }
        }
      }
    });

    if (!academicClass && !isDefaultClass) {
      return next(new HttpError(400, "Invalid class selection"));
    }

    const resolvedClassLevel =
      academicClass?.classLevel ??
      Number(payload.classId.replace("default-", ""));
    if (
      resolvedClassLevel &&
      payload.classLevel !== undefined &&
      payload.classLevel !== resolvedClassLevel
    ) {
      return next(new HttpError(400, "Class level mismatch"));
    }

    const requestedSubjectIds =
      payload.subjectIds && payload.subjectIds.length > 0
        ? payload.subjectIds
        : [payload.subjectId];
    const defaultClassSubjects: SelectedSubject[] = isDefaultClass
      ? buildFallbackSubjects(payload.classId).map((subject) => {
          const fallbackBooks = buildFallbackBooks(subject.id);
          return {
            id: subject.id,
            name: subject.name,
            books: [...fallbackBooks.ncertBooks, ...fallbackBooks.referenceBooks]
          };
        })
      : [];
    const schoolSubjects: SelectedSubject[] = (academicClass?.subjects ?? []).map((subject) => ({
      id: subject.id,
      name: subject.name,
      books: subject.books.map((book) => ({
        id: book.id,
        name: book.name,
        type: book.type as "NCERT" | "REFERENCE",
        chapters: book.chapters.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          chapterNumber: chapter.chapterNumber,
          summary: chapter.summary,
          keywords: chapter.keywords
        }))
      }))
    }));
    const selectedSubjects: SelectedSubject[] = isDefaultClass
      ? defaultClassSubjects.filter((subject) =>
          requestedSubjectIds.includes(subject.id)
        )
      : schoolSubjects.filter((subject) =>
          requestedSubjectIds.includes(subject.id)
        );

    if (selectedSubjects.length === 0) {
      return next(new HttpError(400, "Invalid subject selection"));
    }
    const primarySubject = selectedSubjects[0];

    const fetchedChaptersForDebug =
      payload.chapterIds && payload.chapterIds.length > 0
        ? await prisma.academicChapter.findMany({
            where: {
              id: { in: payload.chapterIds },
              schoolId: user.schoolId
            },
            select: { id: true, title: true }
          })
        : [];

    console.log("Fetched:", {
      class: academicClass?.name ?? payload.classId,
      subject: primarySubject.name,
      chaptersCount: fetchedChaptersForDebug.length
    });

    let sectionId: string | null = null;
    if (payload.sectionId) {
      if (!academicClass?.classStandardId) {
        return next(new HttpError(400, "Class standard is missing for section assignment"));
      }
      const section = await prisma.academicSection.findFirst({
        where: {
          id: payload.sectionId,
          classStandardId: academicClass.classStandardId,
          schoolId: user.schoolId
        }
      });
      if (!section) {
        return next(new HttpError(404, "Section not found"));
      }
      sectionId = section.id;
    }

    let templateStructure: Prisma.JsonValue | null = null;
    let templateSections: ExamTemplateSection[] = DEFAULT_CBSE_TEMPLATE_SECTIONS;

    if (payload.templateId) {
      const template = await prisma.examTemplate.findFirst({
        where: { id: payload.templateId, schoolId: user.schoolId }
      });

      if (!template) {
        return next(new HttpError(404, "Template not found"));
      }

      templateStructure = template.sections;

      const sectionParse = z.array(templateSectionSchema).safeParse(template.sections);
      if (!sectionParse.success) {
        return next(new HttpError(400, "Template sections are invalid"));
      }

      templateSections = sectionParse.data;
    }

    const allBooks = selectedSubjects.flatMap((subject) => subject.books);
    const ncertBooks = allBooks.filter((b) => b.type === "NCERT");
    const referenceBooks = allBooks.filter((b) => b.type === "REFERENCE");

    let selectedNcertBookIds = payload.ncertBookIds ?? [];
    let selectedReferenceBookIds = payload.referenceBookIds ?? [];
    if (payload.bookIds && payload.bookIds.length > 0) {
      const selectedBooks = allBooks.filter((book) => payload.bookIds.includes(book.id));
      selectedNcertBookIds = selectedBooks.filter((book) => book.type === "NCERT").map((book) => book.id);
      selectedReferenceBookIds = selectedBooks
        .filter((book) => book.type === "REFERENCE")
        .map((book) => book.id);
    }

    const allowedNcertIds = new Set(ncertBooks.map((b) => b.id));
    const allowedReferenceIds = new Set(referenceBooks.map((b) => b.id));

    const invalidNcert = selectedNcertBookIds.filter(
      (id) => !allowedNcertIds.has(id)
    );

    if (invalidNcert.length > 0) {
      return next(new HttpError(400, "Invalid NCERT book selection"));
    }

    const invalidReference = selectedReferenceBookIds.filter(
      (id) => !allowedReferenceIds.has(id)
    );

    if (invalidReference.length > 0) {
      return next(new HttpError(400, "Invalid reference book selection"));
    }

    let resolvedChapters = payload.ncertChapters ?? [];
    const selectedNcertBooks = ncertBooks.filter((b) => selectedNcertBookIds.includes(b.id));
    let selectedChapterIds = payload.chapterIds ?? [];

    if (payload.mode !== "REFERENCE_ONLY") {
      if (selectedNcertBookIds.length === 0) {
        return next(new HttpError(400, "Select at least one NCERT book"));
      }

      if (selectedChapterIds.length > 0) {
        const allowedChapterIds = new Set(
          selectedNcertBooks.flatMap((book) => book.chapters.map((ch) => ch.id))
        );
        const invalidChapterIds = selectedChapterIds.filter((id) => !allowedChapterIds.has(id));
        if (invalidChapterIds.length > 0) {
          return next(new HttpError(400, "Invalid chapter selection"));
        }
        const chapterTitleById = new Map(
          selectedNcertBooks
            .flatMap((book) => book.chapters)
            .map((chapter) => [chapter.id, chapter.title])
        );
        resolvedChapters = selectedChapterIds
          .map((id) => chapterTitleById.get(id))
          .filter((title): title is string => Boolean(title));
      }

      if (resolvedChapters.length === 0 && selectedNcertBooks.length > 0) {
        const fallbackChapters = selectedNcertBooks.flatMap((book) => book.chapters);
        resolvedChapters = fallbackChapters.map((chapter) => chapter.title);
        selectedChapterIds = fallbackChapters.map((chapter) => chapter.id);
      }

      if (resolvedChapters.length === 0) {
        return res.status(400).json({
          error: "No chapters found for selected books"
        });
      }

      if (selectedChapterIds.length === 0) {
        const allowedChapters = new Set(
          selectedNcertBooks.flatMap((b) => b.chapters.map((ch) => ch.title))
        );

        const invalidChapters = resolvedChapters.filter((ch) => !allowedChapters.has(ch));

        if (invalidChapters.length > 0) {
          return next(new HttpError(400, "Invalid chapter selection"));
        }
      }
    } else if (selectedReferenceBookIds.length === 0) {
      return next(new HttpError(400, "Select at least one reference book"));
    }

    let chapterContext = "";
    if (payload.mode !== "REFERENCE_ONLY") {
      let chapterRecords: Array<{
        title: string;
        chapterNumber: number | null;
        summary: string | null;
        keywords: string | null;
      }> = [];

      if (selectedChapterIds.length > 0) {
        const fetchedChapters = await prisma.academicChapter.findMany({
          where: { id: { in: selectedChapterIds }, schoolId: user.schoolId },
          select: {
            title: true,
            chapterNumber: true,
            summary: true,
            keywords: true
          }
        });

        if (fetchedChapters.length > 0) {
          chapterRecords = fetchedChapters;
          resolvedChapters = fetchedChapters.map((chapter) => chapter.title);
        }
      }

      if (chapterRecords.length === 0) {
        const chapterRecordByTitle = new Map(
          selectedNcertBooks
            .flatMap((book) => book.chapters)
            .map((chapter) => [chapter.title, chapter] as const)
        );

        chapterRecords = resolvedChapters.map((title) => {
          const chapter = chapterRecordByTitle.get(title);
          return {
            title,
            chapterNumber: chapter?.chapterNumber ?? null,
            summary: chapter?.summary ?? null,
            keywords: chapter?.keywords ?? null
          };
        });
      }

      chapterContext = chapterRecords
        .map((chapter) =>
          [
            chapter.chapterNumber !== null
              ? `Chapter ${chapter.chapterNumber}: ${chapter.title}`
              : chapter.title,
            "",
            "Summary:",
            chapter.summary?.trim() || "No summary available.",
            "",
            "Keywords:",
            chapter.keywords?.trim() || "No keywords available."
          ].join("\n")
        )
        .join("\n\n");
    }

    const subjectLabel =
      selectedSubjects.length > 1
        ? selectedSubjects.map((item) => item.name).join(" / ")
        : primarySubject.name;

    const syllabusChapterTitles =
      academicClass?.classStandardId
        ? await prisma.syllabusChapter.findMany({
            where: {
              schoolId: user.schoolId,
              classStandardId: academicClass.classStandardId,
              subjectId: primarySubject.id,
              ...(resolvedChapters.length > 0
                ? {
                    chapterTitle: {
                      in: resolvedChapters
                    }
                  }
                : {})
            },
            orderBy: { chapterNumber: "asc" },
            select: { chapterTitle: true }
          })
        : [];
    const effectiveChapterTitles =
      syllabusChapterTitles.length > 0
        ? syllabusChapterTitles.map((chapter) => chapter.chapterTitle)
        : resolvedChapters;

    const inferredPatternProfile = payload.templateId
      ? null
      : inferNcertTemplateSections({
          classLevel: resolvedClassLevel,
          subject: subjectLabel
        });
    const aiTemplateSections =
      payload.templateId || !inferredPatternProfile
        ? templateSections
        : inferredPatternProfile.sections;
    const aiTemplateStructure =
      payload.templateId || !inferredPatternProfile
        ? templateStructure
        : inferredPatternProfile.sections;

    const syllabusChapterIds = academicClass?.classStandardId
      ? await prisma.syllabusChapter.findMany({
          where: {
            schoolId: user.schoolId,
            classStandardId: academicClass.classStandardId,
            subjectId: primarySubject.id,
            ...(effectiveChapterTitles.length > 0
              ? { chapterTitle: { in: effectiveChapterTitles } }
              : {})
          },
          select: { id: true, chapterTitle: true }
        })
      : [];

    let exam: ExamPayload | null = null;
    let answerKey: ExamPayload | undefined;
    let fallbackUsed = false;
    let fallbackReason: string | null = null;
    let aiUsage:
      | {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        }
      | undefined;

    if (payload.mode === "REFERENCE_ONLY") {
      const usage = await enforceUsageLimit(
        user,
        user.subscription?.meta ?? user.subscriptionMeta
      );

      await ensureDailyTeacherLimit(user);
      await ensureAiUsageWithinLimit(user);

      const examInput: GenerateExamInput = {
        topic: payload.topic,
        subject: subjectLabel,
        subjectId: payload.subjectId,
        subjectIds: payload.subjectIds,
        classId: payload.classId,
        classLevel: resolvedClassLevel,
        sectionId: sectionId ?? undefined,
        language: payload.language,
        difficulty: payload.difficulty,
        templateId: payload.templateId,
        includeAnswerKey: payload.includeAnswerKey ?? true,
        ncertChapters: effectiveChapterTitles,
        mode: payload.mode,
        ncertBookIds: selectedNcertBookIds,
        referenceBookIds: selectedReferenceBookIds,
        templateSections: aiTemplateSections,
        templateStructure: aiTemplateStructure,
        chapterContext,
        ...(inferredPatternProfile?.patternGuidance
          ? { patternGuidance: inferredPatternProfile.patternGuidance }
          : {})
      };

      let examResult:
        | Awaited<ReturnType<typeof generateExam>>
        | ReturnType<typeof buildFallbackExam> = buildFallbackExam(examInput);

      try {
        examResult = await generateExam(examInput);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown AI error";
        console.error("AI ERROR:", message);
        console.log("Using fallback exam");
        fallbackUsed = true;
        fallbackReason = message;
        examResult = buildFallbackExam(examInput, message);
      }

      exam = examResult.exam;
      answerKey = examResult.answerKey;
      aiUsage = "usage" in examResult ? examResult.usage : undefined;

      if (usage.notified && usage.limitCount && usage.periodStart && usage.periodEnd) {
        void notificationService.notify({
          event: "USAGE_LIMIT_WARNING",
          actor: user,
          variables: {
            usedCount: usage.usedCount,
            limitCount: usage.limitCount,
            usagePercent: Math.round((usage.usedCount / usage.limitCount) * 100),
            periodStart: usage.periodStart.toISOString(),
            periodEnd: usage.periodEnd.toISOString()
          }
        });
      }
    } else {
      if (!academicClass?.classStandardId) {
        return next(new HttpError(400, "Class standard is missing for question bank lookup"));
      }

      const sourceQuestions = await prisma.questionBank.findMany({
        where: {
          schoolId: user.schoolId,
          classStandardId: academicClass.classStandardId,
          subjectId: primarySubject.id,
          ...(syllabusChapterIds.length > 0
            ? { chapterId: { in: syllabusChapterIds.map((chapter) => chapter.id) } }
            : {})
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          question: true,
          answer: true,
          type: true,
          optionA: true,
          optionB: true,
          optionC: true,
          optionD: true,
          chapterId: true
        }
      });

      const chapterTitleById = new Map(
        syllabusChapterIds.map((chapter) => [chapter.id, chapter.chapterTitle] as const)
      );

      const typedRows = sourceQuestions.map((row) => ({
        ...row,
        chapterTitle: row.chapterId ? chapterTitleById.get(row.chapterId) ?? null : null
      }));

      let effectiveTemplateSections = aiTemplateSections;
      const strictTemplate = Boolean(payload.templateId);
      let builtFromQuestionBank = false;

      if (typedRows.length > 0) {
        if (!strictTemplate) {
          const typeDistribution = typedRows.reduce<Record<NormalizedQuestionType, number>>(
            (distribution, row) => {
              const normalizedType = normalizeStoredQuestionType(row.type);
              distribution[normalizedType] = (distribution[normalizedType] ?? 0) + 1;
              return distribution;
            },
            {
              mcq: 0,
              very_short: 0,
              short: 0,
              long: 0,
              fill_in_the_blanks: 0
            }
          );

          effectiveTemplateSections = (
            Object.entries(typeDistribution) as Array<[NormalizedQuestionType, number]>
          )
            .filter(([_type, count]) => count > 0)
            .map(([type, count], index) => ({
              title: getSectionTitleForType(type, index),
              type,
              questionsToGenerate: count,
              questionsToAttempt: count,
              marksPerQuestion:
                type === "mcq" || type === "fill_in_the_blanks"
                  ? 1
                  : type === "very_short"
                    ? 2
                    : type === "short"
                      ? 3
                      : 5
            }));
        }

        try {
          const built = buildExamFromQuestionBank({
            rows: typedRows,
            chapterTitles: effectiveChapterTitles,
            templateSections: effectiveTemplateSections,
            strictTemplate,
            metadata: {
              topic: payload.topic ?? subjectLabel,
              subject: subjectLabel,
              classLevel: resolvedClassLevel,
              language: payload.language,
              difficulty: payload.difficulty,
              mode: payload.mode,
              ...(payload.templateId ? { templateId: payload.templateId } : {}),
              ...(sectionId ? { sectionId } : {})
            }
          });

          exam = built.exam;
          answerKey = built.answerKey;
          templateSections = effectiveTemplateSections;
          builtFromQuestionBank = true;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown question bank build error";
          console.error("QUESTION BANK BUILD ERROR:", message);
        }
      }

      if (!builtFromQuestionBank) {
        const usage = await enforceUsageLimit(
          user,
          user.subscription?.meta ?? user.subscriptionMeta
        );

        await ensureDailyTeacherLimit(user);
        await ensureAiUsageWithinLimit(user);

        if (typedRows.length === 0) {
          console.log(
            "No NCERT-aligned source questions found locally. Falling back to inferred NCERT AI generation."
          );
        }

        const examInput: GenerateExamInput = {
          topic: payload.topic,
          subject: subjectLabel,
          subjectId: payload.subjectId,
          subjectIds: payload.subjectIds,
          classId: payload.classId,
          classLevel: resolvedClassLevel,
          sectionId: sectionId ?? undefined,
          language: payload.language,
          difficulty: payload.difficulty,
          templateId: payload.templateId,
          includeAnswerKey: payload.includeAnswerKey ?? true,
          ncertChapters: effectiveChapterTitles,
          mode: payload.mode,
          ncertBookIds: selectedNcertBookIds,
          referenceBookIds: selectedReferenceBookIds,
          templateSections: effectiveTemplateSections,
          templateStructure: payload.templateId ? templateStructure : effectiveTemplateSections,
          chapterContext,
          ...(inferredPatternProfile?.patternGuidance
            ? { patternGuidance: inferredPatternProfile.patternGuidance }
            : {})
        };

        let examResult:
          | Awaited<ReturnType<typeof generateExam>>
          | ReturnType<typeof buildFallbackExam> = buildFallbackExam(examInput);

        try {
          examResult = await generateExam(examInput);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown AI error";
          console.error("AI ERROR:", message);
          console.log("Using fallback exam");
          fallbackUsed = true;
          fallbackReason = message;
          examResult = buildFallbackExam(examInput, message);
        }

        exam = examResult.exam;
        answerKey = examResult.answerKey;
        aiUsage = "usage" in examResult ? examResult.usage : undefined;
        templateSections = effectiveTemplateSections;

        if (usage.notified && usage.limitCount && usage.periodStart && usage.periodEnd) {
          void notificationService.notify({
            event: "USAGE_LIMIT_WARNING",
            actor: user,
            variables: {
              usedCount: usage.usedCount,
              limitCount: usage.limitCount,
              usagePercent: Math.round((usage.usedCount / usage.limitCount) * 100),
              periodStart: usage.periodStart.toISOString(),
              periodEnd: usage.periodEnd.toISOString()
            }
          });
        }
      }
    }

    if (!exam) {
      return next(new HttpError(500, "Exam generation produced no payload"));
    }

    const candidateId = exam.examId || randomUUID();
    const existing = await prisma.exam.findUnique({ where: { id: candidateId } });
    const examId = existing ? randomUUID() : candidateId;

    if (aiUsage && teacherId) {
      await prisma.aiUsage.create({
        data: {
          schoolId: user.schoolId,
          teacherId,
          promptTokens: aiUsage.promptTokens,
          completionTokens: aiUsage.completionTokens,
          totalTokens: aiUsage.totalTokens
        }
      });
    }

    const saved = await prisma.exam.create({
      data: {
        id: examId,
        schoolId: user.schoolId,
        teacherId: teacherId ?? null,
        classId: payload.classId,
        sectionId,
        subjectId: primarySubject.id,
        templateId: payload.templateId ?? null,
        status: "DRAFT",
        assignedClassId: null,
        assignedClassLevel: null,
        meta: {
          subject: exam.metadata.subject,
          classLevel: exam.metadata.classLevel,
          language: exam.metadata.language,
          difficulty: exam.metadata.difficulty,
          ncertChapters: exam.metadata.ncertChapters,
          questionCount: exam.metadata.questionCount,
          choicesPerQuestion: exam.metadata.choicesPerQuestion,
          teacherId,
          schoolId: user.schoolId,
          subjectId: primarySubject.id,
          classId: payload.classId,
          ...(sectionId ? { sectionId } : {}),
          mode: payload.mode,
          status: "DRAFT",
          templateId: payload.templateId,
          answerKeyReleased: false
        },
        aiPayload: {
          sections: exam.sections,
          questions: exam.questions
        },
        generatedAt: new Date(exam.metadata.generatedAt)
      }
    });

    const examPaper = await prisma.examPaper.create({
      data: {
        schoolId: user.schoolId,
        examId: saved.id,
        payload: ({
          metadata: exam.metadata,
          sections: exam.sections,
          questions: exam.questions
        } as unknown) as Prisma.InputJsonValue
      }
    });

    if (answerKey) {
      await prisma.answerKey.create({
        data: {
          schoolId: user.schoolId,
          examPaperId: examPaper.id,
          payload: ({
            metadata: answerKey.metadata,
            sections: answerKey.sections,
            questions: answerKey.questions
          } as unknown) as Prisma.InputJsonValue
        }
      });
    }

    if (academicClass?.classStandardId) {
      const classStandardId = academicClass.classStandardId;
      const syllabusRows = await prisma.syllabusChapter.findMany({
        where: {
          schoolId: user.schoolId,
          classStandardId,
          subjectId: primarySubject.id
        },
        select: {
          id: true,
          chapterTitle: true
        }
      });
      const syllabusByTitle = new Map(
        syllabusRows.map((chapter) => [chapter.chapterTitle.toLowerCase(), chapter.id] as const)
      );
      const sectionTypeByNumber = new Map(
        exam.sections.map((section) => [section.sectionNumber, section.type] as const)
      );

      await prisma.questionBank.createMany({
        data: exam.questions.map((question) => {
          const answerChoice =
            typeof question.answerIndex === "number"
              ? question.choices[question.answerIndex] ?? null
              : question.explanation ?? null;

          return {
            schoolId: user.schoolId,
            classStandardId,
            subjectId: primarySubject.id,
            chapterId: syllabusByTitle.get(question.chapter.toLowerCase()) ?? null,
            difficulty: exam.metadata.difficulty,
            question: question.prompt,
            optionA: question.choices[0] ?? null,
            optionB: question.choices[1] ?? null,
            optionC: question.choices[2] ?? null,
            optionD: question.choices[3] ?? null,
            answer: answerChoice,
            type: mapSectionTypeToQuestionBankType(sectionTypeByNumber.get(question.sectionNumber))
          };
        })
      });
    }

    await notificationService.notify({
      event: "EXAM_GENERATED",
      actor: user,
      examMeta: saved.meta as Record<string, unknown>,
      variables: {
        subject: exam.metadata.subject,
        classLevel: exam.metadata.classLevel,
        difficulty: exam.metadata.difficulty,
        questionCount: exam.metadata.questionCount,
        examId: saved.id
      }
    });

    res.status(201).json({
      examId: saved.id,
      examPaperId: examPaper.id,
      fallbackUsed,
      ...(fallbackReason ? { fallbackReason } : {})
    });
  } catch (error) {
    next(error);
  }
});

/* ======================================================
   LIST EXAMS (TEACHER/ADMIN)
====================================================== */

examsRouter.get("/", requireTeacherOrAdmin, async (req, res, next) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid pagination parameters"));
  }

  try {
    const user = req.user!;
    if (user.role === "TEACHER" && !user.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }
    const { page, pageSize, status } = parsed.data;
    const where = {
      AND: [
        { schoolId: user.schoolId },
        ...(user.role === "TEACHER" && user.teacherId
          ? [{ teacherId: user.teacherId }]
          : []),
        ...(status ? [{ status }] : [])
      ]
    };

    const [total, exams] = await prisma.$transaction([
      prisma.exam.count({ where }),
      prisma.exam.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          meta: true,
          status: true,
          sectionId: true,
          assignedClassId: true,
          assignedClassLevel: true,
          generatedAt: true,
          createdAt: true,
          examPaper: { select: { id: true } }
        }
      })
    ]);

    const items = exams.map((exam) => {
      const meta = parseExamMeta(exam.meta);
      return {
        id: exam.id,
        examPaperId: exam.examPaper?.id ?? null,
        subject: meta.subject,
        classLevel: meta.classLevel,
        classId: meta.classId,
        sectionId: exam.sectionId ?? meta.sectionId,
        language: meta.language,
        difficulty: meta.difficulty,
        ncertChapters: meta.ncertChapters ?? [],
        mode: meta.mode,
        status: exam.status,
        assignedClassId: exam.assignedClassId,
        assignedClassLevel: exam.assignedClassLevel,
        questionCount: meta.questionCount,
        choicesPerQuestion: meta.choicesPerQuestion,
        templateId: meta.templateId,
        generatedAt: exam.generatedAt.toISOString(),
        createdAt: exam.createdAt.toISOString()
      };
    });

    res.json({ page, pageSize, total, items });
  } catch (error) {
    next(error);
  }
});

/* ======================================================
   ASSIGNED EXAMS (STUDENT/PARENT)
====================================================== */

examsRouter.get("/assigned", requireStudentOrParent, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role === "PARENT") {
      const classId = user.classId;
      const sectionId = user.sectionId ?? null;

      if (!classId) {
        return next(new HttpError(403, "Class context required"));
      }

      const exams = await prisma.exam.findMany({
        where: {
          status: "PUBLISHED",
          schoolId: user.schoolId,
          classId,
          ...(sectionId ? { sectionId } : {})
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          meta: true,
          status: true,
          classId: true,
          sectionId: true,
          assignedClassId: true,
          assignedClassLevel: true,
          generatedAt: true,
          createdAt: true,
          examPaper: { select: { id: true } }
        }
      });

      const items = exams.map((exam) => {
        const meta = parseExamMeta(exam.meta);
        return {
          id: exam.id,
          examPaperId: exam.examPaper?.id ?? null,
          subject: meta.subject,
          classLevel: meta.classLevel,
          classId: exam.classId,
          sectionId: exam.sectionId ?? meta.sectionId,
          language: meta.language,
          difficulty: meta.difficulty,
          ncertChapters: meta.ncertChapters ?? [],
          mode: meta.mode,
          status: exam.status,
          assignedClassId: exam.assignedClassId,
          assignedClassLevel: exam.assignedClassLevel,
          questionCount: meta.questionCount,
          choicesPerQuestion: meta.choicesPerQuestion,
          templateId: meta.templateId,
          generatedAt: exam.generatedAt.toISOString(),
          createdAt: exam.createdAt.toISOString()
        };
      });

      return res.json({ items });
    }

    const where = await getStudentExamWhere(user);
    const exams = await prisma.exam.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        meta: true,
        status: true,
        classId: true,
        sectionId: true,
        assignedClassId: true,
        assignedClassLevel: true,
        generatedAt: true,
        createdAt: true,
        examPaper: { select: { id: true } }
      }
    });

    const items = exams.map((exam) => {
      const meta = parseExamMeta(exam.meta);
      return {
        id: exam.id,
        examPaperId: exam.examPaper?.id ?? null,
        subject: meta.subject,
        classLevel: meta.classLevel,
        classId: exam.classId,
        sectionId: exam.sectionId ?? meta.sectionId,
        language: meta.language,
        difficulty: meta.difficulty,
        ncertChapters: meta.ncertChapters ?? [],
        mode: meta.mode,
        status: exam.status,
        assignedClassId: exam.assignedClassId,
        assignedClassLevel: exam.assignedClassLevel,
        questionCount: meta.questionCount,
        choicesPerQuestion: meta.choicesPerQuestion,
        templateId: meta.templateId,
        generatedAt: exam.generatedAt.toISOString(),
        createdAt: exam.createdAt.toISOString()
      };
    });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

examsRouter.get("/student/exams", requireStudent, async (req, res, next) => {
  try {
    const user = req.user!;
    const where = await getStudentExamWhere(user);
    const exams = await prisma.exam.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        meta: true,
        status: true,
        classId: true,
        sectionId: true,
        assignedClassId: true,
        assignedClassLevel: true,
        generatedAt: true,
        createdAt: true,
        examPaper: { select: { id: true } }
      }
    });

    const items = exams.map((exam) => {
      const meta = parseExamMeta(exam.meta);
      return {
        id: exam.id,
        examPaperId: exam.examPaper?.id ?? null,
        subject: meta.subject,
        classLevel: meta.classLevel,
        classId: exam.classId,
        sectionId: exam.sectionId ?? meta.sectionId,
        language: meta.language,
        difficulty: meta.difficulty,
        ncertChapters: meta.ncertChapters ?? [],
        mode: meta.mode,
        status: exam.status,
        assignedClassId: exam.assignedClassId,
        assignedClassLevel: exam.assignedClassLevel,
        questionCount: meta.questionCount,
        choicesPerQuestion: meta.choicesPerQuestion,
        templateId: meta.templateId,
        generatedAt: exam.generatedAt.toISOString(),
        createdAt: exam.createdAt.toISOString()
      };
    });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

examsRouter.get("/archived", requireTeacher, async (req, res, next) => {
  try {
    const user = req.user!;
    if (!user.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }

    const exams = await prisma.exam.findMany({
      where: {
        schoolId: user.schoolId,
        teacherId: user.teacherId,
        status: "ARCHIVED"
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        meta: true,
        status: true,
        sectionId: true,
        assignedClassId: true,
        assignedClassLevel: true,
        generatedAt: true,
        createdAt: true,
        examPaper: { select: { id: true } }
      }
    });

    const items = exams.map((exam) => {
      const meta = parseExamMeta(exam.meta);
      return {
        id: exam.id,
        examPaperId: exam.examPaper?.id ?? null,
        subject: meta.subject,
        classLevel: meta.classLevel,
        classId: meta.classId,
        sectionId: exam.sectionId ?? meta.sectionId,
        language: meta.language,
        difficulty: meta.difficulty,
        ncertChapters: meta.ncertChapters ?? [],
        mode: meta.mode,
        status: exam.status,
        assignedClassId: exam.assignedClassId,
        assignedClassLevel: exam.assignedClassLevel,
        questionCount: meta.questionCount,
        choicesPerQuestion: meta.choicesPerQuestion,
        templateId: meta.templateId,
        generatedAt: exam.generatedAt.toISOString(),
        createdAt: exam.createdAt.toISOString()
      };
    });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

examsRouter.get("/assigned/:id", requireStudentOrParent, async (req, res, next) => {
  try {
    const user = req.user!;

    const examId = getParamId(req.params.id);
    if (!examId) {
      return next(new HttpError(400, "Exam id is required"));
    }

    if (user.role === "PARENT") {
      const classId = user.classId;
      const sectionId = user.sectionId ?? null;
      if (!classId) {
        return next(new HttpError(403, "Class context required"));
      }

      const exam = await prisma.exam.findFirst({
        where: {
          id: examId,
          status: "PUBLISHED",
          schoolId: user.schoolId,
          classId,
          ...(sectionId ? { sectionId } : {})
        },
        include: {
          examPaper: {
            select: { id: true, payload: true }
          }
        }
      });

      if (!exam) {
        return next(new HttpError(404, "Exam not found"));
      }

      const meta = parseExamMeta(exam.meta);
      const payload = exam.examPaper?.payload as Record<string, unknown> | undefined;
      const sections = Array.isArray(payload?.sections) ? payload.sections : [];
      const questions = Array.isArray(payload?.questions) ? payload.questions : [];
      const allowAnswerKey = Boolean(
        (exam.meta as Record<string, unknown>)?.answerKeyReleased
      );

      return res.json({
        id: exam.id,
        examPaperId: exam.examPaper?.id ?? null,
        metadata: {
          ...meta,
          status: exam.status,
          sectionId: exam.sectionId ?? meta.sectionId,
          assignedClassId: exam.assignedClassId,
          assignedClassLevel: exam.assignedClassLevel
        },
        sections,
        questions: allowAnswerKey ? questions : stripAnswerKey(questions),
        generatedAt: exam.generatedAt.toISOString(),
        createdAt: exam.createdAt.toISOString(),
        updatedAt: exam.updatedAt.toISOString()
      });
    }

    const studentWhere = await getStudentExamWhere(user);
    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        ...studentWhere
      },
      include: {
        examPaper: {
          select: { id: true, payload: true }
        }
      }
    });

    if (!exam) {
      return next(new HttpError(404, "Exam not found"));
    }

    const meta = parseExamMeta(exam.meta);

    const payload = exam.examPaper?.payload as Record<string, unknown> | undefined;
    const sections = Array.isArray(payload?.sections) ? payload.sections : [];
    const questions = Array.isArray(payload?.questions) ? payload.questions : [];
    const allowAnswerKey = Boolean(
      (exam.meta as Record<string, unknown>)?.answerKeyReleased
    );

    res.json({
      id: exam.id,
      examPaperId: exam.examPaper?.id ?? null,
      metadata: {
        ...meta,
        status: exam.status,
        sectionId: exam.sectionId ?? meta.sectionId,
        assignedClassId: exam.assignedClassId,
        assignedClassLevel: exam.assignedClassLevel
      },
      sections,
      questions: allowAnswerKey ? questions : stripAnswerKey(questions),
      generatedAt: exam.generatedAt.toISOString(),
      createdAt: exam.createdAt.toISOString(),
      updatedAt: exam.updatedAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

examsRouter.get("/:id/preview", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const examId = getParamId(req.params.id);
    if (!examId) {
      return next(new HttpError(400, "Exam id is required"));
    }

    const exam = await findAccessibleExamForPreview(user, examId);
    if (!exam) {
      return next(new HttpError(404, "Exam not found"));
    }

    res.json(buildExamPreviewResponse(exam));
  } catch (error) {
    next(error);
  }
});



/* ======================================================
   GET EXAM (TEACHER/ADMIN)
====================================================== */

examsRouter.get("/:id", requireTeacherOrAdmin, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role !== "TEACHER") {
      return next(new HttpError(403, "Teacher role required"));
    }
    if (isTeacher(user) && !user.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }
    const examId = getParamId(req.params.id);
    if (!examId) {
      return next(new HttpError(400, "Exam id is required"));
    }
    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        AND: [
          { schoolId: user.schoolId },
          ...(isTeacher(user) && user.teacherId ? [{ teacherId: user.teacherId }] : [])
        ]
      },
      include: {
        examPaper: { select: { id: true, payload: true } }
      }
    });

    if (!exam) {
      return next(new HttpError(404, "Exam not found"));
    }

    const meta = parseExamMeta(exam.meta);

    const payload = exam.examPaper?.payload as Record<string, unknown> | undefined;
    res.json({
      id: exam.id,
      examPaperId: exam.examPaper?.id ?? null,
      metadata: {
        ...meta,
        status: exam.status,
        sectionId: exam.sectionId ?? meta.sectionId,
        assignedClassId: exam.assignedClassId,
        assignedClassLevel: exam.assignedClassLevel,
        answerKeyReleased: meta.answerKeyReleased ?? false
      },
      sections: payload?.sections ?? [],
      questions: payload?.questions ?? [],
      generatedAt: exam.generatedAt.toISOString(),
      createdAt: exam.createdAt.toISOString(),
      updatedAt: exam.updatedAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/* ======================================================
   UPDATE STATUS
====================================================== */

examsRouter.post("/:id/publish", requireTeacher, async (req, res, next) => {
  const parsed = z
    .object({ assignedClassId: z.string().trim().min(1) })
    .strict()
    .safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "assignedClassId is required to publish"));
  }

  try {
    const user = req.user!;
    if (!user.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }
    await ensureTeacherCanPublish(user);
    const examId = getParamId(req.params.id);
    if (!examId) {
      return next(new HttpError(400, "Exam id is required"));
    }

    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        schoolId: user.schoolId,
        teacherId: user.teacherId
      }
    });

    if (!exam) {
      return next(new HttpError(404, "Exam not found"));
    }

    const klass = await prisma.academicClass.findFirst({
      where: { id: parsed.data.assignedClassId, schoolId: user.schoolId },
      select: { id: true, classLevel: true }
    });
    if (!klass) {
      return next(new HttpError(404, "Assigned class not found"));
    }

    if (klass.id !== exam.classId) {
      return next(
        new HttpError(400, "Exam can only be published to the exact class selected during generation")
      );
    }

    const updated = await prisma.exam.update({
      where: { id: exam.id },
      data: {
        status: "PUBLISHED",
        assignedClassId: klass.id,
        assignedClassLevel: klass.classLevel,
        publishedAt: new Date(),
        meta: {
          ...(exam.meta as Record<string, unknown>),
          status: "PUBLISHED",
          assignedClassId: klass.id,
          assignedClassLevel: klass.classLevel
        }
      }
    });

    res.json({
      id: updated.id,
      status: updated.status,
      assignedClassId: updated.assignedClassId,
      assignedClassLevel: updated.assignedClassLevel,
      publishedAt: updated.publishedAt?.toISOString() ?? null
    });
  } catch (error) {
    next(error);
  }
});

examsRouter.post("/:id/archive", requireTeacher, async (req, res, next) => {
  try {
    const user = req.user!;
    if (!user.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }
    const examId = getParamId(req.params.id);
    if (!examId) {
      return next(new HttpError(400, "Exam id is required"));
    }

    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        schoolId: user.schoolId,
        teacherId: user.teacherId
      }
    });

    if (!exam) {
      return next(new HttpError(404, "Exam not found"));
    }

    const updated = await prisma.exam.update({
      where: { id: exam.id },
      data: {
        status: "ARCHIVED",
        meta: {
          ...(exam.meta as Record<string, unknown>),
          status: "ARCHIVED"
        }
      }
    });

    res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    next(error);
  }
});

examsRouter.post("/:id/answer-key", requireTeacherOrAdmin, async (req, res, next) => {
  const parsed = z
    .object({ release: z.coerce.boolean() })
    .strict()
    .safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid answer key request"));
  }

  try {
    const user = req.user!;
    const examId = getParamId(req.params.id);
    if (!examId) {
      return next(new HttpError(400, "Exam id is required"));
    }

    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        schoolId: user.schoolId,
        ...(user.role === "TEACHER" && user.teacherId ? { teacherId: user.teacherId } : {})
      }
    });

    if (!exam) {
      return next(new HttpError(404, "Exam not found"));
    }

    const updated = await prisma.exam.update({
      where: { id: exam.id },
      data: {
        meta: {
          ...(exam.meta as Record<string, unknown>),
          answerKeyReleased: parsed.data.release
        }
      }
    });

    res.json({ id: updated.id, answerKeyReleased: parsed.data.release });
  } catch (error) {
    next(error);
  }
});

examsRouter.patch("/:id/status", requireTeacherOrAdmin, async (req, res, next) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid status update request"));
  }

  try {
    const user = req.user!;
    if (isTeacher(user) && !user.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }
    if (parsed.data.status === "PUBLISHED") {
      await ensureTeacherCanPublish(user);
    }
    const examId = getParamId(req.params.id);
    if (!examId) {
      return next(new HttpError(400, "Exam id is required"));
    }
    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        AND: [
          { schoolId: user.schoolId },
          ...(isTeacher(user) && user.teacherId ? [{ teacherId: user.teacherId }] : [])
        ]
      }
    });

    if (!exam) {
      return next(new HttpError(404, "Exam not found"));
    }

    if (!isLifecycleTransitionAllowed(exam.status, parsed.data.status)) {
      return next(new HttpError(400, "Invalid exam lifecycle transition"));
    }

    let assignedClassId: string | null = exam.assignedClassId;
    let assignedClassLevel: number | null = exam.assignedClassLevel;

    if (parsed.data.status === "PUBLISHED") {
      if (!parsed.data.assignedClassId) {
        return next(new HttpError(400, "assignedClassId is required to publish"));
      }
      const klass = await prisma.academicClass.findFirst({
        where: { id: parsed.data.assignedClassId, schoolId: user.schoolId },
        select: { id: true, classLevel: true }
      });
      if (!klass) {
        return next(new HttpError(404, "Assigned class not found"));
      }
      if (klass.id !== exam.classId) {
        return next(
          new HttpError(400, "Exam can only be published to the exact class selected during generation")
        );
      }
      assignedClassId = klass.id;
      assignedClassLevel = klass.classLevel;
    }

    const updated = await prisma.exam.update({
      where: { id: exam.id },
      data: {
        status: parsed.data.status,
        assignedClassId,
        assignedClassLevel,
        ...(parsed.data.status === "PUBLISHED" ? { publishedAt: new Date() } : {}),
        meta: {
          ...(exam.meta as Record<string, unknown>),
          status: parsed.data.status,
          assignedClassId,
          assignedClassLevel
        }
      }
    });

    res.json({
      id: updated.id,
      status: updated.status,
      assignedClassId: updated.assignedClassId,
      assignedClassLevel: updated.assignedClassLevel,
      updatedAt: updated.updatedAt.toISOString()
    });
  } catch (error) {
    next(error);
  }
});
/* ======================================================
   PDF EXPORT
====================================================== */

examsRouter.get("/:id/pdf", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const examId = getParamId(req.params.id);
    if (!examId) {
      return next(new HttpError(400, "Exam id is required"));
    }

    const exam = await findAccessibleExamForPreview(user, examId);

    if (!exam) {
      return next(new HttpError(404, "Exam not found"));
    }

    const meta = parseExamMeta(exam.meta);
    const payload = exam.examPaper?.payload as Record<string, unknown> | undefined;
    const sections = Array.isArray(payload?.sections) ? payload.sections : [];
    const questions = Array.isArray(payload?.questions) ? payload.questions : [];

    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { name: true, logoUrl: true }
    });

    const brandingOverrides: { schoolName?: string; logoPath?: string } = {};
    if (school?.name) {
      brandingOverrides.schoolName = school.name;
    }
    if (school?.logoUrl) {
      brandingOverrides.logoPath = school.logoUrl;
    }
    const branding = resolveSchoolBranding(user, brandingOverrides);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=exam-${exam.id}.pdf`);

    streamExamPdf(res, {
      exam: {
        examId: exam.id,
        metadata: {
          subject: meta.subject ?? "Exam",
          classLevel: meta.classLevel ?? 0,
          language: (meta.language as GenerateExamInput["language"]) ?? "english",
          difficulty: (meta.difficulty as GenerateExamInput["difficulty"]) ?? "medium",
          questionCount: meta.questionCount ?? 0,
          choicesPerQuestion: meta.choicesPerQuestion ?? 0,
          generatedAt: exam.generatedAt.toISOString(),
          ncertChapters: meta.ncertChapters ?? [],
          mode: (meta.mode as GenerateExamInput["mode"]) ?? "NCERT_ONLY",
          topic: meta.subject ?? "Exam"
        },
        sections,
        questions
      },
      branding
    });
  } catch (error) {
    next(error);
  }
});

examsRouter.get("/:id/question-paper", requireTeacherOrAdmin, async (req, res, next) => {
  try {
    const user = req.user!;
    const examId = getParamId(req.params.id);
    if (!examId) {
      return next(new HttpError(400, "Exam id is required"));
    }
    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        schoolId: user.schoolId
      },
      include: {
        examPaper: { select: { id: true, payload: true } }
      }
    });

    if (!exam) {
      return next(new HttpError(404, "Exam not found"));
    }

    const meta = parseExamMeta(exam.meta);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=exam-${exam.id}-paper.pdf`);

    const payload = exam.examPaper?.payload as Record<string, unknown> | undefined;
    const sections = Array.isArray(payload?.sections) ? payload.sections : [];
    const questions = Array.isArray(payload?.questions) ? payload.questions : [];

    streamQuestionPaperPdf(res, {
      exam: {
        examId: exam.id,
        metadata: {
          subject: meta.subject ?? "Exam",
          classLevel: meta.classLevel ?? 0,
          language: (meta.language as GenerateExamInput["language"]) ?? "english",
          difficulty: (meta.difficulty as GenerateExamInput["difficulty"]) ?? "medium",
          questionCount: meta.questionCount ?? 0,
          choicesPerQuestion: meta.choicesPerQuestion ?? 0,
          generatedAt: exam.generatedAt.toISOString(),
          ncertChapters: meta.ncertChapters ?? [],
          mode: (meta.mode as GenerateExamInput["mode"]) ?? "NCERT_ONLY",
          topic: meta.subject ?? "Exam"
        },
        sections,
        questions
      },
      branding: resolveSchoolBranding(user)
    });
  } catch (error) {
    next(error);
  }
});

examsRouter.get("/papers/:examPaperId/answer-key", requireTeacherOrAdmin, async (req, res, next) => {
  try {
    const user = req.user!;
    const examPaperId = getParamId(req.params.examPaperId);
    if (!examPaperId) {
      return next(new HttpError(400, "Exam paper id is required"));
    }
    const examPaper = await prisma.examPaper.findFirst({
      where: {
        id: examPaperId,
        schoolId: user.schoolId
      },
      include: {
        exam: { select: { id: true, meta: true, schoolId: true, generatedAt: true } },
        answerKey: { select: { payload: true } }
      }
    });

    if (!examPaper || !examPaper.answerKey) {
      return next(new HttpError(404, "Answer key not found"));
    }

    const meta = parseExamMeta(examPaper.exam.meta);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=exam-${examPaper.exam.id}-answer-key.pdf`
    );

    const payload = examPaper.answerKey.payload as Record<string, unknown>;
    const sections = Array.isArray(payload?.sections) ? payload.sections : [];
    const questions = Array.isArray(payload?.questions) ? payload.questions : [];

    streamAnswerKeyPdf(res, {
      exam: {
        examId: examPaper.exam.id,
        metadata: {
          subject: meta.subject ?? "Exam",
          classLevel: meta.classLevel ?? 0,
          language: (meta.language as GenerateExamInput["language"]) ?? "english",
          difficulty: (meta.difficulty as GenerateExamInput["difficulty"]) ?? "medium",
          questionCount: meta.questionCount ?? 0,
          choicesPerQuestion: meta.choicesPerQuestion ?? 0,
          generatedAt: examPaper.exam.generatedAt.toISOString(),
          ncertChapters: meta.ncertChapters ?? [],
          mode: (meta.mode as GenerateExamInput["mode"]) ?? "NCERT_ONLY",
          topic: meta.subject ?? "Exam"
        },
        sections,
        questions
      },
      branding: resolveSchoolBranding(user)
    });
  } catch (error) {
    next(error);
  }
});

examsRouter.get("/:id/docx", requireTeacherOrAdmin, async (req, res, next) => {
  try {
    const user = req.user!;
    const examId = getParamId(req.params.id);
    if (!examId) {
      return next(new HttpError(400, "Exam id is required"));
    }

    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        schoolId: user.schoolId
      },
      include: {
        examPaper: { select: { payload: true } }
      }
    });

    if (!exam || !exam.examPaper) {
      return next(new HttpError(404, "Exam not found"));
    }

    const meta = parseExamMeta(exam.meta);
    const payload = exam.examPaper.payload as Record<string, unknown>;
    const sections = Array.isArray(payload?.sections) ? payload.sections : [];
    const questions = Array.isArray(payload?.questions) ? payload.questions : [];

    const buffer = await buildExamDocx(
      {
        examId: exam.id,
        metadata: {
          subject: meta.subject ?? "Exam",
          classLevel: meta.classLevel ?? 0,
          language: (meta.language as GenerateExamInput["language"]) ?? "english",
          difficulty: (meta.difficulty as GenerateExamInput["difficulty"]) ?? "medium",
          questionCount: meta.questionCount ?? 0,
          choicesPerQuestion: meta.choicesPerQuestion ?? 0,
          generatedAt: exam.generatedAt.toISOString(),
          ncertChapters: meta.ncertChapters ?? [],
          mode: (meta.mode as GenerateExamInput["mode"]) ?? "NCERT_ONLY",
          topic: meta.subject ?? "Exam"
        },
        sections,
        questions
      },
      user
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=exam-${exam.id}.docx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});
