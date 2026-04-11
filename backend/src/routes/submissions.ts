import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { Prisma } from "@prisma/client";
import {
  requireAuth,
  isAdmin,
  requireStudent,
  requireTeacher
} from "../middleware/auth";
import { HttpError } from "../middleware/error";
import {
  evaluateStructuredAnswers,
  evaluateRawTextAnswers,
  evaluationResultSchema,
  normalizeEvaluation
} from "../services/ai.evaluation.service";
import { evaluateAnswers } from "../services/ai.evaluate.service";
import {
  extractTextFromImage,
  extractTextFromPDF
} from "../services/ocr.service";
import { notificationService } from "../services/notifications";
import type { AuthUser } from "../types/auth";
import type { EvaluationResult } from "../types/evaluation";
import type { ExamQuestion } from "../types/exam";

export const submissionsRouter = Router();

type UploadFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
};

type UploadRequest = Request & {
  file?: UploadFile;
  files?: UploadFile[];
};

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf"
]);
const allowedAnswerMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png"
]);
const MAX_ANSWER_UPLOAD_BYTES = 5 * 1024 * 1024;

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function getStudentId(user: AuthUser): string | null {
  if (user.role === "STUDENT") {
    return user.studentId ?? user.id;
  }
  if (user.role === "PARENT") {
    if (user.studentId) return user.studentId;
    return user.studentIds?.[0] ?? null;
  }
  return null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function canStudentAccessExam(
  user: AuthUser,
  exam: {
    status: string;
    classId: string | null;
    sectionId: string | null;
    assignedClassId: string | null;
    assignedClassLevel: number | null;
    meta?: Prisma.JsonValue;
  }
): boolean {
  if (user.role !== "STUDENT" && user.role !== "PARENT") {
    return true;
  }
  if (exam.status !== "PUBLISHED") {
    return false;
  }
  if (!exam.classId) {
    return false;
  }
  const classId = user.classId;
  const sectionId = user.sectionId ?? null;
  if (classId && exam.classId !== classId) {
    return false;
  }
  const assignedSectionIds = normalizeStringArray(
    exam.meta && typeof exam.meta === "object"
      ? (exam.meta as Record<string, unknown>).assignedSectionIds
      : undefined
  );
  if (sectionId && assignedSectionIds.length > 0 && !assignedSectionIds.includes(sectionId)) {
    return false;
  }
  if (sectionId && assignedSectionIds.length === 0 && exam.sectionId && exam.sectionId !== sectionId) {
    return false;
  }
  return Boolean(classId);
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const typedReq = req as UploadRequest;
    const user = typedReq.user;
    const studentId = user ? getStudentId(user) : null;
    const examIdParam = typedReq.params.examId;
    const examId = Array.isArray(examIdParam) ? examIdParam[0] : examIdParam;
    if (!studentId) {
      return cb(new HttpError(401, "Authentication required"), "");
    }

    const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
    const targetDir = examId
      ? path.join(uploadRoot, "submissions", examId, studentId)
      : path.join(uploadRoot, "submissions", "inbox", studentId);
    fs.mkdirSync(targetDir, { recursive: true });
    return cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname) || ".bin";
    cb(null, `${randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: env.UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new HttpError(400, "Unsupported file type"));
    }
    return cb(null, true);
  }
});

const answerUpload = multer({
  storage,
  limits: { fileSize: MAX_ANSWER_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!allowedAnswerMimeTypes.has(file.mimetype)) {
      return cb(new HttpError(400, "Only PDF or images allowed"));
    }
    return cb(null, true);
  }
});

function buildSubmissionFileUrl(filePath: string) {
  const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
  const relativePath = path.relative(uploadRoot, filePath).replace(/\\/g, "/");
  return `${env.UPLOAD_DIR}/${relativePath}`.replace(/^\/+/, "");
}

async function extractSubmissionText(file: UploadFile) {
  return file.mimetype === "application/pdf"
    ? extractTextFromPDF(file.path)
    : extractTextFromImage(file.path);
}

const submissionBodySchema = z
  .object({
    timeTakenSeconds: z.coerce.number().int().positive().optional(),
    rawTextAnswer: z.string().trim().min(1).optional(),
    structuredAnswers: z
      .preprocess((value) => {
        if (typeof value === "string" && value.trim().length > 0) {
          try {
            return JSON.parse(value);
          } catch (_error) {
            return value;
          }
        }
        return value;
      }, z
        .array(
          z
            .object({
              questionNumber: z.coerce.number().int().positive(),
              answer: z.string().min(1)
            })
            .strict()
        )
        .optional())
  })
  .strict();

const quickSubmitSchema = z
  .object({
    examId: z.string().min(1),
    answers: z.preprocess(
      (value) => {
        if (typeof value === "string" && value.trim().length > 0) {
          try {
            return JSON.parse(value);
          } catch (_error) {
            return value;
          }
        }
        return value;
      },
      z
        .array(
          z
            .object({
              questionNumber: z.coerce.number().int().positive(),
              answer: z.string().trim().min(1)
            })
            .strict()
        )
        .optional()
    ),
    typedAnswers: z.string().trim().min(1).optional(),
    rawTextAnswer: z.string().trim().min(1).optional()
  })
  .strict();

const reviewBodySchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"]),
    teacherScore: z.number().nonnegative().optional(),
    teacherResult: evaluationResultSchema.optional(),
    rejectionReason: z.string().min(1).optional()
  })
  .strict();

const approveSubmissionSchema = z
  .object({
    submissionId: z.string().min(1),
    teacherScore: z.number().nonnegative().optional(),
    teacherResult: evaluationResultSchema.optional(),
    rejectionReason: z.string().min(1).optional()
  })
  .strict();

const questionSchema = z
  .object({
    number: z.number().int().positive(),
    prompt: z.string().min(1),
    type: z.string().min(1).optional()
  })
  .passthrough();

function parseRawTextAnswers(rawText: string) {
  const answers: Array<{ questionNumber: number; answer: string }> = [];
  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)[\.\)]\s*(.+)$/);
    if (!match) continue;
    const questionNumber = Number(match[1]);
    const answer = match[2].trim();
    if (Number.isFinite(questionNumber) && answer.length > 0) {
      answers.push({ questionNumber, answer });
    }
  }
  return answers;
}

function parseExamQuestions(payload: unknown): ExamQuestion[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const rawQuestions = (payload as Record<string, unknown>).questions;
  const parsedQuestions = z.array(questionSchema).safeParse(rawQuestions);
  return parsedQuestions.success ? (parsedQuestions.data as ExamQuestion[]) : [];
}

function getCorrectAnswer(question: ExamQuestion) {
  if (typeof question.answerIndex === "number" && question.choices[question.answerIndex]) {
    return question.choices[question.answerIndex];
  }
  if (typeof question.explanation === "string" && question.explanation.trim().length > 0) {
    return question.explanation.trim();
  }
  return "Not available";
}

function buildStudentAnswerMap(params: {
  questions: ExamQuestion[];
  structuredAnswers?: Array<{ questionNumber: number; answer: string }>;
  rawTextAnswer?: string;
}) {
  const structuredMap = new Map(
    (params.structuredAnswers ?? []).map((entry) => [entry.questionNumber, entry.answer.trim()] as const)
  );
  const parsedRawAnswers = params.rawTextAnswer ? parseRawTextAnswers(params.rawTextAnswer) : [];
  const rawMap = new Map(parsedRawAnswers.map((entry) => [entry.questionNumber, entry.answer] as const));

  return new Map(
    params.questions.map((question) => [
      question.number,
      structuredMap.get(question.number) ??
        rawMap.get(question.number) ??
        "Not clearly extracted"
    ] as const)
  );
}

function buildManualReviewTemplate(questions: ExamQuestion[]): EvaluationResult | null {
  if (questions.length === 0) {
    return null;
  }

  return normalizeEvaluation(
    {
      totalScore: 0,
      overallScore: 0,
      maxScore: questions.length,
      summary: "AI evaluation is unavailable. Manual teacher review is required.",
      authenticity: {
        handwritingLikely: false,
        aiGeneratedLikelihood: 0,
        notes: "AI evaluation was unavailable for this submission."
      },
      breakdown: questions.map((question) => ({
        questionNumber: question.number,
        question: question.prompt,
        studentAnswer: "Not clearly extracted",
        correctAnswer: getCorrectAnswer(question),
        score: 0,
        maxScore: 1,
        reason: "Manual review pending.",
        detectedAnswer: "unavailable"
      })),
      perQuestion: questions.map((question) => ({
        questionNumber: question.number,
        question: question.prompt,
        studentAnswer: "Not clearly extracted",
        correctAnswer: getCorrectAnswer(question),
        score: 0,
        maxScore: 1,
        reason: "Manual review pending.",
        remarks: "Manual review pending.",
        detectedAnswer: "unavailable"
      })),
      topicAnalysis: {
        strengths: [],
        weaknesses: ["Manual teacher review pending"]
      }
    },
    questions
  );
}

function buildAiUnavailableEvaluation(params: {
  questions: ExamQuestion[];
  structuredAnswers?: Array<{ questionNumber: number; answer: string }>;
  rawTextAnswer?: string;
  reason: string;
}) {
  const studentAnswerMap = buildStudentAnswerMap({
    questions: params.questions,
    ...(params.structuredAnswers ? { structuredAnswers: params.structuredAnswers } : {}),
    ...(params.rawTextAnswer ? { rawTextAnswer: params.rawTextAnswer } : {})
  });

  return normalizeEvaluation(
    {
      totalScore: 0,
      overallScore: 0,
      maxScore: params.questions.length,
      summary: "AI unavailable. Teacher review required.",
      authenticity: {
        handwritingLikely: false,
        aiGeneratedLikelihood: 0,
        notes: params.reason
      },
      breakdown: params.questions.map((question) => ({
        questionNumber: question.number,
        question: question.prompt,
        studentAnswer: studentAnswerMap.get(question.number) ?? "Not clearly extracted",
        correctAnswer: getCorrectAnswer(question),
        score: 0,
        maxScore: 1,
        reason: "AI unavailable. Teacher review required.",
        detectedAnswer: studentAnswerMap.get(question.number) ?? "Not clearly extracted"
      })),
      perQuestion: params.questions.map((question) => ({
        questionNumber: question.number,
        question: question.prompt,
        studentAnswer: studentAnswerMap.get(question.number) ?? "Not clearly extracted",
        correctAnswer: getCorrectAnswer(question),
        score: 0,
        maxScore: 1,
        reason: "AI unavailable. Teacher review required.",
        remarks: "AI unavailable. Teacher review required.",
        detectedAnswer: studentAnswerMap.get(question.number) ?? "Not clearly extracted"
      })),
      topicAnalysis: {
        strengths: [],
        weaknesses: ["AI unavailable"]
      }
    },
    params.questions
  );
}

function isAiUnavailableEvaluation(result: EvaluationResult | null | undefined) {
  return Boolean(
    result &&
      (result.summary.toLowerCase().includes("ai unavailable") ||
        result.authenticity.notes.toLowerCase().includes("ai unavailable"))
  );
}

async function resolveEvaluationResult(
  label: string,
  task: () => Promise<EvaluationResult>,
  fallbackParams: {
    questions: ExamQuestion[];
    structuredAnswers?: Array<{ questionNumber: number; answer: string }>;
    rawTextAnswer?: string;
  }
) {
  try {
    return {
      evaluation: await task(),
      aiAvailable: true
    } as const;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "AI evaluation failed";
    console.error(`[submissions] ${label} failed; saving submission with explicit AI unavailable state`, error);
    return {
      evaluation: buildAiUnavailableEvaluation({
        ...fallbackParams,
        reason
      }),
      aiAvailable: false
    } as const;
  }
}

async function createSubmissionEvaluation(params: {
  examId: string;
  schoolId: string;
  studentId: string;
  file?: UploadFile;
  filePathOverride?: string;
  structuredAnswers?: Array<{ questionNumber: number; answer: string }>;
  rawTextAnswer?: string;
  extractedText?: string;
  timeTakenSeconds?: number;
  evaluation: EvaluationResult;
  aiAvailable: boolean;
}) {
  const createdSubmission = await prisma.examSubmission.create({
    data: {
      examId: params.examId,
      studentId: params.studentId,
      schoolId: params.schoolId,
      submittedAt: new Date(),
      ...(params.timeTakenSeconds !== undefined
        ? { timeTakenSeconds: params.timeTakenSeconds }
        : {}),
      ...(params.file
        ? {
            filePath: params.filePathOverride ?? params.file.path,
            fileName: params.file.originalname,
            fileMime: params.file.mimetype,
            fileSize: params.file.size
          }
        : {}),
      ...(params.structuredAnswers
        ? { structuredAnswers: toPrismaJson(params.structuredAnswers) }
        : {}),
      ...(params.rawTextAnswer ? { rawTextAnswer: params.rawTextAnswer } : {}),
      ...(params.extractedText ? { extractedText: params.extractedText } : {})
    }
  });

  try {
    const createdEvaluation = await prisma.examEvaluation.create({
      data: {
        submissionId: createdSubmission.id,
        examId: params.examId,
        studentId: params.studentId,
        schoolId: params.schoolId,
        status: "PENDING",
        ...(params.aiAvailable ? { aiScore: params.evaluation.totalScore } : {}),
        aiResult: toPrismaJson(params.evaluation),
        aiFlags: toPrismaJson(params.evaluation.authenticity)
      }
    });

    return [createdSubmission, createdEvaluation] as const;
  } catch (error) {
    await prisma.examSubmission
      .delete({
        where: { id: createdSubmission.id }
      })
      .catch(() => undefined);
    throw error;
  }
}

submissionsRouter.post(
  "/exams/:examId/submissions",
  requireAuth,
  requireStudent,
  upload.single("file"),
  async (req, res, next) => {
    const parsed = submissionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }));
      return next(new HttpError(400, "Invalid submission request", details));
    }

    const typedReq = req as UploadRequest;
    const file = typedReq.file;
    const rawTextAnswer = parsed.data.rawTextAnswer?.trim();
    let structuredAnswers = parsed.data.structuredAnswers;

    if ((!structuredAnswers || structuredAnswers.length === 0) && rawTextAnswer) {
      const parsedRaw = parseRawTextAnswers(rawTextAnswer);
      if (parsedRaw.length > 0) {
        structuredAnswers = parsedRaw;
      }
    }

    if (!file && (!structuredAnswers || structuredAnswers.length === 0) && !rawTextAnswer) {
      return next(new HttpError(400, "Answer sheet file or answers are required"));
    }

    try {
      const user = typedReq.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const studentId = getStudentId(user);
      if (!studentId) {
        return next(new HttpError(403, "Student context required"));
      }

      const examIdParam = typedReq.params.examId;
      const examId = Array.isArray(examIdParam) ? examIdParam[0] : examIdParam;
      if (!examId) {
        return next(new HttpError(400, "Exam id is required"));
      }

      const existingSubmission = await prisma.examSubmission.findFirst({
        where: { examId, studentId }
      });

      if (existingSubmission) {
        return next(new HttpError(409, "Submission already exists for this exam"));
      }

      const exam = await prisma.exam.findFirst({
        where: {
          id: examId,
          schoolId: user.schoolId
        },
        select: {
          id: true,
          meta: true,
          status: true,
          classId: true,
          sectionId: true,
          assignedClassId: true,
          assignedClassLevel: true,
          schoolId: true,
          examPaper: { select: { payload: true } }
        }
      });

      if (!exam) {
        return next(new HttpError(404, "Exam not found"));
      }

      if (!canStudentAccessExam(user, exam)) {
        return next(new HttpError(403, "Exam is not published for your class"));
      }

      const aiPayload = (exam.examPaper?.payload ?? {}) as Record<string, unknown>;
      const rawQuestions = aiPayload.questions;
      if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
        return next(new HttpError(400, "Exam payload missing questions"));
      }

      const parsedQuestions = z.array(questionSchema).safeParse(rawQuestions);
      if (!parsedQuestions.success) {
        return next(new HttpError(400, "Exam questions were invalid"));
      }

      const questions = parsedQuestions.data as ExamQuestion[];
      if (structuredAnswers && structuredAnswers.length > 0) {
        const allowedNumbers = new Set(questions.map((q) => q.number));
        const invalidAnswer = structuredAnswers.find(
          (answer) => !allowedNumbers.has(answer.questionNumber)
        );
        if (invalidAnswer) {
          return next(new HttpError(400, "Structured answers contain invalid question numbers"));
        }
      }

      let extractedText: string | undefined;
      let evaluationResult:
        | {
            evaluation: EvaluationResult;
            aiAvailable: boolean;
          }
        | undefined;
      if (file) {
        extractedText = await extractSubmissionText(file);
        evaluationResult = await resolveEvaluationResult(
          "file_evaluation",
          () => evaluateRawTextAnswers(extractedText ?? "", questions),
          {
            questions,
            rawTextAnswer: extractedText
          }
        );
      } else if (structuredAnswers) {
        evaluationResult = await resolveEvaluationResult(
          "structured_evaluation",
          () => evaluateStructuredAnswers(structuredAnswers, questions),
          {
            questions,
            structuredAnswers
          }
        );
      } else if (rawTextAnswer) {
        evaluationResult = await resolveEvaluationResult(
          "raw_text_evaluation",
          () => evaluateRawTextAnswers(rawTextAnswer, questions),
          {
            questions,
            rawTextAnswer
          }
        );
      }

      const [submission, savedEvaluation] = await createSubmissionEvaluation({
        examId: exam.id,
        studentId,
        schoolId: exam.schoolId,
        ...(file ? { file } : {}),
        ...(structuredAnswers ? { structuredAnswers } : {}),
        ...(rawTextAnswer ? { rawTextAnswer } : {}),
        ...(extractedText ? { extractedText } : {}),
        ...(parsed.data.timeTakenSeconds !== undefined
          ? { timeTakenSeconds: parsed.data.timeTakenSeconds }
          : {}),
        evaluation: evaluationResult?.evaluation ?? buildManualReviewTemplate(questions)!,
        aiAvailable: evaluationResult?.aiAvailable ?? false
      });

      const meta = (exam.meta ?? {}) as Record<string, unknown>;
      const schoolMeta = user.school?.meta ?? user.schoolMeta;
      const subscriptionMeta = user.subscription?.meta ?? user.subscriptionMeta;
      const studentName = user.name ?? user.email ?? "Student";
      const subject = typeof meta.subject === "string" ? meta.subject : "Exam";
      const classLevel =
        typeof meta.classLevel === "number" || typeof meta.classLevel === "string"
          ? meta.classLevel
          : undefined;

      const uploadNotifications = await notificationService.notify({
        event: "ANSWER_UPLOADED",
        actor: user,
        ...(schoolMeta ? { schoolMeta } : {}),
        ...(subscriptionMeta ? { subscriptionMeta } : {}),
        examMeta: meta,
        variables: {
          subject,
          classLevel,
          examId: exam.id,
          submissionId: submission.id,
          studentId,
          actorName: studentName
        },
        targets: [
          { role: "STUDENT", ids: [studentId] },
          { role: "PARENT" }
        ]
      });

      void notificationService.notify({
        event: "TEACHER_APPROVAL_REQUEST",
        actor: user,
        ...(schoolMeta ? { schoolMeta } : {}),
        ...(subscriptionMeta ? { subscriptionMeta } : {}),
        examMeta: meta,
        variables: {
          subject,
          classLevel,
          examId: exam.id,
          submissionId: submission.id,
          studentId,
          actorName: studentName
        },
        targets: [
          {
            role: "TEACHER",
            ids: [typeof meta.teacherId === "string" ? meta.teacherId : ""].filter(
              (id): id is string => Boolean(id)
            )
          }
        ]
      });

      return res.status(201).json({
        submissionId: submission.id,
        evaluationId: savedEvaluation.id,
        status: savedEvaluation.status,
        notifications: [uploadNotifications]
      });
    } catch (error) {
      return next(error);
    }
  }
);

submissionsRouter.post("/submit", requireAuth, requireStudent, upload.single("file"), async (req, res, next) => {
  const parsed = quickSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    return next(new HttpError(400, "Invalid submission request", details));
  }

  try {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }

    const studentId = getStudentId(user);
    if (!studentId) {
      return next(new HttpError(403, "Student context required"));
    }

    const typedReq = req as UploadRequest;
    const file = typedReq.file;
    const typedAnswers = parsed.data.typedAnswers?.trim() ?? parsed.data.rawTextAnswer?.trim() ?? "";
    const structuredAnswers = parsed.data.answers;
    if (!file && !structuredAnswers?.length && typedAnswers.length === 0) {
      return next(new HttpError(400, "Answer sheet file or answers are required"));
    }

    const existingSubmission = await prisma.examSubmission.findFirst({
      where: { examId: parsed.data.examId, studentId }
    });
    if (existingSubmission) {
      return next(new HttpError(409, "Submission already exists for this exam"));
    }

    const exam = await prisma.exam.findFirst({
      where: {
        id: parsed.data.examId,
        schoolId: user.schoolId
      },
      select: {
        id: true,
        meta: true,
        schoolId: true,
        status: true,
        classId: true,
        sectionId: true,
        assignedClassId: true,
        assignedClassLevel: true
      }
    });

    if (!exam) {
      return next(new HttpError(404, "Exam not found"));
    }

    if (!canStudentAccessExam(user, exam)) {
      return next(new HttpError(403, "Exam is not published for your class"));
    }

    let extractedText = "";
    if (file) {
      extractedText =
        file.mimetype === "application/pdf"
          ? await extractTextFromPDF(file.path)
          : await extractTextFromImage(file.path);
    }

    const evaluationSource =
      structuredAnswers && structuredAnswers.length > 0
        ? structuredAnswers
        : typedAnswers || extractedText;

    const questions = parseExamQuestions((await prisma.exam.findUnique({
      where: { id: parsed.data.examId },
      select: { examPaper: { select: { payload: true } } }
    }))?.examPaper?.payload);
    const evaluationResult = await resolveEvaluationResult(
      "submit_evaluation",
      () => evaluateAnswers(parsed.data.examId, evaluationSource),
      {
        questions,
        ...(structuredAnswers ? { structuredAnswers } : {}),
        ...((typedAnswers || extractedText) ? { rawTextAnswer: typedAnswers || extractedText } : {})
      }
    );
    const [submission, savedEvaluation] = await createSubmissionEvaluation({
      examId: parsed.data.examId,
      schoolId: exam.schoolId,
      studentId,
      ...(file ? { file } : {}),
      ...(structuredAnswers ? { structuredAnswers } : {}),
      ...(typedAnswers ? { rawTextAnswer: typedAnswers } : {}),
      ...(extractedText ? { extractedText } : {}),
      evaluation: evaluationResult.evaluation,
      aiAvailable: evaluationResult.aiAvailable
    });

    res.json({
      message: evaluationResult.aiAvailable ? "Submission evaluated" : "Submission received",
      submissionId: submission.id,
      evaluationId: savedEvaluation.id,
      status: savedEvaluation.status,
      ...(evaluationResult.aiAvailable ? { score: evaluationResult.evaluation.totalScore } : {})
    });
  } catch (error) {
    next(error);
  }
});

submissionsRouter.post(
  "/submit-answer",
  requireAuth,
  requireStudent,
  answerUpload.single("answer"),
  async (req, res, next) => {
    const parsed = z
      .object({
        examId: z.string().min(1)
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(400, "examId is required"));
    }

    try {
      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const studentId = getStudentId(user);
      if (!studentId) {
        return next(new HttpError(403, "Student context required"));
      }

      const typedReq = req as UploadRequest;
      const file = typedReq.file;
      console.log(file ?? null);

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const existingSubmission = await prisma.examSubmission.findFirst({
        where: { examId: parsed.data.examId, studentId }
      });
      if (existingSubmission) {
        return next(new HttpError(409, "Submission already exists for this exam"));
      }

      const exam = await prisma.exam.findFirst({
        where: {
          id: parsed.data.examId,
          schoolId: user.schoolId
        },
        select: {
          id: true,
          meta: true,
          schoolId: true,
          status: true,
          classId: true,
          sectionId: true,
          assignedClassId: true,
          assignedClassLevel: true
        }
      });

      if (!exam) {
        return next(new HttpError(404, "Exam not found"));
      }

      if (!canStudentAccessExam(user, exam)) {
        return next(new HttpError(403, "Exam is not published for your class"));
      }

      const extractedText = await extractSubmissionText(file);
      const questions = parseExamQuestions((await prisma.exam.findUnique({
        where: { id: parsed.data.examId },
        select: { examPaper: { select: { payload: true } } }
      }))?.examPaper?.payload);
      const evaluationResult = await resolveEvaluationResult(
        "answer_upload_evaluation",
        () => evaluateAnswers(parsed.data.examId, extractedText),
        {
          questions,
          rawTextAnswer: extractedText
        }
      );
      const fileUrl = buildSubmissionFileUrl(file.path);

      const [submission, savedEvaluation] = await createSubmissionEvaluation({
        examId: parsed.data.examId,
        schoolId: exam.schoolId,
        studentId,
        file,
        filePathOverride: fileUrl,
        extractedText,
        evaluation: evaluationResult.evaluation,
        aiAvailable: evaluationResult.aiAvailable
      });

      res.json({
        success: true,
        message: evaluationResult.aiAvailable ? "Answer sheet uploaded" : "Answer sheet uploaded and queued for review",
        submissionId: submission.id,
        evaluationId: savedEvaluation.id,
        status: savedEvaluation.status,
        ...(evaluationResult.aiAvailable ? { score: evaluationResult.evaluation.totalScore } : {}),
        fileUrl
      });
    } catch (error) {
      next(error);
    }
  }
);

submissionsRouter.get(
  "/evaluations/pending",
  requireAuth,
  requireTeacher,
  async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const evaluations = await prisma.examEvaluation.findMany({
        where: {
          status: "PENDING",
          schoolId: user.schoolId,
          ...(user.role === "TEACHER" && user.teacherId
            ? { exam: { teacherId: user.teacherId } }
            : {})
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          examId: true,
          studentId: true,
          submissionId: true,
          status: true,
          aiScore: true,
          aiResult: true,
          createdAt: true,
          updatedAt: true,
          student: {
            select: {
              fullName: true
            }
          },
          exam: {
            select: {
              meta: true
            }
          }
        }
      });

      return res.status(200).json({
        items: evaluations.map((evaluation) => {
          const meta = (evaluation.exam.meta ?? {}) as Record<string, unknown>;
          return {
            id: evaluation.id,
            examId: evaluation.examId,
            studentId: evaluation.studentId,
            submissionId: evaluation.submissionId,
            status: evaluation.status,
            aiScore: evaluation.aiScore,
            reviewMode:
              evaluation.aiResult && !isAiUnavailableEvaluation(evaluation.aiResult as unknown as EvaluationResult)
                ? "AI_ASSISTED"
                : "MANUAL",
            studentName: evaluation.student.fullName || null,
            examName: typeof meta.subject === "string" ? meta.subject : "Exam",
            createdAt: evaluation.createdAt,
            updatedAt: evaluation.updatedAt
          };
        })
      });
    } catch (error) {
      return next(error);
    }
  }
);

submissionsRouter.put("/submission/approve", requireAuth, requireTeacher, async (req, res, next) => {
  const parsed = approveSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, "Invalid approval request"));
  }

  try {
    const user = req.user;
    if (!user?.teacherId) {
      return next(new HttpError(403, "Teacher context required"));
    }

    const evaluation = await prisma.examEvaluation.findFirst({
      where: {
        submissionId: parsed.data.submissionId,
        exam: {
          schoolId: user.schoolId,
          teacherId: user.teacherId
        }
      }
    });

    if (!evaluation) {
      return next(new HttpError(404, "Submission evaluation not found"));
    }

    const updated = await prisma.examEvaluation.update({
      where: { id: evaluation.id },
      data: {
        status: parsed.data.rejectionReason ? "REJECTED" : "APPROVED",
        reviewedBy: user.teacherId,
        reviewedAt: new Date(),
        ...(parsed.data.teacherScore !== undefined
          ? { teacherScore: parsed.data.teacherScore }
          : {}),
        ...(parsed.data.teacherResult !== undefined
          ? { teacherResult: toPrismaJson(parsed.data.teacherResult) }
          : {}),
        ...(parsed.data.rejectionReason
          ? { rejectionReason: parsed.data.rejectionReason }
          : {})
      }
    });

    res.json({
      submissionId: updated.submissionId,
      status: updated.status,
      teacherScore: updated.teacherScore ?? null
    });
  } catch (error) {
    next(error);
  }
});

submissionsRouter.get(
  "/submissions/:submissionId/evaluation",
  requireAuth,
  async (req, res, next) => {
    const submissionIdParam = req.params.submissionId;
    const submissionId = Array.isArray(submissionIdParam)
      ? submissionIdParam[0]
      : submissionIdParam;
    if (!submissionId) {
      return next(new HttpError(400, "Submission id is required"));
    }

    try {
      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const evaluation = await prisma.examEvaluation.findFirst({
        where: { submissionId },
        select: {
          id: true,
          submissionId: true,
          examId: true,
          studentId: true,
          schoolId: true,
          status: true,
          aiScore: true,
          aiResult: true,
          teacherScore: true,
          teacherResult: true,
          reviewedBy: true,
          reviewedAt: true,
          rejectionReason: true,
          createdAt: true,
          updatedAt: true,
          submission: {
            select: {
              fileName: true,
              extractedText: true,
              rawTextAnswer: true
            }
          },
          exam: {
            select: {
              meta: true,
              schoolId: true,
              examPaper: { select: { payload: true } }
            }
          }
        }
      });

      if (!evaluation) {
        return next(new HttpError(404, "Evaluation not found"));
      }

      const canViewAsTeacher = user.role === "TEACHER" || isAdmin(user.role);
      if (!canViewAsTeacher) {
        const studentId = getStudentId(user);
        if (!studentId || evaluation.studentId !== studentId) {
          return next(new HttpError(403, "Access denied"));
        }

        if (evaluation.status !== "APPROVED") {
          return next(new HttpError(403, "Evaluation not approved"));
        }
      } else {
        const schoolId = evaluation.exam.schoolId;
        if (!schoolId || schoolId !== user.schoolId) {
          return next(new HttpError(403, "Access denied"));
        }
      }

      const questions = parseExamQuestions(evaluation.exam.examPaper?.payload);
      const normalizedAiResult =
        evaluation.aiResult && questions.length > 0
          ? normalizeEvaluation(evaluation.aiResult as Partial<EvaluationResult>, questions)
          : (evaluation.aiResult as EvaluationResult | null);
      const normalizedTeacherResult =
        evaluation.teacherResult && questions.length > 0
          ? normalizeEvaluation(evaluation.teacherResult as Partial<EvaluationResult>, questions)
          : (evaluation.teacherResult as EvaluationResult | null);
      const manualTemplate = !normalizedTeacherResult && !normalizedAiResult
        ? buildManualReviewTemplate(questions)
        : null;
      const result = normalizedTeacherResult ?? normalizedAiResult ?? manualTemplate;
      const manualReviewRequired =
        !normalizedAiResult || isAiUnavailableEvaluation(normalizedAiResult);

      return res.status(200).json({
        id: evaluation.id,
        submissionId: evaluation.submissionId,
        examId: evaluation.examId,
        studentId: evaluation.studentId,
        status: evaluation.status,
        score:
          evaluation.teacherScore ??
          evaluation.aiScore ??
          normalizedTeacherResult?.totalScore ??
          normalizedAiResult?.totalScore ??
          manualTemplate?.totalScore ??
          null,
        result,
        aiScore: evaluation.aiScore,
        aiResult: normalizedAiResult,
        teacherScore: evaluation.teacherScore,
        teacherResult: normalizedTeacherResult,
        answerFileName: evaluation.submission.fileName,
        extractedText: evaluation.submission.extractedText ?? evaluation.submission.rawTextAnswer,
        manualReviewRequired,
        reviewMode: manualReviewRequired ? "MANUAL" : "AI_ASSISTED",
        reviewedBy: evaluation.reviewedBy,
        reviewedAt: evaluation.reviewedAt,
        rejectionReason: evaluation.rejectionReason,
        createdAt: evaluation.createdAt,
        updatedAt: evaluation.updatedAt
      });
    } catch (error) {
      return next(error);
    }
  }
);

submissionsRouter.patch(
  "/evaluations/:evaluationId/review",
  requireAuth,
  requireTeacher,
  async (req, res, next) => {
    const evaluationIdParam = req.params.evaluationId;
    const evaluationId = Array.isArray(evaluationIdParam)
      ? evaluationIdParam[0]
      : evaluationIdParam;
    if (!evaluationId) {
      return next(new HttpError(400, "Evaluation id is required"));
    }

    const parsed = reviewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }));
      return next(new HttpError(400, "Invalid review request", details));
    }

    if (parsed.data.status === "REJECTED" && !parsed.data.rejectionReason) {
      return next(new HttpError(400, "Rejection reason is required"));
    }

    try {
      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const evaluation = await prisma.examEvaluation.findUnique({
        where: { id: evaluationId },
        select: {
          id: true,
          examId: true,
          studentId: true,
          submissionId: true,
          schoolId: true,
          exam: { select: { meta: true, schoolId: true, teacherId: true } }
        }
      });

      if (!evaluation) {
        return next(new HttpError(404, "Evaluation not found"));
      }

      const meta = (evaluation.exam.meta ?? {}) as Record<string, unknown>;
      const schoolId = evaluation.exam.schoolId;
      const teacherId = evaluation.exam.teacherId;

      if (!schoolId || schoolId !== user.schoolId) {
        return next(new HttpError(403, "Access denied"));
      }

      if (user.role === "TEACHER" && teacherId && teacherId !== user.teacherId) {
        return next(new HttpError(403, "Teacher access denied"));
      }

      const updateData: Prisma.ExamEvaluationUpdateInput = {
        status: parsed.data.status,
        reviewedBy: user.teacherId ?? user.id,
        reviewedAt: new Date()
      };

      if (parsed.data.teacherScore !== undefined) {
        updateData.teacherScore = parsed.data.teacherScore;
      }

      if (parsed.data.teacherResult !== undefined) {
        updateData.teacherResult = toPrismaJson(parsed.data.teacherResult);
      }

      if (parsed.data.rejectionReason !== undefined) {
        updateData.rejectionReason = parsed.data.rejectionReason;
      }

      const updated = await prisma.examEvaluation.update({
        where: { id: evaluationId },
        data: updateData,
        select: {
          id: true,
          submissionId: true,
          examId: true,
          studentId: true,
          status: true,
          teacherScore: true,
          teacherResult: true,
          reviewedBy: true,
          reviewedAt: true,
          rejectionReason: true,
          updatedAt: true
        }
      });

      const schoolMeta = user.school?.meta ?? user.schoolMeta;
      const subscriptionMeta = user.subscription?.meta ?? user.subscriptionMeta;
      const subject = typeof meta.subject === "string" ? meta.subject : "Exam";
      const classLevel =
        typeof meta.classLevel === "number" || typeof meta.classLevel === "string"
          ? meta.classLevel
          : undefined;
      const score = updated.teacherScore ?? null;
      const notifications: Array<Awaited<ReturnType<typeof notificationService.notify>>> = [];

      if (updated.status === "APPROVED") {
        notifications.push(
          await notificationService.notify({
            event: "EVALUATION_APPROVED",
            actor: user,
            ...(schoolMeta ? { schoolMeta } : {}),
            ...(subscriptionMeta ? { subscriptionMeta } : {}),
            examMeta: meta,
            variables: {
              subject,
              classLevel,
              examId: updated.examId,
              submissionId: updated.submissionId,
              studentId: updated.studentId,
              score: score ?? "N/A",
              actorName: user.name ?? user.email ?? "Teacher"
            },
            targets: [
              { role: "STUDENT", ids: [updated.studentId] },
              { role: "PARENT" }
            ]
          })
        );
        notifications.push(
          await notificationService.notify({
            event: "REPORT_AVAILABLE",
            actor: user,
            ...(schoolMeta ? { schoolMeta } : {}),
            ...(subscriptionMeta ? { subscriptionMeta } : {}),
            examMeta: meta,
            variables: {
              subject,
              classLevel,
              examId: updated.examId,
              submissionId: updated.submissionId,
              studentId: updated.studentId
            },
            targets: [
              { role: "STUDENT", ids: [updated.studentId] },
              { role: "PARENT" }
            ]
          })
        );
      }

      if (updated.status === "REJECTED") {
        notifications.push(
          await notificationService.notify({
            event: "EVALUATION_REJECTED",
            actor: user,
            ...(schoolMeta ? { schoolMeta } : {}),
            ...(subscriptionMeta ? { subscriptionMeta } : {}),
            examMeta: meta,
            variables: {
              subject,
              classLevel,
              examId: updated.examId,
              submissionId: updated.submissionId,
              studentId: updated.studentId,
              rejectionReason: updated.rejectionReason ?? "Not specified"
            },
            targets: [
              { role: "STUDENT", ids: [updated.studentId] },
              { role: "PARENT" }
            ]
          })
        );
      }

      return res.status(200).json({ ...updated, notifications });
    } catch (error) {
      return next(error);
    }
  }
);
