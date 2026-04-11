import OpenAI from "openai";
import { z } from "zod";

import type { EvaluationResult } from "../types/evaluation";
import type { ExamQuestion } from "../types/exam";

const MODEL_NAME = "gpt-4o-2024-11-20";
const OPENAI_TIMEOUT_MS = 30000;
const OPENAI_MAX_RETRIES = 1;
const OPENAI_RETRY_BASE_MS = 500;

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  throw new Error("Missing OPENAI_API_KEY in environment");
}

const openai = new OpenAI({
  apiKey: OPENAI_KEY,
  maxRetries: 0
});

const aiEvaluationResponseSchema = z.object({
  totalScore: z.number().nonnegative(),
  maxScore: z.number().positive(),
  summary: z.string().min(1),
  breakdown: z
    .array(
      z.object({
        questionNumber: z.number().int().positive(),
        question: z.string().min(1),
        studentAnswer: z.string().min(1),
        correctAnswer: z.string().min(1),
        score: z.number().nonnegative(),
        reason: z.string().min(1)
      })
    )
    .min(1)
});

export const evaluationResultSchema = z.object({
  totalScore: z.number().nonnegative(),
  overallScore: z.number().nonnegative(),
  maxScore: z.number().positive(),
  summary: z.string().min(1),
  authenticity: z.object({
    handwritingLikely: z.boolean(),
    aiGeneratedLikelihood: z.number().min(0).max(1),
    notes: z.string().min(1)
  }),
  breakdown: z
    .array(
      z.object({
        questionNumber: z.number().int().positive(),
        question: z.string().min(1),
        studentAnswer: z.string().min(1),
        correctAnswer: z.string().min(1),
        score: z.number().nonnegative(),
        maxScore: z.number().positive(),
        reason: z.string().min(1),
        detectedAnswer: z.string().min(1)
      })
    )
    .min(1),
  perQuestion: z
    .array(
      z.object({
        questionNumber: z.number().int().positive(),
        question: z.string().min(1),
        studentAnswer: z.string().min(1),
        correctAnswer: z.string().min(1),
        score: z.number().nonnegative(),
        maxScore: z.number().positive(),
        reason: z.string().min(1),
        remarks: z.string().min(1),
        detectedAnswer: z.string().min(1)
      })
    )
    .min(1),
  topicAnalysis: z.object({
    strengths: z.array(z.string().min(1)),
    weaknesses: z.array(z.string().min(1))
  })
});

function ensureApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment");
  }
}

function buildResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["totalScore", "maxScore", "summary", "breakdown"],
    properties: {
      totalScore: { type: "number" },
      maxScore: { type: "number" },
      summary: { type: "string" },
      breakdown: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "questionNumber",
            "question",
            "studentAnswer",
            "correctAnswer",
            "score",
            "reason"
          ],
          properties: {
            questionNumber: { type: "integer" },
            question: { type: "string" },
            studentAnswer: { type: "string" },
            correctAnswer: { type: "string" },
            score: { type: "number" },
            reason: { type: "string" }
          }
        }
      }
    }
  };
}

function buildStructuredSystemPrompt() {
  return [
    "You are a strict but fair school teacher evaluating structured student answers.",
    "Grade each answer against the expected correct answer.",
    "If an answer is missing or unclear, assign zero and explain why.",
    "Return JSON only that matches the provided schema. No markdown or extra text."
  ].join(" ");
}

function buildRawTextSystemPrompt() {
  return [
    "You are a strict but fair school teacher evaluating OCR-extracted or typed student answers.",
    "Grade each answer against the expected correct answer.",
    "If OCR is noisy or incomplete, make a conservative best-effort judgment and explain any uncertainty.",
    "Return JSON only that matches the provided schema. No markdown or extra text."
  ].join(" ");
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

function parseRawTextAnswers(answerText: string) {
  const answers = new Map<number, string>();
  answerText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      const match = line.match(/^(\d+)[\.\)]\s*(.+)$/);
      if (!match) {
        return;
      }
      const questionNumber = Number(match[1]);
      const answer = match[2]?.trim();
      if (Number.isFinite(questionNumber) && answer) {
        answers.set(questionNumber, answer);
      }
    });

  return answers;
}

