import type { NotificationDispatchSummary } from "./notifications";

export type EvaluationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface EvaluationAuthFlags {
  handwritingLikely: boolean;
  aiGeneratedLikelihood: number;
  notes: string;
}

export interface EvaluationQuestionFeedback {
  questionNumber: number;
  score: number;
  maxScore: number;
  remarks: string;
  detectedAnswer: string;
}

export interface EvaluationTopicAnalysis {
  strengths: string[];
  weaknesses: string[];
}

export interface EvaluationResult {
  overallScore: number;
  maxScore: number;
  summary: string;
  authenticity: EvaluationAuthFlags;
  perQuestion: EvaluationQuestionFeedback[];
  topicAnalysis: EvaluationTopicAnalysis;
}

export interface EvaluationSummary {
  id: string;
  examId: string;
  studentId: string;
  submissionId: string;
  status: EvaluationStatus;
  aiScore?: number | null;
  studentName?: string | null;
  examName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationDetail {
  id: string;
  submissionId: string;
  examId: string;
  studentId: string;
  status: EvaluationStatus;
  score: number | null;
  result: EvaluationResult | null;
  aiScore?: number | null;
  aiResult?: EvaluationResult | null;
  teacherScore?: number | null;
  teacherResult?: EvaluationResult | null;
  answerFileName?: string | null;
  extractedText?: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  notifications?: NotificationDispatchSummary[];
}
