import { randomUUID } from "crypto";
import OpenAI from "openai";
import { z } from "zod";

import {
  DEFAULT_CBSE_TEMPLATE_SECTIONS,
  type ExamPayload,
  type ExamQuestion,
  type ExamSection,
  type ExamTemplateSection,
  type GenerateExamInput,
  type JsonValue,
  type NormalizedQuestionType
} from "../types/exam";

const MODEL_NAME = "gpt-4.1";
const OPENAI_TIMEOUT_MS = 20000;
const OPENAI_MAX_RETRIES = 1;
const OPENAI_RETRY_BASE_MS = 500;
const DEFAULT_CHOICES_PER_QUESTION = 4;

const DEFAULT_CBSE_STRUCTURE_TEXT = `
Section A - MCQ (1 mark each) - 5 questions
Section B - Very short answer (2 marks each) - 5 questions
Section C - Short answer (3 marks each) - 5 questions
Section D - Long answer (5 marks each) - 3 questions
Section E - Application / HOTS (5 marks each) - 1 question
`.trim();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_KEY
  ? new OpenAI({
      apiKey: OPENAI_KEY,
      maxRetries: 0
    })
  : null;

type SectionPlan = ExamSection & {
  questionsToGenerate: number;
  questionsToAttempt: number;
  marksPerQuestion: number;
};

type NcertPatternProfile = {
  sections: ExamTemplateSection[];
  patternGuidance: string;
  includesFillInTheBlanks: boolean;
};

type AiQuestion = {
  questionNumber?: number;
  question: string;
  options?: string[];
  marks?: number;
  correctAnswer?: string;
  chapter?: string;
};

const modelResponseSchema = z
  .object({
    sections: z
      .array(
        z
          .object({
            sectionName: z.string().min(1),
            questions: z
              .array(
                z
                  .object({
                    questionNumber: z.number().int().positive().optional(),
                    question: z.string().min(1),
                    options: z.array(z.string().min(1)).optional(),
                    marks: z.number().positive().optional(),
                    correctAnswer: z.string().min(1).optional(),
                    chapter: z.string().min(1).optional()
                  })
                  .strict()
              )
              .min(1)
          })
          .strict()
      )
      .min(1)
  })
  .strict();

const BANNED_QUESTION_PATTERNS = [
  "इस पाठ में",
  "इस अध्याय में",
  "लेखक ने क्या बताया",
  "पाठ में क्या कहा गया"
];

const LOW_QUALITY_QUESTION_PATTERNS = [
  "selected chapter",
  "given chapter",
  "key concept",
  "important concept",
  "write short notes on the chapter",
  "explain the concept",
  "define the concept"
];

function buildSectionPlan(templateSections: ExamTemplateSection[]) {
  const sections: SectionPlan[] = [];
  let questionNumber = 1;

  templateSections.forEach((section, index) => {
    const questionNumbers = Array.from(
      { length: section.questionsToGenerate },
      (_value, offset) => questionNumber + offset
    );

    sections.push({
      sectionNumber: index + 1,
      title: section.title,
      type: section.type,
      questionsToGenerate: section.questionsToGenerate,
      questionsToAttempt: section.questionsToAttempt,
      marksPerQuestion: section.marksPerQuestion,
      questionNumbers
    });

    questionNumber += section.questionsToGenerate;
  });

  return { sections, questionCount: questionNumber - 1 };
}

function ensureApiKey(client: OpenAI | null): asserts client is OpenAI {
  if (!client) {
    throw new Error("Missing OPENAI_API_KEY in environment");
  }
}

function toDisplayLanguage(language: GenerateExamInput["language"]) {
  switch (language) {
    case "hindi":
      return "Hindi";
    case "punjabi":
      return "Punjabi";
    default:
      return "English";
  }
}

function getClassLevelGuidance(classLevel: number) {
  if (classLevel <= 5) {
    return "Use simple language and basic comprehension questions.";
  }
  if (classLevel <= 8) {
    return "Use conceptual questions that check understanding, not rote recall.";
  }
  if (classLevel <= 10) {
    return "Use analytical and reasoning-oriented questions suitable for board-style assessment.";
  }
  return "Use advanced reasoning, interpretation, and application-oriented questions.";
}

