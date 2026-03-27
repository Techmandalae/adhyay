import { prisma } from "../db/prisma";
import { HttpError } from "../middleware/error";
import {
  evaluateRawTextAnswers,
  evaluateStructuredAnswers
} from "./ai.evaluation.service";
import type { EvaluationResult } from "../types/evaluation";
import type { ExamQuestion } from "../types/exam";

function toExamQuestions(payload: unknown): ExamQuestion[] {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "Exam payload missing");
  }

  const rawQuestions = (payload as Record<string, unknown>).questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new HttpError(400, "Exam questions are not available");
  }

  return rawQuestions
    .filter((question): question is ExamQuestion => {
      if (!question || typeof question !== "object") {
        return false;
      }
      const record = question as Record<string, unknown>;
      return typeof record.number === "number" && typeof record.prompt === "string";
    })
    .map((question) => question);
}

export async function evaluateAnswers(
  examId: string,
  answers: Array<{ questionNumber: number; answer: string }> | string
): Promise<EvaluationResult> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      examPaper: {
        select: { payload: true }
      }
    }
  });

  if (!exam?.examPaper) {
    throw new HttpError(404, "Exam not found");
  }

  const questions = toExamQuestions(exam.examPaper.payload);
  if (typeof answers === "string") {
    return evaluateRawTextAnswers(answers, questions);
  }
  return evaluateStructuredAnswers(answers, questions);
}
