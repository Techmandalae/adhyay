export type TopicCount = {
  topic: string;
  count: number;
};

export type SubjectPerformance = {
  subject: string;
  exams: number;
  averageScore: number;
  averagePercentage: number;
};

export type TrendPoint = {
  period: string;
  averagePercentage: number;
  averageScore: number;
  exams: number;
};

export type DifficultyPerformance = {
  difficulty: string;
  evaluations: number;
  averagePercentage: number;
};

export type StudentAnalyticsResponse = {
  studentId: string;
  range: { startDate: string | null; endDate: string | null };
  filters: { subject: string | null; classLevel: number | null; difficulty: string | null };
  summary: {
    totalEvaluations: number;
    averageScore: number;
    averagePercentage: number;
    bestSubject: string | null;
    weakestSubject: string | null;
    lastEvaluationAt: string | null;
  };
  subjectPerformance: SubjectPerformance[];
  topicInsights: { strengths: TopicCount[]; weaknesses: TopicCount[] };
  progress: TrendPoint[];
  recentEvaluations: Array<{
    examId: string;
    subject: string;
    difficulty: string;
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
    evaluatedAt: string;
  }>;
  report: {
    title: string;
    generatedAt: string;
    filters: Record<string, unknown>;
    sections: Array<Record<string, unknown>>;
  };
};

export type ParentAnalyticsResponse = {
  studentIds: string[];
  range: { startDate: string | null; endDate: string | null };
  filters: { subject: string | null; classLevel: number | null; difficulty: string | null };
  children: Array<{
    studentId: string;
    summary: { totalEvaluations: number; averagePercentage: number; lastEvaluationAt: string | null };
    subjectPerformance: SubjectPerformance[];
    progress: TrendPoint[];
  }>;
  comparison: Array<{
    studentId: string;
    totalEvaluations: number;
    averagePercentage: number;
    lastEvaluationAt: string | null;
  }>;
  report: {
    title: string;
    generatedAt: string;
    filters: Record<string, unknown>;
    sections: Array<Record<string, unknown>>;
  };
};

export type TeacherAnalyticsResponse = {
  teacherId: string | null;
  range: { startDate: string | null; endDate: string | null };
  filters: { subject: string | null; classLevel: number | null; difficulty: string | null };
  summary: { totalEvaluations: number; uniqueStudents: number; averagePercentage: number };
  subjectPerformance: SubjectPerformance[];
  topicDistribution: TopicCount[];
  difficultyEffectiveness: DifficultyPerformance[];
  overrideStats: {
    totalEvaluations: number;
    overrideCount: number;
    aiOnlyCount: number;
    overrideRate: number;
    averageScoreDelta: number;
  };
  recentEvaluations: Array<{
    examId: string;
    studentId: string;
    subject: string;
    difficulty: string;
    percentage: number | null;
    evaluatedAt: string;
  }>;
  report: {
    title: string;
    generatedAt: string;
    filters: Record<string, unknown>;
    sections: Array<Record<string, unknown>>;
  };
};

export type AdminAnalyticsResponse = {
  range: { startDate: string | null; endDate: string | null };
  summary: {
    totalExams: number;
    totalSubmissions: number;
    approvedEvaluations: number;
    averagePercentage: number;
    activeTeachers: number;
  };
  examVolume: {
    bySubject: TopicCount[];
    byDifficulty: TopicCount[];
  };
  teacherActivity: Array<{ teacherId: string; examsCreated: number; evaluationsReviewed: number }>;
  evaluationQuality: { averagePercentage: number; overrideRate: number; averageScoreDelta: number };
  statusBreakdown: { approved: number; pending: number; rejected: number };
  report: {
    title: string;
    generatedAt: string;
    filters: Record<string, unknown>;
    sections: Array<Record<string, unknown>>;
  };
};