function getExamPattern(subject: string, className: string) {
  const sub = subject.toLowerCase();

  if (sub.includes("math")) {
    return `
Section A: MCQs (1 mark each)
Section B: Very Short Answer (2 marks)
Section C: Short Answer (3 marks)
Section D: Long Answer (5 marks)

Include:
- Numerical problems
- Word problems
- Application-based questions
- Case-based questions
- NCERT-style problem solving steps
`.trim();
  }

  if (sub.includes("science")) {
    return `
Section A: MCQs
Section B: Assertion-Reason
Section C: Short Answer
Section D: Long Answer

Include:
- Diagrams where relevant
- Experimental and observation-based questions
- Case-based questions
- NCERT in-text and exercise-style reasoning
`.trim();
  }

  if (sub.includes("english")) {
    return `
Section A: Reading comprehension
Section B: Grammar
Section C: Writing skills
Section D: Literature

Include:
- Unseen passage
- Grammar transformation and error correction
- Writing tasks such as letters or analytical writing
- NCERT text-based interpretation questions
`.trim();
  }

  if (sub.includes("hindi")) {
    return `
खंड A: अपठित गद्यांश
खंड B: व्याकरण
खंड C: लेखन कौशल
खंड D: साहित्य

शामिल करें:
- व्याकरण आधारित प्रश्न
- पाठ्यपुस्तक आधारित व्याख्यात्मक प्रश्न
- संक्षिप्त और दीर्घ उत्तरीय प्रश्न
`.trim();
  }

  if (sub.includes("sanskrit")) {
    return `
भाग A: अपठितांश
भाग B: व्याकरण
भाग C: अनुवाद
भाग D: श्लोक आधारित प्रश्न

शामिल करें:
- सरल अनुवाद
- व्याकरणिक प्रयोग
- श्लोक/गद्यांश आधारित बोध प्रश्न
`.trim();
  }

  return `
Section A: MCQs
Section B: Short Answer
Section C: Long Answer

Include:
- NCERT-aligned exercise style questions
- Conceptual understanding
- Application and reasoning
`.trim();
}

function getClassLevelPattern(className: string) {
  const num = Number.parseInt(className.replace(/\D/g, ""), 10);

  if (Number.isNaN(num)) {
    return `
Use a balanced paper:
- Clear progression from easy to moderate questions
- Variety in question types
- NCERT-aligned language
`.trim();
  }

  if (num <= 5) {
    return `
Use simple questions:
- Fill in the blanks
- Match the following
- True/False
- Short answers
`.trim();
  }

  if (num <= 8) {
    return `
Use mixed questions:
- MCQs
- Short answers
- Basic reasoning
- Direct NCERT-style applications
`.trim();
  }

  return `
Use advanced CBSE pattern:
- Case-based questions
- Assertion reasoning where relevant
- Application questions
- Multi-step analytical responses
`.trim();
}

function inferSubjectFamily(subject: string) {
  const normalized = subject.toLowerCase();

  if (
    normalized.includes("math") ||
    normalized.includes("mathematics") ||
    normalized.includes("accountancy")
  ) {
    return "math";
  }

  if (
    normalized.includes("science") ||
    normalized.includes("physics") ||
    normalized.includes("chemistry") ||
    normalized.includes("biology") ||
    normalized.includes("evs") ||
    normalized.includes("environment")
  ) {
    return "science";
  }

  if (
    normalized.includes("english") ||
    normalized.includes("hindi") ||
    normalized.includes("sanskrit") ||
    normalized.includes("urdu") ||
    normalized.includes("punjabi")
  ) {
    return "language";
  }

  if (
    normalized.includes("social") ||
    normalized.includes("history") ||
    normalized.includes("geography") ||
    normalized.includes("civics") ||
    normalized.includes("political") ||
    normalized.includes("economics")
  ) {
    return "social";
  }

  return "general";
}