function buildQuestionContextLines(
  questions: ExamQuestion[],
  options?: {
    structuredAnswers?: Array<{ questionNumber: number; answer: string }>;
    rawAnswerText?: string;
  }
) {
  const structuredAnswerMap = new Map(
    (options?.structuredAnswers ?? []).map((entry) => [entry.questionNumber, entry.answer] as const)
  );
  const parsedRawAnswers =
    options?.rawAnswerText && options.rawAnswerText.trim().length > 0
      ? parseRawTextAnswers(options.rawAnswerText)
      : new Map<number, string>();

  return questions
    .map((question) => {
      const studentAnswer =
        structuredAnswerMap.get(question.number)?.trim() ||
        parsedRawAnswers.get(question.number)?.trim() ||
        "Not clearly extracted";
      return [
        `Question Number: ${question.number}`,
        `Question: ${question.prompt}`,
        `Student Answer: ${studentAnswer}`,
        `Correct Answer: ${getCorrectAnswer(question)}`,
        "Max Score: 1"
      ].join("\n");
    })
    .join("\n\n");
}

function buildUserPrompt(
  questions: ExamQuestion[],
  options?: {
    structuredAnswers?: Array<{ questionNumber: number; answer: string }>;
    rawAnswerText?: string;
  }
) {
  const questionLines = buildQuestionContextLines(questions, options);
  return [
    "Evaluate the student answers like a real teacher.",
    "Score each question out of 1 mark.",
    "If the answer is missing or cannot be extracted, give 0 and explain why.",
    "Return totalScore as the sum of question scores.",
    "Set maxScore to the total number of questions.",
    "Use the provided question numbers in the breakdown.",
    "Question contexts:",
    questionLines,
    ...(options?.rawAnswerText
      ? ["", "Full extracted answer text:", options.rawAnswerText]
      : [])
  ].join("\n");
}

function safeJsonParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch (_error) {
    const firstBrace = payload.indexOf("{");
    const lastBrace = payload.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = payload.slice(firstBrace, lastBrace + 1);
      return JSON.parse(sliced);
    }
    throw new Error("OpenAI response was not valid JSON.");
  }
}

function logTokenUsage(label: string, usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) {
  if (!usage) {
    return;
  }
  console.info(
    `[openai] ${label} usage: prompt=${usage.prompt_tokens ?? 0} completion=${usage.completion_tokens ?? 0} total=${usage.total_tokens ?? 0}`
  );
}

function isRetryableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  if ((error as { name?: string }).name === "AbortError") {
    return true;
  }
  const status = (error as { status?: number }).status;
  if (status && [408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }
  const code = (error as { code?: string }).code;
  return code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ENOTFOUND";
}

