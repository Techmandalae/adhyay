import fs from "fs/promises";
import OpenAI from "openai";
import { z } from "zod";

import type { EvaluationResult } from "../types/evaluation";
import type { ExamQuestion } from "../types/exam";

const MODEL_NAME = "gpt-4o-2024-11-20";
const OPENAI_TIMEOUT_MS = 30000;
const OPENAI_MAX_RETRIES = 2;
const OPENAI_RETRY_BASE_MS = 500;

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  throw new Error("Missing OPENAI_API_KEY in environment");
}

const openai = new OpenAI({
  apiKey: OPENAI_KEY,
  maxRetries: 0
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
    required: [
      "totalScore",
      "overallScore",
      "maxScore",
      "summary",
      "authenticity",
      "breakdown",
      "perQuestion",
      "topicAnalysis"
    ],
    properties: {
      totalScore: { type: "number" },
      overallScore: { type: "number" },
      maxScore: { type: "number" },
      summary: { type: "string" },
      authenticity: {
        type: "object",
        additionalProperties: false,
        required: ["handwritingLikely", "aiGeneratedLikelihood", "notes"],
        properties: {
          handwritingLikely: { type: "boolean" },
          aiGeneratedLikelihood: { type: "number" },
          notes: { type: "string" }
        }
      },
      perQuestion: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "questionNumber",
            "question",
            "score",
            "maxScore",
            "reason",
            "remarks",
            "detectedAnswer"
          ],
          properties: {
            questionNumber: { type: "integer" },
            question: { type: "string" },
            score: { type: "number" },
            maxScore: { type: "number" },
            reason: { type: "string" },
            remarks: { type: "string" },
            detectedAnswer: { type: "string" }
          }
        }
      },
      breakdown: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "questionNumber",
            "question",
            "score",
            "maxScore",
            "reason",
            "detectedAnswer"
          ],
          properties: {
            questionNumber: { type: "integer" },
            question: { type: "string" },
            score: { type: "number" },
            maxScore: { type: "number" },
            reason: { type: "string" },
            detectedAnswer: { type: "string" }
          }
        }
      },
      topicAnalysis: {
        type: "object",
        additionalProperties: false,
        required: ["strengths", "weaknesses"],
        properties: {
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } }
        }
      }
    }
  };
}

function buildSystemPrompt() {
  return [
    "You are an exam evaluator for handwritten student answer sheets.",
    "Analyze handwriting authenticity, detect AI-generated content, and grade answers question-wise.",
    "If handwriting is unclear, note uncertainty but still provide a best-effort evaluation.",
    "Return JSON only that matches the provided schema. No markdown or extra text."
  ].join(" ");
}

function buildStructuredSystemPrompt() {
  return [
    "You are an exam evaluator for structured student answers.",
    "Grade answers question-wise using the provided responses.",
    "If an answer is missing or unclear, assign zero and note it in remarks.",
    "Return JSON only that matches the provided schema. No markdown or extra text."
  ].join(" ");
}

function buildRawTextSystemPrompt() {
  return [
    "You are a CBSE exam evaluator for typed or OCR-extracted student answers.",
    "Grade answers question-wise using the extracted answer text.",
    "If OCR is noisy or incomplete, make a conservative best-effort judgment and note uncertainty in remarks.",
    "Return JSON only that matches the provided schema. No markdown or extra text."
  ].join(" ");
}

function buildUserPrompt(questions: ExamQuestion[]) {
  const questionLines = questions.map((q) => `Q${q.number}: ${q.prompt}`).join("\n");
  return [
    "Evaluate the student's answers to the following questions.",
    "Each question is worth 1 mark unless the answer is missing/incorrect.",
    "Set maxScore to the number of questions.",
    "Return totalScore and overallScore as the same value.",
    "Provide a breakdown entry for every question with question text, score, reason, and detectedAnswer (use 'unreadable' if unclear).",
    "Provide matching perQuestion remarks for every question.",
    "Provide topic-wise strengths/weaknesses inferred from answers.",
    "Questions:",
    questionLines
  ].join("\n");
}