function createTemplateSection(
  title: string,
  type: NormalizedQuestionType,
  count: number,
  marksPerQuestion: number
): ExamTemplateSection {
  return {
    title,
    type,
    questionsToGenerate: count,
    questionsToAttempt: count,
    marksPerQuestion
  };
}

export function inferNcertTemplateSections(input: {
  classLevel: number;
  subject: string;
}): NcertPatternProfile {
  const family = inferSubjectFamily(input.subject);
  const sections: ExamTemplateSection[] = [];
  let includesFillInTheBlanks = false;

  const addSection = (
    title: string,
    type: NormalizedQuestionType,
    count: number,
    marksPerQuestion: number
  ) => {
    if (count <= 0) {
      return;
    }
    if (type === "fill_in_the_blanks") {
      includesFillInTheBlanks = true;
    }
    sections.push(createTemplateSection(title, type, count, marksPerQuestion));
  };

  if (input.classLevel <= 5) {
    if (family === "language") {
      addSection("Section A - Fill in the Blanks", "fill_in_the_blanks", 5, 1);
      addSection("Section B - MCQ", "mcq", 3, 1);
      addSection("Section C - Very Short Answer", "very_short", 4, 2);
      addSection("Section D - Short Answer", "short", 3, 3);
    } else {
      addSection("Section A - Fill in the Blanks", "fill_in_the_blanks", 4, 1);
      addSection("Section B - MCQ", "mcq", 4, 1);
      addSection("Section C - Very Short Answer", "very_short", 4, 2);
      addSection("Section D - Short Answer", "short", 3, 3);
    }
  } else if (input.classLevel <= 8) {
    if (family === "language") {
      addSection("Section A - Fill in the Blanks", "fill_in_the_blanks", 4, 1);
      addSection("Section B - MCQ", "mcq", 4, 1);
      addSection("Section C - Very Short Answer", "very_short", 4, 2);
      addSection("Section D - Short Answer", "short", 4, 3);
      addSection("Section E - Long Answer", "long", 2, 5);
    } else if (family === "math" || family === "science" || family === "social") {
      addSection("Section A - MCQ", "mcq", 5, 1);
      addSection("Section B - Fill in the Blanks", "fill_in_the_blanks", 3, 1);
      addSection("Section C - Very Short Answer", "very_short", 4, 2);
      addSection("Section D - Short Answer", "short", 4, 3);
      addSection("Section E - Long Answer", "long", 2, 5);
    } else {
      addSection("Section A - MCQ", "mcq", 4, 1);
      addSection("Section B - Fill in the Blanks", "fill_in_the_blanks", 2, 1);
      addSection("Section C - Very Short Answer", "very_short", 4, 2);
      addSection("Section D - Short Answer", "short", 4, 3);
      addSection("Section E - Long Answer", "long", 2, 5);
    }
  } else if (family === "language") {
    addSection("Section A - Reading / Objective", "mcq", 4, 1);
    addSection("Section B - Very Short Answer", "very_short", 4, 2);
    addSection("Section C - Short Answer", "short", 4, 3);
    addSection("Section D - Long Answer", "long", 3, 5);
  } else if (family === "math" || family === "science") {
    addSection("Section A - MCQ", "mcq", 6, 1);
    addSection("Section B - Very Short Answer", "very_short", 5, 2);
    addSection("Section C - Short Answer", "short", 5, 3);
    addSection("Section D - Long Answer", "long", 3, 5);
    addSection("Section E - Application / Case Based", "long", 2, 5);
  } else {
    addSection("Section A - MCQ", "mcq", 5, 1);
    addSection("Section B - Very Short Answer", "very_short", 5, 2);
    addSection("Section C - Short Answer", "short", 4, 3);
    addSection("Section D - Long Answer", "long", 3, 5);
  }

  return {
    sections,
    includesFillInTheBlanks,
    patternGuidance: [
      "Infer the paper from NCERT and CBSE exercise signals for the selected class and subject.",
      input.classLevel <= 8
        ? "Lower and middle-grade NCERT exercises commonly mix objective questions, fill-in-the-blanks, very short answers, and short answers."
        : "Board-stage and senior-secondary CBSE papers emphasize MCQ, very short, short, long, and case-based questions instead of fill-in-the-blanks.",
      family === "math" || family === "science"
        ? "Prioritize numerical, application, reasoning, observation, and case-based questions where relevant."
        : family === "language"
          ? "Prioritize grammar, comprehension, textual interpretation, writing, and literature-style prompts where relevant."
          : "Prioritize concept recall, explanation, interpretation, and applied reasoning.",
      includesFillInTheBlanks
        ? "Include fill-in-the-blanks only in the dedicated section plan and make every blank academically meaningful."
        : "Do not generate fill-in-the-blanks because this inferred NCERT profile does not include them."
    ].join("\n")
  };
}

