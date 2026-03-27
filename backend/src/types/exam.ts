export type Difficulty = "easy" | "medium" | "hard";
export type ExamLanguage = "english" | "hindi" | "punjabi";
export type ExamGenerationMode = "NCERT_ONLY" | "NCERT_PLUS_REFERENCE" | "REFERENCE_ONLY";
export type ExamLifecycleStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type NormalizedQuestionType =
  | "mcq"
  | "very_short"
  | "short"
  | "long"
  | "fill_in_the_blanks";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export interface ExamQuestion extends JsonObject {
  id: string;
  number: number;
  sectionNumber: number;
  chapter: string;
  prompt: string;
  type: NormalizedQuestionType;
  choices: string[];
  answerIndex?: number;
  explanation?: string;
}

export interface ExamSection extends JsonObject {
  sectionNumber: number;
  title: string;
  type?: NormalizedQuestionType;
  questionsToGenerate?: number;
  questionsToAttempt?: number;
  marksPerQuestion?: number;
  questionNumbers: number[];
}

export type ExamTemplateSection = {
  title: string;
  type: NormalizedQuestionType;
  questionsToGenerate: number;
  questionsToAttempt: number;
  marksPerQuestion: number;
};

export const DEFAULT_CBSE_TEMPLATE_SECTIONS: ExamTemplateSection[] = [
  {
    title: "Section A - MCQ",
    type: "mcq",
    questionsToGenerate: 5,
    questionsToAttempt: 5,
    marksPerQuestion: 1
  },
  {
    title: "Section B - Very short answer",
    type: "very_short",
    questionsToGenerate: 5,
    questionsToAttempt: 5,
    marksPerQuestion: 2
  },
  {
    title: "Section C - Short answer",
    type: "short",
    questionsToGenerate: 5,
    questionsToAttempt: 5,
    marksPerQuestion: 3
  },
  {
    title: "Section D - Long answer",
    type: "long",
    questionsToGenerate: 3,
    questionsToAttempt: 3,
    marksPerQuestion: 5
  },
  {
    title: "Section E - Application / HOTS",
    type: "long",
    questionsToGenerate: 1,
    questionsToAttempt: 1,
    marksPerQuestion: 5
  }
];

export interface ExamMetadata {
  topic: string;
  subject: string;
  classLevel: number;
  language: ExamLanguage;
  difficulty: Difficulty;
  questionCount: number;
  choicesPerQuestion: number;
  generatedAt: string;
  templateId?: string;
  ncertChapters: string[];
  mode: ExamGenerationMode;
  ncertBookIds?: string[];
  referenceBookIds?: string[];
  status?: ExamLifecycleStatus;
  assignedClassId?: string;
  assignedClassLevel?: number;
  sectionId?: string;
}

export interface ExamPayload {
  examId: string;
  metadata: ExamMetadata;
  sections: ExamSection[];
  questions: ExamQuestion[];
}

export interface GenerateExamInput {
  topic?: string | undefined;
  subject: string;
  classLevel: number;
  sectionId?: string | undefined;
  language: ExamLanguage;
  difficulty: Difficulty;
  templateId?: string | undefined;
  templateSections?: ExamTemplateSection[] | undefined;
  templateStructure?: unknown | null | undefined;
  chapterContext?: string | undefined;
  patternGuidance?: string | undefined;
  includeAnswerKey: boolean;
  ncertChapters: string[];
  mode: ExamGenerationMode;
  ncertBookIds: string[];
  referenceBookIds?: string[] | undefined;
  subjectIds?: string[] | undefined;
  subjectId?: string | undefined;
  classId?: string | undefined;
}
