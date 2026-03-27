import type { NotificationDispatchSummary } from "./notifications";

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

export type ExamTemplateSection = {
  title: string;
  type: NormalizedQuestionType;
  questionsToGenerate: number;
  questionsToAttempt: number;
  marksPerQuestion: number;
};

export interface ExamSummary {
  id: string;
  examPaperId?: string | null;
  subject?: string;
  classLevel?: number;
  classId?: string;
  language?: string;
  difficulty?: string;
  ncertChapters?: unknown;
  mode?: ExamGenerationMode;
  status?: ExamLifecycleStatus;
  assignedClassId?: string | null;
  assignedClassLevel?: number | null;
  questionCount?: number;
  choicesPerQuestion?: number;
  templateId?: string;
  sectionId?: string;
  generatedAt: string;
  createdAt: string;
}

export interface ExamListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: ExamSummary[];
}

export interface GenerateExamResponse {
  examId: string;
  examPaperId?: string | null;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  notifications?: NotificationDispatchSummary[];
}

export interface GenerateExamInput {
  topic?: string;
  subject: string;
  subjectId?: string;
  subjectIds?: string[];
  classId?: string;
  classLevel?: number;
  sectionId?: string;
  language: ExamLanguage;
  difficulty: Difficulty;
  templateId?: string;
  includeAnswerKey?: boolean;
  ncertChapters?: string[];
  chapterIds?: string[];
  bookIds?: string[];
  mode: ExamGenerationMode;
  ncertBookIds: string[];
  referenceBookIds?: string[];
}

export interface ExamDetailResponse {
  id: string;
  metadata: {
    subject?: string;
    classLevel?: number;
    language?: string;
    difficulty?: string;
    ncertChapters?: unknown;
    mode?: ExamGenerationMode;
    status?: ExamLifecycleStatus;
    assignedClassId?: string | null;
    assignedClassLevel?: number | null;
    questionCount?: number;
    choicesPerQuestion?: number;
    templateId?: string;
    sectionId?: string;
    answerKeyReleased?: boolean;
  };
  sections: unknown;
  questions: unknown;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}