function buildStructuredUserPrompt(
  questions: ExamQuestion[],
  answers: Array<{ questionNumber: number; answer: string }>
) {
  const questionLines = questions.map((q) => `Q${q.number}: ${q.prompt}`).join("\n");
  const answerLines = answers
    .map((entry) => `Q${entry.questionNumber}: ${entry.answer}`)
    .join("\n");
  return [
    "Evaluate the student's answers to the following questions.",
    "Each question is worth 1 mark unless the answer is missing/incorrect.",
    "Set maxScore to the number of questions.",
    "Return totalScore and overallScore as the same value.",
    "Provide a breakdown entry for every question with question text, score, reason, and detectedAnswer.",
    "Provide matching perQuestion remarks for every question.",
    "Provide topic-wise strengths/weaknesses inferred from answers.",
    "Questions:",
    questionLines,
    "",
    "Student answers:",
    answerLines
  ].join("\n");
}

function buildRawTextUserPrompt(questions: ExamQuestion[], answerText: string) {
  const questionLines = questions.map((q) => `Q${q.number}: ${q.prompt}`).join("\n");
  return [
    "Evaluate the student's answers to the following questions.",
    "The student answers may come from OCR or typed text and can contain noise.",
    "Each question is worth 1 mark unless the answer is missing or incorrect.",
    "Set maxScore to the number of questions.",
    "Return totalScore and overallScore as the same value.",
    "Provide a breakdown entry for every question with question text, score, reason, and detectedAnswer.",
    "Provide matching perQuestion remarks for every question.",
    "Questions:",
    questionLines,
    "",
    "Student answer text:",
    answerText
  ].join("\n");
}

async function fileToDataUrl(filePath: string, mimeType: string) {
  const data = await fs.readFile(filePath);
  const base64 = data.toString("base64");
  return `data:${mimeType};base64,${base64}`;
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
      score,
      maxScore: 1,
      reason,
      remarks: entry?.remarks?.trim() || reason,
      detectedAnswer
    };
  });

  const normalizedBreakdown = normalizedPerQuestion.map((item) => ({
    questionNumber: item.questionNumber,
    question: item.question ?? `Q${item.questionNumber}`,
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
  if (mimeType === "application/pdf") {
    throw new Error("PDF AI evaluation is unavailable.");
  }

  if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
    throw new Error("Unsupported image type for AI evaluation.");
  }

  ensureApiKey();

  const schema = buildResponseSchema();
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(questions);
  const dataUrl = await fileToDataUrl(filePath, mimeType);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await callWithRetry("evaluation_file", (signal) =>
      openai.chat.completions.create(
        {
        model: MODEL_NAME,
        temperature: 0,
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "answer_sheet_evaluation",
            strict: true,
            schema
          }
        },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }
        ],
        },
        { signal }
      )
    );

    logTokenUsage("evaluation_file", completion.usage);

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      if (attempt === 0) {
        continue;
      }
      throw new Error("OpenAI response was empty.");
    }

    const parsed = safeJsonParse(content);

    const validated = evaluationResultSchema.safeParse(parsed);
    if (!validated.success) {
      if (attempt === 0) {
        continue;
      }
      throw new Error("OpenAI response did not match evaluation schema.");
    }

    return normalizeEvaluation(validated.data, questions);
  }

  throw new Error("OpenAI response did not match evaluation schema.");
}

export async function evaluateStructuredAnswers(
  answers: Array<{ questionNumber: number; answer: string }>,
  questions: ExamQuestion[]
): Promise<EvaluationResult> {
  ensureApiKey();

  const schema = buildResponseSchema();
  const systemPrompt = buildStructuredSystemPrompt();
  const userPrompt = buildStructuredUserPrompt(questions, answers);

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

    const validated = evaluationResultSchema.safeParse(parsed);
    if (!validated.success) {
      if (attempt === 0) {
        continue;
      }
      throw new Error("OpenAI response did not match evaluation schema.");
    }

    return normalizeEvaluation(validated.data, questions);
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
  const userPrompt = buildRawTextUserPrompt(questions, answerText);

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
    const validated = evaluationResultSchema.safeParse(parsed);
    if (!validated.success) {
      if (attempt === 0) {
        continue;
      }
      throw new Error("OpenAI response did not match evaluation schema.");
    }

    return normalizeEvaluation(validated.data, questions);
  }

  throw new Error("OpenAI response did not match evaluation schema.");
}