function formatTemplateStructure(templateStructure: unknown) {
  if (!templateStructure) {
    return DEFAULT_CBSE_STRUCTURE_TEXT;
  }

  if (typeof templateStructure === "string" && templateStructure.trim()) {
    return templateStructure.trim();
  }

  if (Array.isArray(templateStructure)) {
    const sectionLines = templateStructure
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }

        const section = entry as Record<string, JsonValue>;
        const title =
          typeof section.title === "string" && section.title.trim()
            ? section.title.trim()
            : "Section";
        const type =
          typeof section.type === "string" && section.type.trim()
            ? section.type.trim()
            : "QUESTION";
        const marks =
          typeof section.marksPerQuestion === "number"
            ? `${section.marksPerQuestion} marks each`
            : "marks as configured";
        const questionCount =
          typeof section.questionsToGenerate === "number"
            ? `${section.questionsToGenerate} questions`
            : "configured question count";

        return `${title} - ${type} - ${marks} - ${questionCount}`;
      })
      .filter((line): line is string => Boolean(line));

    if (sectionLines.length > 0) {
      return sectionLines.join("\n");
    }
  }

  return DEFAULT_CBSE_STRUCTURE_TEXT;
}

export function buildExamPrompt(input: {
  classLevel: number;
  subject: string;
  difficulty: GenerateExamInput["difficulty"];
  language: GenerateExamInput["language"];
  chapterContext?: string;
  patternGuidance?: string;
  templateStructure?: unknown;
  chapters: string[];
  sectionPlan: SectionPlan[];
}) {
  const languageLabel = toDisplayLanguage(input.language);
  const classLevelGuidance = getClassLevelGuidance(input.classLevel);
  const className = `Class ${input.classLevel}`;
  const examStructure = formatTemplateStructure(input.templateStructure);
  const chapterTitles = input.chapters.join("\n");
  const chapterContext =
    input.chapterContext && input.chapterContext.trim().length > 0
      ? input.chapterContext.trim()
      : chapterTitles;
  const examPattern = getExamPattern(input.subject, className);
  const classPattern = getClassLevelPattern(className);
  const patternGuidance =
    input.patternGuidance && input.patternGuidance.trim().length > 0
      ? input.patternGuidance.trim()
      : "No additional NCERT exercise guidance provided.";

  return `
You are an expert CBSE paper setter.

Generate a HIGH-QUALITY exam paper strictly following NCERT patterns.

Class: ${className}
Subject: ${input.subject}
Difficulty: ${input.difficulty}
Language: ${languageLabel}

Chapters:
${chapterTitles}

Subject-Aware Exam Pattern
${examPattern}

Class-Level Pattern
${classPattern}

NCERT Exercise Pattern Signals
${patternGuidance}

Exam Structure
${examStructure}

Additional Chapter Context
${chapterContext}

Class Level Guidance
${classLevelGuidance}

Rules

1. Ensure questions strictly belong to the provided chapter titles.
2. Follow CBSE exam style.
3. Match difficulty to the class level.
4. Use the exact section order and exact question count from the exam structure.
5. Use the additional chapter context when it is available, but do not invent facts outside the listed chapters.
6. Avoid weak questions like:
   - "इस पाठ में क्या बताया गया है"
   - "लेखक ने क्या कहा है"
   - "इस अध्याय में क्या बताया गया है"
7. Questions must test understanding, not vague summary recall.
8. For MCQ sections, provide exactly ${DEFAULT_CHOICES_PER_QUESTION} options and set correctAnswer to one of those option texts.
9. For fill_in_the_blanks sections, write real blanks using "____", set options to [], and provide the exact fill word or phrase in correctAnswer.
10. For non-MCQ and non-fill_in_the_blanks sections, set options to [] and give a concise model answer in correctAnswer.
11. Do not create fill in the blanks unless the section plan explicitly includes a fill_in_the_blanks section.
12. Set chapter to one of the provided chapter titles exactly.
13. Keep marks aligned with the requested section marks.
14. Do NOT repeat questions.
15. Do NOT mention chapter names inside the question body unless academically necessary.
16. Do NOT generate generic placeholders, template fillers, or vague prompts about "concepts".
17. Questions must look like real CBSE or strong school-exam questions based on NCERT exercise patterns.
18. Include variety across MCQ, short answer, long answer, case-based, assertion-reason, grammar, or comprehension as relevant to the subject and section plan.
19. Keep formatting clean and readable.
20. Return only valid UTF-8 plain text characters.
21. Ensure MCQ options A, B, C, and D are plain text without bullets or special symbols.
22. Avoid malformed characters, encoding artifacts, decorative characters, or broken punctuation.
23. Ensure logical progression from easy to moderate to challenging within the paper.
24. Return valid JSON only. Do not add markdown fences or commentary.

Return valid JSON only:

{
  "sections": [
    {
      "sectionName": "${input.sectionPlan[0]?.title ?? "Section A"}",
      "questions": [
        {
          "questionNumber": 1,
          "question": "",
          "options": [],
          "marks": 1,
          "correctAnswer": "",
          "chapter": "${input.chapters[0] ?? "Reference"}"
        }
      ]
    }
  ]
}
`.trim();
}