async function callWithRetry<T>(
  label: string,
  task: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    try {
      const result = await task(controller.signal);
      return result;
    } catch (error) {
      if (attempt >= OPENAI_MAX_RETRIES || !isRetryableError(error)) {
        throw error;
      }
      const delay = OPENAI_RETRY_BASE_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeEvaluation(
  result: Partial<EvaluationResult>,
  questions: ExamQuestion[]
): EvaluationResult {
  const perQuestionMap = new Map<number, NonNullable<EvaluationResult["perQuestion"]>[number]>();
  for (const entry of result.perQuestion ?? []) {
    perQuestionMap.set(entry.questionNumber, entry);
  }
  const breakdownMap = new Map<number, NonNullable<EvaluationResult["breakdown"]>[number]>();
  for (const entry of result.breakdown ?? []) {
    breakdownMap.set(entry.questionNumber, entry);
  }

  const normalizedPerQuestion = questions.map((question) => {
    const entry = perQuestionMap.get(question.number);
    const breakdownEntry = breakdownMap.get(question.number);
    const rawScore = breakdownEntry?.score ?? entry?.score ?? 0;
    const score = Math.max(0, Math.min(1, rawScore));
    const correctAnswer =
      breakdownEntry?.correctAnswer?.trim() ||
      entry?.correctAnswer?.trim() ||
      getCorrectAnswer(question);
    const studentAnswer =
      breakdownEntry?.studentAnswer?.trim() ||
      entry?.studentAnswer?.trim() ||
      entry?.detectedAnswer?.trim() ||
      "Not clearly extracted";
    const reason =
      breakdownEntry?.reason?.trim() ||
      entry?.reason?.trim() ||
      entry?.remarks?.trim() ||
      "No reason provided.";
    const detectedAnswer =
      breakdownEntry?.detectedAnswer?.trim() ||
      entry?.detectedAnswer?.trim() ||
      "unavailable";
    return {
      questionNumber: question.number,
      question: breakdownEntry?.question?.trim() || entry?.question?.trim() || question.prompt,
      studentAnswer,
      correctAnswer,
      score,
      maxScore: 1,
      reason,
      remarks: entry?.remarks?.trim() || reason,
      detectedAnswer: studentAnswer
    };
  });

  const normalizedBreakdown = normalizedPerQuestion.map((item) => ({
    questionNumber: item.questionNumber,
    question: item.question ?? `Q${item.questionNumber}`,
    studentAnswer: item.studentAnswer ?? "Not clearly extracted",
    correctAnswer: item.correctAnswer ?? "Not available",
    score: item.score,
    maxScore: item.maxScore,
    reason: item.reason ?? item.remarks,
    detectedAnswer: item.detectedAnswer
  }));

  const totalScore = normalizedPerQuestion.reduce((sum, item) => sum + item.score, 0);
  const maxScore = questions.length;

  return {
    totalScore,
    overallScore: totalScore,
    maxScore,
    summary: result.summary?.trim() || "No summary provided.",
    authenticity: {
      handwritingLikely: result.authenticity?.handwritingLikely ?? false,
      aiGeneratedLikelihood: Math.max(
        0,
        Math.min(1, result.authenticity?.aiGeneratedLikelihood ?? 0)
      ),
      notes: result.authenticity?.notes?.trim() || "No authenticity notes provided."
    },
    breakdown: normalizedBreakdown,
    perQuestion: normalizedPerQuestion,
    topicAnalysis: {
      strengths: result.topicAnalysis?.strengths ?? [],
      weaknesses: result.topicAnalysis?.weaknesses ?? []
    }
  };
}

export async function evaluateAnswerSheet(
  filePath: string,
  mimeType: string,
  questions: ExamQuestion[]
): Promise<EvaluationResult> {
  void filePath;
  void mimeType;
  throw new Error("Use OCR extraction before AI evaluation.");
}

export async function evaluateStructuredAnswers(
  answers: Array<{ questionNumber: number; answer: string }>,
  questions: ExamQuestion[]
): Promise<EvaluationResult> {
  ensureApiKey();

  const schema = buildResponseSchema();
  const systemPrompt = buildStructuredSystemPrompt();
  const userPrompt = buildUserPrompt(questions, { structuredAnswers: answers });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await callWithRetry("evaluation_structured", (signal) =>
      openai.chat.completions.create(
        {
        model: MODEL_NAME,
        temperature: 0,
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "structured_answer_evaluation",
            strict: true,
            schema
          }
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        },
        { signal }
      )
    );

    logTokenUsage("evaluation_structured", completion.usage);

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      if (attempt === 0) {
        continue;
      }
      throw new Error("OpenAI response was empty.");
    }

    const parsed = safeJsonParse(content);

    const validated = aiEvaluationResponseSchema.safeParse(parsed);
    if (!validated.success) {
      if (attempt === 0) {
        continue;
      }
      throw new Error("OpenAI response did not match evaluation schema.");
    }

    return normalizeEvaluation(
      {
        ...validated.data,
        breakdown: validated.data.breakdown.map((item) => ({
          ...item,
          maxScore: 1,
          detectedAnswer: item.studentAnswer
        }))
      },
      questions
    );
  }

  throw new Error("OpenAI response did not match evaluation schema.");
}

export async function evaluateRawTextAnswers(
  answerText: string,
  questions: ExamQuestion[]
): Promise<EvaluationResult> {
  ensureApiKey();

  const schema = buildResponseSchema();
  const systemPrompt = buildRawTextSystemPrompt();
  const userPrompt = buildUserPrompt(questions, { rawAnswerText: answerText });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await callWithRetry("evaluation_raw_text", (signal) =>
      openai.chat.completions.create(
        {
          model: MODEL_NAME,
          temperature: 0,
          stream: false,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "raw_text_answer_evaluation",
              strict: true,
              schema
            }
          },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        },
        { signal }
      )
    );

    logTokenUsage("evaluation_raw_text", completion.usage);

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      if (attempt === 0) {
        continue;
      }
      throw new Error("OpenAI response was empty.");
    }

    const parsed = safeJsonParse(content);
    const validated = aiEvaluationResponseSchema.safeParse(parsed);
    if (!validated.success) {
      if (attempt === 0) {
        continue;
      }
      throw new Error("OpenAI response did not match evaluation schema.");
    }

    return normalizeEvaluation(
      {
        ...validated.data,
        breakdown: validated.data.breakdown.map((item) => ({
          ...item,
          maxScore: 1,
          detectedAnswer: item.studentAnswer
        }))
      },
      questions
    );
  }

  throw new Error("OpenAI response did not match evaluation schema.");
}
