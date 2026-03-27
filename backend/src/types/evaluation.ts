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
