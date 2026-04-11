import type {
  EvaluationBreakdownItem,
  EvaluationQuestionFeedback,
  EvaluationResult
} from "@/types/evaluation";

function normalizeBreakdownItem(
  item: Partial<EvaluationBreakdownItem> & { questionNumber: number }
): EvaluationBreakdownItem {
  return {
    questionNumber: item.questionNumber,
    question: item.question?.trim() || `Question ${item.questionNumber}`,
    studentAnswer: item.studentAnswer?.trim() || "Not extracted",
    correctAnswer: item.correctAnswer?.trim() || "Not available",
    score: typeof item.score === "number" ? item.score : 0,
    maxScore: typeof item.maxScore === "number" ? item.maxScore : 1,
    reason: item.reason?.trim() || "No reasoning available.",
    detectedAnswer: item.detectedAnswer?.trim() || "unavailable"
  };
}

function perQuestionToBreakdown(item: EvaluationQuestionFeedback): EvaluationBreakdownItem {
  return normalizeBreakdownItem({
    questionNumber: item.questionNumber,
    question: item.question,
    studentAnswer: item.studentAnswer ?? item.detectedAnswer,
    correctAnswer: item.correctAnswer,
    score: item.score,
    maxScore: item.maxScore,
    reason: item.reason ?? item.remarks,
    detectedAnswer: item.detectedAnswer
  });
}

export function getEvaluationBreakdown(result?: EvaluationResult | null): EvaluationBreakdownItem[] {
  if (!result) {
    return [];
  }

  if (Array.isArray(result.breakdown) && result.breakdown.length > 0) {
    return result.breakdown.map(normalizeBreakdownItem);
  }

  if (Array.isArray(result.perQuestion) && result.perQuestion.length > 0) {
    return result.perQuestion.map(perQuestionToBreakdown);
  }

  return [];
}

export function buildTeacherOverrideResult(
  base: EvaluationResult | null | undefined,
  teacherScoreText: string,
  summaryText: string,
  overrideBreakdown?: EvaluationBreakdownItem[]
): EvaluationResult | undefined {
  if (!base) {
    return undefined;
  }

  const breakdown = (overrideBreakdown && overrideBreakdown.length > 0
    ? overrideBreakdown
    : getEvaluationBreakdown(base)
  ).map(normalizeBreakdownItem);
  const overrideValue = Number(teacherScoreText);
  const computedScore = breakdown.reduce((sum, item) => sum + item.score, 0);
  const totalScore =
    teacherScoreText.trim().length > 0 && Number.isFinite(overrideValue)
      ? overrideValue
      : computedScore;
  const summary = summaryText.trim() || base.summary;

  return {
    ...base,
    totalScore,
    overallScore: totalScore,
    summary,
    breakdown,
    perQuestion: breakdown.map((item) => ({
      questionNumber: item.questionNumber,
      question: item.question,
      studentAnswer: item.studentAnswer,
      correctAnswer: item.correctAnswer,
      score: item.score,
      maxScore: item.maxScore,
      reason: item.reason,
      remarks: item.reason,
      detectedAnswer: item.detectedAnswer
    }))
  };
}
