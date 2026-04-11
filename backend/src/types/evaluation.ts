export type EvaluationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface EvaluationAuthFlags {
  handwritingLikely: boolean;
  aiGeneratedLikelihood: number;
  notes: string;
}

export interface EvaluationQuestionFeedback {
  questionNumber: number;
  question?: string;
  studentAnswer?: string;
  correctAnswer?: string;
  score: number;
  maxScore: number;
  reason?: string;
  remarks: string;
  detectedAnswer: string;
}

export interface EvaluationBreakdownItem {
  questionNumber: number;
  question: string;
  studentAnswer: string;
  correctAnswer: string;
  score: number;
  maxScore: number;
  reason: string;
  detectedAnswer: string;
}

export interface EvaluationTopicAnalysis {
  strengths: string[];
  weaknesses: string[];
}

export interface EvaluationResult {
  totalScore: number;
  overallScore: number;
  maxScore: number;
  summary: string;
  authenticity: EvaluationAuthFlags;
  breakdown: EvaluationBreakdownItem[];
  perQuestion: EvaluationQuestionFeedback[];
  topicAnalysis: EvaluationTopicAnalysis;
}