function normalizeOptions(
  options: string[] | undefined,
  sectionType: SectionPlan["type"],
  choicesPerQuestion: number
) {
  if (sectionType !== "mcq") {
    return [];
  }

  const cleaned = (options ?? []).map((option) => option.trim()).filter((option) => option.length > 0);
  if (cleaned.length === choicesPerQuestion) {
    return cleaned;
  }
  if (cleaned.length > choicesPerQuestion) {
    return cleaned.slice(0, choicesPerQuestion);
  }

  const padded = [...cleaned];
  while (padded.length < choicesPerQuestion) {
    padded.push(`Option ${padded.length + 1}`);
  }

  return padded;
}

function resolveAnswerIndex(answer: string | undefined, choices: string[]) {
  if (!answer || choices.length === 0) {
    return 0;
  }

  const normalized = answer.trim().toLowerCase();
  const letterMatch = normalized.match(/^\(?([a-d])\)?$/i);
  if (letterMatch) {
    return Math.max(0, letterMatch[1].toUpperCase().charCodeAt(0) - 65);
  }

  const directMatchIndex = choices.findIndex(
    (choice) => choice.trim().toLowerCase() === normalized
  );

  return directMatchIndex >= 0 ? directMatchIndex : 0;
}

function normalizeChapter(
  chapter: string | undefined,
  allowedChapters: string[],
  fallbackChapter: string
) {
  if (!chapter || allowedChapters.length === 0) {
    return fallbackChapter;
  }

  const trimmed = chapter.trim();
  const stripped = trimmed.replace(/^chapter\s+\d+\s*:\s*/i, "").trim();

  const exactMatch = allowedChapters.find(
    (allowedChapter) => allowedChapter.toLowerCase() === trimmed.toLowerCase()
  );
  if (exactMatch) {
    return exactMatch;
  }

  const strippedMatch = allowedChapters.find(
    (allowedChapter) => allowedChapter.toLowerCase() === stripped.toLowerCase()
  );
  return strippedMatch ?? fallbackChapter;
}

function safeJsonParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch (_error) {
    const firstBrace = payload.indexOf("{");
    const lastBrace = payload.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(payload.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("OpenAI response was not valid JSON.");
  }
}

function validateQuestions<T extends { question?: string; prompt?: string }>(questions: T[]) {
  return questions.filter((question) => {
    const text =
      typeof question.question === "string"
        ? question.question
        : typeof question.prompt === "string"
          ? question.prompt
          : "";

    return !BANNED_QUESTION_PATTERNS.some((pattern) => text.includes(pattern));
  });
}

function hasLowQualityQuestionText(questions: Array<{ question?: string; prompt?: string }>) {
  return questions.some((question) => {
    const text =
      typeof question.question === "string"
        ? question.question
        : typeof question.prompt === "string"
          ? question.prompt
          : "";

    const normalized = text.trim().toLowerCase();
    if (!normalized) {
      return true;
    }

    return LOW_QUALITY_QUESTION_PATTERNS.some((pattern) => normalized.includes(pattern));
  });
}

function extractResponseText(response: unknown) {
  const record = response as {
    output_text?: string;
    output?: Array<{
      content?: Array<
        | { type?: string; text?: string }
        | { type?: string; text?: { value?: string } }
      >;
    }>;
  };

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }

  const parts: string[] = [];
  for (const item of record.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) {
        parts.push(content.text);
        continue;
      }

      if (
        content.text &&
        typeof content.text === "object" &&
        typeof content.text.value === "string" &&
        content.text.value.trim()
      ) {
        parts.push(content.text.value);
      }
    }
  }

  return parts.join("\n").trim();
}

function logTokenUsage(
  label: string,
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  }
) {
  if (!usage) {
    return;
  }

  const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

  console.info(
    `[openai] ${label} usage: prompt=${promptTokens} completion=${completionTokens} total=${totalTokens}`
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
      return await task(controller.signal);
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

function sanitizeAnswerKey(questions: ExamQuestion[], includeAnswerKey: boolean) {
  if (includeAnswerKey) {
    return questions;
  }

  return questions.map((question) => {
    const { answerIndex, explanation, ...rest } = question;
    return rest;
  });
}

function toUsage(response: unknown): OpenAiUsage | undefined {
  const usage = (response as {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  }).usage;

  if (!usage) {
    return undefined;
  }

  const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

  return { promptTokens, completionTokens, totalTokens };
}

export type OpenAiUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

function createFallbackQuestion(
  section: SectionPlan,
  number: number,
  chapter: string,
  subject: string,
  difficulty: GenerateExamInput["difficulty"],
  includeAnswerKey: boolean
): ExamQuestion {
  if (section.type === "mcq") {
    const choices = [
      `${chapter} concept`,
      `${chapter} example`,
      `${subject} application`,
      `${difficulty} reasoning`
    ];

    return {
      id: `q_${number}`,
      number,
      sectionNumber: section.sectionNumber,
      chapter,
      type: "mcq",
      prompt: `Which statement best explains a key idea from ${chapter} in ${subject}?`,
      choices,
      ...(includeAnswerKey
        ? {
            answerIndex: 0,
            explanation: choices[0]
          }
        : {})
    };
  }

  const promptByType: Record<string, string> = {
    very_short: `Define one important concept from ${chapter} and give one relevant example.`,
    short: `Explain the main ideas from ${chapter} in ${subject} with a clear example.`,
    long: `Write a detailed answer on ${chapter} in ${subject}, including explanation, reasoning, and examples.`,
    fill_in_the_blanks: `Complete the statement using the correct term from ${chapter}.`
  };

  return {
    id: `q_${number}`,
    number,
    sectionNumber: section.sectionNumber,
    chapter,
    type: (section.type ?? "long") as ExamQuestion["type"],
    prompt: promptByType[section.type ?? "long"] ?? promptByType.long,
    choices: [],
    ...(includeAnswerKey
      ? {
          explanation: `Model answer should cover the main concept, supporting explanation, and an example from ${chapter}.`
        }
      : {})
  };
}

export function buildFallbackExam(
  payload: GenerateExamInput,
  reason?: string
): { exam: ExamPayload; answerKey?: ExamPayload } {
  const templateSections =
    payload.templateSections && payload.templateSections.length > 0
      ? payload.templateSections
      : inferNcertTemplateSections({
          classLevel: payload.classLevel,
          subject: payload.subject
        }).sections;

  const { sections: sectionPlan, questionCount } = buildSectionPlan(templateSections);
  const chapters =
    payload.mode === "REFERENCE_ONLY"
      ? ["Reference"]
      : payload.ncertChapters.length > 0
        ? payload.ncertChapters
        : ["General Revision"];

  const questions: ExamQuestion[] = [];

  sectionPlan.forEach((section) => {
    section.questionNumbers.forEach((number, offset) => {
      const chapter = chapters[offset % chapters.length] ?? chapters[0] ?? "General Revision";
      questions.push(
        createFallbackQuestion(
          section,
          number,
          chapter,
          payload.subject,
          payload.difficulty,
          payload.includeAnswerKey
        )
      );
    });
  });

  const metadata = {
    topic: payload.topic ?? payload.subject,
    subject: payload.subject,
    classLevel: payload.classLevel,
    language: payload.language,
    difficulty: payload.difficulty,
    questionCount,
    choicesPerQuestion: DEFAULT_CHOICES_PER_QUESTION,
    generatedAt: new Date().toISOString(),
    ncertChapters: payload.mode === "REFERENCE_ONLY" ? [] : payload.ncertChapters,
    mode: payload.mode,
    ...(payload.templateId ? { templateId: payload.templateId } : {}),
    ...(payload.sectionId ? { sectionId: payload.sectionId } : {}),
    ...(reason ? { fallbackReason: reason } : {})
  };

  const examId = randomUUID();
  const sanitizedQuestions = sanitizeAnswerKey(questions, payload.includeAnswerKey);

  return {
    exam: {
      examId,
      metadata,
      sections: sectionPlan,
      questions: sanitizedQuestions
    },
    ...(payload.includeAnswerKey
      ? {
          answerKey: {
            examId,
            metadata,
            sections: sectionPlan,
            questions
          }
        }
      : {})
  };
}

export async function generateExam(
  payload: GenerateExamInput
): Promise<{ exam: ExamPayload; answerKey?: ExamPayload; usage?: OpenAiUsage }> {
  ensureApiKey(openai);
  const aiClient = openai;

  const templateSections =
    payload.templateSections && payload.templateSections.length > 0
      ? payload.templateSections
      : inferNcertTemplateSections({
          classLevel: payload.classLevel,
          subject: payload.subject
        }).sections;

  const { sections: sectionPlan, questionCount } = buildSectionPlan(templateSections);
  const prompt = buildExamPrompt({
    classLevel: payload.classLevel,
    subject: payload.subject,
    difficulty: payload.difficulty,
    language: payload.language,
    ...(payload.chapterContext ? { chapterContext: payload.chapterContext } : {}),
    ...(payload.patternGuidance ? { patternGuidance: payload.patternGuidance } : {}),
    ...(payload.templateStructure !== undefined
      ? { templateStructure: payload.templateStructure }
      : {}),
    chapters: payload.mode === "REFERENCE_ONLY" ? ["Reference"] : payload.ncertChapters,
    sectionPlan
  });

  const attemptGeneration = async (
    attempt: number
  ): Promise<{ parsedExam: z.infer<typeof modelResponseSchema>; usage?: OpenAiUsage }> => {
    const response = await callWithRetry("exam_generation", (signal) =>
      aiClient.responses.create(
        {
          model: MODEL_NAME,
          input: prompt,
          temperature: 0.4
        },
        { signal }
      )
    );

    logTokenUsage("exam_generation", (response as { usage?: object }).usage as never);

    const content = extractResponseText(response);
    console.log("AI RESPONSE:", content);
    if (!content) {
      throw new Error("OpenAI response was empty.");
    }

    const parsed = safeJsonParse(content);
    const schemaParsed = modelResponseSchema.safeParse(parsed);
    if (!schemaParsed.success) {
      if (attempt === 0) {
        return attemptGeneration(1);
      }
      throw new Error("OpenAI response did not match the expected exam schema.");
    }

    if (content.includes("Chapter") || content.toLowerCase().includes("concept")) {
      console.warn("Low-quality markers detected in AI response; continuing without regeneration");
    }

    const containsBannedQuestion = schemaParsed.data.sections.some(
      (section) => validateQuestions(section.questions).length !== section.questions.length
    );

    if (containsBannedQuestion) {
      throw new Error("OpenAI response contained low-quality meta questions.");
    }

    const containsLowQualityQuestionText = schemaParsed.data.sections.some((section) =>
      hasLowQualityQuestionText(section.questions)
    );

    if (containsLowQualityQuestionText) {
      console.warn("Generic low-quality question text detected; continuing without regeneration");
    }

    const usage = toUsage(response);
    return usage ? { parsedExam: schemaParsed.data, usage } : { parsedExam: schemaParsed.data };
  };

  const { parsedExam, usage } = await attemptGeneration(0);

  if (parsedExam.sections.length !== sectionPlan.length) {
    throw new Error("OpenAI response contained unexpected section count.");
  }

  const allowedChapters =
    payload.mode === "REFERENCE_ONLY" ? ["Reference"] : payload.ncertChapters;
  const fallbackChapter = allowedChapters[0] ?? "Reference";

  const questions: ExamQuestion[] = [];

  parsedExam.sections.forEach((section, sectionIndex) => {
    const plan = sectionPlan[sectionIndex];
    if (!plan) {
      throw new Error("OpenAI response did not align with template sections.");
    }

    const validatedQuestions = validateQuestions(section.questions as AiQuestion[]);
    if (validatedQuestions.length !== plan.questionsToGenerate) {
      throw new Error("OpenAI response section question counts mismatched.");
    }

    validatedQuestions.forEach((question, questionOffset) => {
      const number = plan.questionNumbers[questionOffset] ?? questions.length + 1;
      const choices = normalizeOptions(question.options, plan.type, DEFAULT_CHOICES_PER_QUESTION);
      const isMcq = plan.type === "mcq";

      questions.push({
        id: `q_${number}`,
        number,
        sectionNumber: plan.sectionNumber,
        chapter: normalizeChapter(question.chapter, allowedChapters, fallbackChapter),
        type: plan.type ?? "short",
        prompt: question.question.trim(),
        choices,
        ...(payload.includeAnswerKey
          ? isMcq
            ? {
                answerIndex: resolveAnswerIndex(question.correctAnswer, choices),
                explanation: question.correctAnswer?.trim() || "Answer not provided."
              }
            : {
                explanation: question.correctAnswer?.trim() || "Model answer not provided."
              }
          : {})
      });
    });
  });

  const metadata = {
    topic: payload.topic ?? payload.subject,
    subject: payload.subject,
    classLevel: payload.classLevel,
    language: payload.language,
    difficulty: payload.difficulty,
    questionCount,
    choicesPerQuestion: DEFAULT_CHOICES_PER_QUESTION,
    generatedAt: new Date().toISOString(),
    ncertChapters: payload.mode === "REFERENCE_ONLY" ? [] : payload.ncertChapters,
    mode: payload.mode,
    ...(payload.templateId ? { templateId: payload.templateId } : {}),
    ...(payload.sectionId ? { sectionId: payload.sectionId } : {})
  };

  const examId = randomUUID();
  const sanitizedQuestions = sanitizeAnswerKey(questions, payload.includeAnswerKey);
  const answerKeyQuestions = payload.includeAnswerKey ? questions : null;

  return {
    exam: {
      examId,
      metadata,
      sections: sectionPlan,
      questions: sanitizedQuestions
    },
    ...(answerKeyQuestions
      ? {
          answerKey: {
            examId,
            metadata,
            sections: sectionPlan,
            questions: answerKeyQuestions
          }
        }
      : {}),
    ...(usage ? { usage } : {})
  };
}
