import type { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";
import type { EvaluationResult } from "../types/evaluation";

export type AnalyticsDateRange = {
  startDate?: Date;
  endDate?: Date;
};

export type AnalyticsFilters = AnalyticsDateRange & {
  subject?: string;
  classLevel?: number;
  difficulty?: string;
};

export type StudentAnalyticsParams = AnalyticsFilters & {
  schoolId: string;
  studentId: string;
};

export type ParentAnalyticsParams = AnalyticsFilters & {
  schoolId: string;
  studentIds: string[];
};

export type TeacherAnalyticsParams = AnalyticsFilters & {
  schoolId: string;
  teacherId?: string;
};

export type AdminAnalyticsParams = AnalyticsFilters & {
  schoolId: string;
};

type ExamMeta = {
  subject?: string;
  classLevel?: number;
  language?: string;
  difficulty?: string;
  ncertChapters?: string[];
  teacherId?: string;
  schoolId?: string;
};

type TopicCount = {
  topic: string;
  count: number;
};

type TrendPoint = {
  period: string;
  averagePercentage: number;
  averageScore: number;
  exams: number;
};

type SubjectPerformance = {
  subject: string;
  exams: number;
  averageScore: number;
  averagePercentage: number;
};

type DifficultyPerformance = {
  difficulty: string;
  evaluations: number;
  averagePercentage: number;
};

type AnalyticsEvaluation = {
  evaluationId: string;
  examId: string;
  studentId: string;
  evaluatedAt: Date;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  subject: string;
  classLevel: number | null;
  difficulty: string;
  ncertChapters: string[];
  teacherId: string | null;
  hasTeacherOverride: boolean;
  scoreDelta: number | null;
  strengths: string[];
  weaknesses: string[];
};

const MAX_TOPIC_ITEMS = 6;

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim().length > 0) as string[];
}

function parseExamMeta(meta: Prisma.JsonValue | null): ExamMeta {
  if (!meta || typeof meta !== "object") return {};
  const record = meta as Record<string, unknown>;
  const parsed: ExamMeta = {};
  const subject = normalizeString(record.subject);
  const classLevel = normalizeNumber(record.classLevel);
  const language = normalizeString(record.language);
  const difficulty = normalizeString(record.difficulty);
  const ncertChapters = normalizeStringArray(record.ncertChapters);
  const teacherId = normalizeString(record.teacherId);
  const schoolId = normalizeString(record.schoolId);

  if (subject) parsed.subject = subject;
  if (classLevel !== undefined) parsed.classLevel = classLevel;
  if (language) parsed.language = language;
  if (difficulty) parsed.difficulty = difficulty;
  if (ncertChapters.length > 0) parsed.ncertChapters = ncertChapters;
  if (teacherId) parsed.teacherId = teacherId;
  if (schoolId) parsed.schoolId = schoolId;

  return parsed;
}

function parseEvaluationResult(value: Prisma.JsonValue | null): Partial<EvaluationResult> | null {
  if (!value || typeof value !== "object") return null;
  return value as Partial<EvaluationResult>;
}

function getEvaluationScore(
  teacherScore: number | null,
  aiScore: number | null
): number | null {
  if (typeof teacherScore === "number" && Number.isFinite(teacherScore)) {
    return teacherScore;
  }
  if (typeof aiScore === "number" && Number.isFinite(aiScore)) {
    return aiScore;
  }
  return null;
}

function getMaxScore(result: Partial<EvaluationResult> | null): number | null {
  if (!result) return null;
  const maxScore = result.maxScore;
  if (typeof maxScore === "number" && Number.isFinite(maxScore)) {
    return maxScore;
  }
  return null;
}

function getTopicList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim().length > 0) as string[];
}

function toPercentage(score: number | null, maxScore: number | null): number | null {
  if (score === null || maxScore === null || maxScore <= 0) return null;
  return Number(((score / maxScore) * 100).toFixed(2));
}

function toPeriodLabel(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function clampTopTopics(map: Map<string, number>): TopicCount[] {
  return Array.from(map.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TOPIC_ITEMS);
}

function buildSubjectPerformance(rows: AnalyticsEvaluation[]): SubjectPerformance[] {
  const subjects = new Map<
    string,
    { scoreSum: number; percentageSum: number; count: number }
  >();

  rows.forEach((row) => {
    const key = row.subject || "Unknown";
    const entry = subjects.get(key) ?? {
      scoreSum: 0,
      percentageSum: 0,
      count: 0
    };

    if (row.score !== null) {
      entry.scoreSum += row.score;
    }
    if (row.percentage !== null) {
      entry.percentageSum += row.percentage;
    }
    entry.count += 1;
    subjects.set(key, entry);
  });

  return Array.from(subjects.entries()).map(([subject, entry]) => ({
    subject,
    exams: entry.count,
    averageScore: entry.count > 0 ? Number((entry.scoreSum / entry.count).toFixed(2)) : 0,
    averagePercentage:
      entry.count > 0 ? Number((entry.percentageSum / entry.count).toFixed(2)) : 0
  }));
}

function buildSubjectVolumePerformance(
  exams: Array<{ meta: Prisma.JsonValue | null }>,
  evaluations: AnalyticsEvaluation[]
): SubjectPerformance[] {
  const examCounts = new Map<string, number>();
  const evaluationStats = new Map<
    string,
    { scoreSum: number; percentageSum: number; count: number }
  >();

  exams.forEach((exam) => {
    const subject = parseExamMeta(exam.meta).subject ?? "Unknown";
    examCounts.set(subject, (examCounts.get(subject) ?? 0) + 1);
  });

  evaluations.forEach((row) => {
    const subject = row.subject || "Unknown";
    const entry = evaluationStats.get(subject) ?? {
      scoreSum: 0,
      percentageSum: 0,
      count: 0
    };

    if (row.score !== null) {
      entry.scoreSum += row.score;
    }
    if (row.percentage !== null) {
      entry.percentageSum += row.percentage;
    }
    entry.count += 1;
    evaluationStats.set(subject, entry);
  });

  return Array.from(examCounts.entries()).map(([subject, examsCount]) => {
    const evaluation = evaluationStats.get(subject);
    return {
      subject,
      exams: examsCount,
      averageScore:
        evaluation && evaluation.count > 0
          ? Number((evaluation.scoreSum / evaluation.count).toFixed(2))
          : 0,
      averagePercentage:
        evaluation && evaluation.count > 0
          ? Number((evaluation.percentageSum / evaluation.count).toFixed(2))
          : 0
    };
  });
}

function buildDifficultyPerformance(rows: AnalyticsEvaluation[]): DifficultyPerformance[] {
  const map = new Map<string, { count: number; percentageSum: number }>();

  rows.forEach((row) => {
    const key = row.difficulty || "unknown";
    const entry = map.get(key) ?? { count: 0, percentageSum: 0 };
    entry.count += 1;
    if (row.percentage !== null) {
      entry.percentageSum += row.percentage;
    }
    map.set(key, entry);
  });

  return Array.from(map.entries()).map(([difficulty, entry]) => ({
    difficulty,
    evaluations: entry.count,
    averagePercentage:
      entry.count > 0 ? Number((entry.percentageSum / entry.count).toFixed(2)) : 0
  }));
}

function buildTrend(rows: AnalyticsEvaluation[]): TrendPoint[] {
  const map = new Map<
    string,
    { scoreSum: number; percentageSum: number; count: number }
  >();

  rows.forEach((row) => {
    const period = toPeriodLabel(row.evaluatedAt);
    const entry = map.get(period) ?? { scoreSum: 0, percentageSum: 0, count: 0 };
    entry.count += 1;
    if (row.score !== null) {
      entry.scoreSum += row.score;
    }
    if (row.percentage !== null) {
      entry.percentageSum += row.percentage;
    }
    map.set(period, entry);
  });

  return Array.from(map.entries())
    .map(([period, entry]) => ({
      period,
      averageScore: entry.count ? Number((entry.scoreSum / entry.count).toFixed(2)) : 0,
      averagePercentage: entry.count
        ? Number((entry.percentageSum / entry.count).toFixed(2))
        : 0,
      exams: entry.count
    }))
    .sort((a, b) => (a.period > b.period ? 1 : -1));
}

function withinFilters(row: AnalyticsEvaluation, filters: AnalyticsFilters) {
  if (filters.subject && row.subject.toLowerCase() !== filters.subject.toLowerCase()) {
    return false;
  }
  if (filters.classLevel && row.classLevel !== filters.classLevel) {
    return false;
  }
  if (filters.difficulty && row.difficulty.toLowerCase() !== filters.difficulty.toLowerCase()) {
    return false;
  }
  return true;
}

async function fetchApprovedEvaluations(
  schoolId: string,
  options: {
    studentIds?: string[];
    teacherId?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<AnalyticsEvaluation[]> {
  const evaluations = await prisma.examEvaluation.findMany({
    where: {
      status: "APPROVED",
      schoolId,
      ...(options.studentIds ? { studentId: { in: options.studentIds } } : null),
      createdAt: {
        ...(options.startDate ? { gte: options.startDate } : null),
        ...(options.endDate ? { lte: options.endDate } : null)
      },
      ...(options.teacherId ? { exam: { teacherId: options.teacherId } } : {})
    },
    select: {
      id: true,
      examId: true,
      studentId: true,
      aiScore: true,
      aiResult: true,
      teacherScore: true,
      teacherResult: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
      exam: {
        select: {
          meta: true,
          teacherId: true
        }
      }
    }
  });

  return evaluations
    .map((evaluation) => {
      const examMeta = parseExamMeta(evaluation.exam.meta);
      if (options.teacherId && evaluation.exam.teacherId !== options.teacherId) {
        return null;
      }
      const result = parseEvaluationResult(
        evaluation.teacherResult ?? evaluation.aiResult ?? null
      );
      const score = getEvaluationScore(evaluation.teacherScore, evaluation.aiScore);
      const maxScore = getMaxScore(result);
      const percentage = toPercentage(score, maxScore);
      const topicAnalysis = result?.topicAnalysis ?? null;
      const strengths = topicAnalysis
        ? getTopicList((topicAnalysis as unknown as Record<string, unknown>).strengths)
        : [];
      const weaknesses = topicAnalysis
        ? getTopicList((topicAnalysis as unknown as Record<string, unknown>).weaknesses)
        : [];

      return {
        evaluationId: evaluation.id,
        examId: evaluation.examId,
        studentId: evaluation.studentId,
        evaluatedAt: evaluation.reviewedAt ?? evaluation.updatedAt ?? evaluation.createdAt,
        score,
        maxScore,
        percentage,
        subject: examMeta.subject ?? "Unknown",
        classLevel: examMeta.classLevel ?? null,
        difficulty: examMeta.difficulty ?? "unknown",
        ncertChapters: examMeta.ncertChapters ?? [],
        teacherId: evaluation.exam.teacherId ?? null,
        hasTeacherOverride:
          evaluation.teacherScore !== null || evaluation.teacherResult !== null,
        scoreDelta:
          evaluation.teacherScore !== null && evaluation.aiScore !== null
            ? Number((evaluation.teacherScore - evaluation.aiScore).toFixed(2))
            : null,
        strengths,
        weaknesses
      };
    })
    .filter((row): row is AnalyticsEvaluation => row !== null);
}

export async function buildStudentAnalytics(params: StudentAnalyticsParams) {
  const evaluations = await fetchApprovedEvaluations(params.schoolId, {
    studentIds: [params.studentId],
    ...(params.startDate ? { startDate: params.startDate } : {}),
    ...(params.endDate ? { endDate: params.endDate } : {})
  });

  const filtered = evaluations.filter((row) => withinFilters(row, params));
  const subjectPerformance = buildSubjectPerformance(filtered);
  const trend = buildTrend(filtered);

  const strengthMap = new Map<string, number>();
  const weaknessMap = new Map<string, number>();

  filtered.forEach((row) => {
    row.strengths.forEach((topic) => {
      strengthMap.set(topic, (strengthMap.get(topic) ?? 0) + 1);
    });
    row.weaknesses.forEach((topic) => {
      weaknessMap.set(topic, (weaknessMap.get(topic) ?? 0) + 1);
    });
  });

  const totalEvaluations = filtered.length;
  const averagePercentage =
    totalEvaluations > 0
      ? Number(
          (
            filtered.reduce((sum, row) => sum + (row.percentage ?? 0), 0) /
            totalEvaluations
          ).toFixed(2)
        )
      : 0;
  const averageScore =
    totalEvaluations > 0
      ? Number(
          (
            filtered.reduce((sum, row) => sum + (row.score ?? 0), 0) / totalEvaluations
          ).toFixed(2)
        )
      : 0;

  const bestSubject = subjectPerformance
    .slice()
    .sort((a, b) => b.averagePercentage - a.averagePercentage)[0]?.subject;
  const weakestSubject = subjectPerformance
    .slice()
    .sort((a, b) => a.averagePercentage - b.averagePercentage)[0]?.subject;

  const recentEvaluations = filtered
    .slice()
    .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())
    .slice(0, 6)
    .map((row) => ({
      examId: row.examId,
      subject: row.subject,
      difficulty: row.difficulty,
      score: row.score,
      maxScore: row.maxScore,
      percentage: row.percentage,
      evaluatedAt: row.evaluatedAt.toISOString()
    }));

  const generatedAt = new Date().toISOString();

  return {
    studentId: params.studentId,
    range: {
      startDate: params.startDate?.toISOString() ?? null,
      endDate: params.endDate?.toISOString() ?? null
    },
    filters: {
      subject: params.subject ?? null,
      classLevel: params.classLevel ?? null,
      difficulty: params.difficulty ?? null
    },
    summary: {
      totalEvaluations,
      averageScore,
      averagePercentage,
      bestSubject: bestSubject ?? null,
      weakestSubject: weakestSubject ?? null,
      lastEvaluationAt: recentEvaluations[0]?.evaluatedAt ?? null
    },
    subjectPerformance,
    topicInsights: {
      strengths: clampTopTopics(strengthMap),
      weaknesses: clampTopTopics(weaknessMap)
    },
    progress: trend,
    recentEvaluations,
    report: {
      title: "Student Performance Report",
      generatedAt,
      filters: {
        studentId: params.studentId,
        subject: params.subject ?? null,
        classLevel: params.classLevel ?? null,
        difficulty: params.difficulty ?? null,
        startDate: params.startDate?.toISOString() ?? null,
        endDate: params.endDate?.toISOString() ?? null
      },
      sections: [
        {
          id: "summary",
          title: "Summary",
          type: "metrics",
          metrics: [
            { label: "Approved evaluations", value: totalEvaluations },
            { label: "Average score", value: averageScore },
            { label: "Average %", value: averagePercentage },
            { label: "Best subject", value: bestSubject ?? "-" },
            { label: "Weakest subject", value: weakestSubject ?? "-" }
          ]
        },
        {
          id: "subjects",
          title: "Subject performance",
          type: "table",
          columns: ["Subject", "Evaluations", "Avg Score", "Avg %"],
          rows: subjectPerformance.map((item) => [
            item.subject,
            item.exams,
            item.averageScore,
            item.averagePercentage
          ])
        },
        {
          id: "topics",
          title: "Topic insights",
          type: "list",
          items: {
            strengths: clampTopTopics(strengthMap),
            weaknesses: clampTopTopics(weaknessMap)
          }
        }
      ]
    }
  };
}

export async function buildParentAnalytics(params: ParentAnalyticsParams) {
  const evaluations = await fetchApprovedEvaluations(params.schoolId, {
    studentIds: params.studentIds,
    ...(params.startDate ? { startDate: params.startDate } : {}),
    ...(params.endDate ? { endDate: params.endDate } : {})
  });

  const filtered = evaluations.filter((row) => withinFilters(row, params));
  const byStudent = new Map<string, AnalyticsEvaluation[]>();

  filtered.forEach((row) => {
    const list = byStudent.get(row.studentId) ?? [];
    list.push(row);
    byStudent.set(row.studentId, list);
  });

  const children = Array.from(byStudent.entries()).map(([studentId, rows]) => {
    const subjectPerformance = buildSubjectPerformance(rows);
    const trend = buildTrend(rows);
    const totalEvaluations = rows.length;
    const averagePercentage =
      totalEvaluations > 0
        ? Number(
            (
              rows.reduce((sum, row) => sum + (row.percentage ?? 0), 0) /
              totalEvaluations
            ).toFixed(2)
          )
        : 0;
    const lastEvaluationAt = rows
      .slice()
      .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())[0]
      ?.evaluatedAt;

    return {
      studentId,
      summary: {
        totalEvaluations,
        averagePercentage,
        lastEvaluationAt: lastEvaluationAt ? lastEvaluationAt.toISOString() : null
      },
      subjectPerformance,
      progress: trend
    };
  });

  const comparison = children.map((child) => ({
    studentId: child.studentId,
    totalEvaluations: child.summary.totalEvaluations,
    averagePercentage: child.summary.averagePercentage,
    lastEvaluationAt: child.summary.lastEvaluationAt
  }));

  const generatedAt = new Date().toISOString();

  return {
    studentIds: params.studentIds,
    range: {
      startDate: params.startDate?.toISOString() ?? null,
      endDate: params.endDate?.toISOString() ?? null
    },
    filters: {
      subject: params.subject ?? null,
      classLevel: params.classLevel ?? null,
      difficulty: params.difficulty ?? null
    },
    children,
    comparison,
    report: {
      title: "Parent Progress Report",
      generatedAt,
      filters: {
        studentIds: params.studentIds,
        subject: params.subject ?? null,
        classLevel: params.classLevel ?? null,
        difficulty: params.difficulty ?? null,
        startDate: params.startDate?.toISOString() ?? null,
        endDate: params.endDate?.toISOString() ?? null
      },
      sections: [
        {
          id: "comparison",
          title: "Children comparison",
          type: "table",
          columns: ["Student", "Evaluations", "Avg %", "Last evaluation"],
          rows: comparison.map((item) => [
            item.studentId,
            item.totalEvaluations,
            item.averagePercentage,
            item.lastEvaluationAt ?? "-"
          ])
        }
      ]
    }
  };
}

export async function buildTeacherAnalytics(params: TeacherAnalyticsParams) {
  const [exams, evaluations] = await Promise.all([
    prisma.exam.findMany({
      where: {
        schoolId: params.schoolId,
        ...(params.teacherId ? { teacherId: params.teacherId } : {})
      },
      select: { id: true, createdAt: true, meta: true, teacherId: true }
    }),
    fetchApprovedEvaluations(params.schoolId, {
      ...(params.teacherId ? { teacherId: params.teacherId } : {})
    })
  ]);

  const filteredExams = exams.filter((exam) => {
    const meta = parseExamMeta(exam.meta);
    return withinFilters(
      {
        evaluationId: "",
        examId: exam.id,
        studentId: "",
        evaluatedAt: exam.createdAt,
        score: null,
        maxScore: null,
        percentage: null,
        subject: meta.subject ?? "Unknown",
        classLevel: meta.classLevel ?? null,
        difficulty: meta.difficulty ?? "unknown",
        ncertChapters: meta.ncertChapters ?? [],
        teacherId: exam.teacherId ?? null,
        hasTeacherOverride: false,
        scoreDelta: null,
        strengths: [],
        weaknesses: []
      },
      params
    );
  });

  const filteredExamIds = new Set(filteredExams.map((exam) => exam.id));
  const filtered = evaluations.filter(
    (row) => filteredExamIds.has(row.examId) && withinFilters(row, params)
  );
  const subjectPerformance = buildSubjectVolumePerformance(filteredExams, filtered);
  const difficultyPerformance = buildDifficultyPerformance(filtered);

  const topicMap = new Map<string, number>();
  filtered.forEach((row) => {
    row.ncertChapters.forEach((topic) => {
      topicMap.set(topic, (topicMap.get(topic) ?? 0) + 1);
    });
  });

  const overrideCount = filtered.filter((row) => row.hasTeacherOverride).length;
  const approvedEvaluatedCount = filtered.length;
  const aiOnlyCount = approvedEvaluatedCount - overrideCount;
  const deltaRows = filtered.filter((row) => row.scoreDelta !== null).length;
  const averageScoreDelta =
    deltaRows > 0
      ? Number(
          (
            filtered.reduce((sum, row) => sum + (row.scoreDelta ?? 0), 0) / deltaRows
          ).toFixed(2)
        )
      : 0;
  const [submissions, evaluatedCount] = filteredExamIds.size
    ? await Promise.all([
        prisma.examSubmission.findMany({
          where: {
            schoolId: params.schoolId,
            examId: { in: Array.from(filteredExamIds) }
          },
          select: { studentId: true }
        }),
        prisma.examEvaluation.count({
          where: {
            schoolId: params.schoolId,
            examId: { in: Array.from(filteredExamIds) }
          }
        })
      ])
    : [[], 0];
  const totalSubmissions = submissions.length;
  const averagePercentage =
    totalSubmissions > 0
      ? Number(((evaluatedCount / totalSubmissions) * 100).toFixed(2))
      : 0;

  const uniqueStudents = new Set(submissions.map((row) => row.studentId)).size;
  const recentEvaluations = filtered
    .slice()
    .sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime())
    .slice(0, 6)
    .map((row) => ({
      examId: row.examId,
      studentId: row.studentId,
      subject: row.subject,
      difficulty: row.difficulty,
      percentage: row.percentage,
      evaluatedAt: row.evaluatedAt.toISOString()
    }));

  const generatedAt = new Date().toISOString();

  console.log("[analytics][teacher]", {
    schoolId: params.schoolId,
    teacherId: params.teacherId ?? null,
    examsCount: filteredExams.length,
    submissionsCount: totalSubmissions,
    evaluatedCount,
    approvedEvaluatedCount
  });

  return {
    teacherId: params.teacherId ?? null,
    range: {
      startDate: null,
      endDate: null
    },
    filters: {
      subject: params.subject ?? null,
      classLevel: params.classLevel ?? null,
      difficulty: params.difficulty ?? null
    },
    summary: {
      totalExams: filteredExams.length,
      totalSubmissions,
      evaluatedCount,
      totalEvaluations: evaluatedCount,
      uniqueStudents,
      averagePercentage
    },
    subjectPerformance,
    topicDistribution: clampTopTopics(topicMap),
    difficultyEffectiveness: difficultyPerformance,
    overrideStats: {
      totalEvaluations: approvedEvaluatedCount,
      overrideCount,
      aiOnlyCount,
      overrideRate:
        approvedEvaluatedCount > 0
          ? Number((overrideCount / approvedEvaluatedCount).toFixed(2))
          : 0,
      averageScoreDelta
    },
    recentEvaluations,
    report: {
      title: "Teacher Performance Analytics",
      generatedAt,
      filters: {
        teacherId: params.teacherId ?? null,
        subject: params.subject ?? null,
        classLevel: params.classLevel ?? null,
        difficulty: params.difficulty ?? null,
        startDate: params.startDate?.toISOString() ?? null,
        endDate: params.endDate?.toISOString() ?? null
      },
      sections: [
        {
          id: "summary",
          title: "Overview",
          type: "metrics",
          metrics: [
            { label: "Total exams", value: filteredExams.length },
            { label: "Submissions", value: totalSubmissions },
            { label: "Evaluated", value: evaluatedCount },
            { label: "Unique students", value: uniqueStudents },
            { label: "Evaluated %", value: averagePercentage }
          ]
        },
        {
          id: "subjects",
          title: "Subject performance",
          type: "table",
          columns: ["Subject", "Evaluations", "Avg Score", "Avg %"],
          rows: subjectPerformance.map((item) => [
            item.subject,
            item.exams,
            item.averageScore,
            item.averagePercentage
          ])
        }
      ]
    }
  };
}

export async function buildAdminAnalytics(params: AdminAnalyticsParams) {
  const [exams, approvedEvaluations] = await Promise.all([
    prisma.exam.findMany({
      where: {
        schoolId: params.schoolId
      },
      select: {
        id: true,
        createdAt: true,
        meta: true,
        teacherId: true,
        teacher: {
          select: {
            fullName: true
          }
        }
      }
    }),
    fetchApprovedEvaluations(params.schoolId, {
    })
  ]);

  const filteredExams = exams.filter((exam) => {
    const meta = parseExamMeta(exam.meta);
    return withinFilters(
      {
        evaluationId: "",
        examId: exam.id,
        studentId: "",
        evaluatedAt: exam.createdAt,
        score: null,
        maxScore: null,
        percentage: null,
        subject: meta.subject ?? "Unknown",
        classLevel: meta.classLevel ?? null,
        difficulty: meta.difficulty ?? "unknown",
        ncertChapters: meta.ncertChapters ?? [],
        teacherId: exam.teacherId ?? null,
        hasTeacherOverride: false,
        scoreDelta: null,
        strengths: [],
        weaknesses: []
      },
      params
    );
  });

  const filteredExamIds = filteredExams.map((exam) => exam.id);
  const filteredExamIdSet = new Set(filteredExamIds);
  const filteredApprovedEvaluations = approvedEvaluations.filter(
    (row) => filteredExamIdSet.has(row.examId) && withinFilters(row, params)
  );

  const [submissionsCount, evaluatedCount, evaluationStatus, reviewCounts] =
    filteredExamIds.length > 0
      ? await Promise.all([
          prisma.examSubmission.count({
            where: {
              schoolId: params.schoolId,
              examId: { in: filteredExamIds }
            }
          }),
          prisma.examEvaluation.count({
            where: {
              schoolId: params.schoolId,
              examId: { in: filteredExamIds }
            }
          }),
          prisma.examEvaluation.groupBy({
            by: ["status"],
            where: {
              schoolId: params.schoolId,
              examId: { in: filteredExamIds }
            },
            _count: { status: true }
          }),
          prisma.examEvaluation.groupBy({
            by: ["reviewedBy"],
            where: {
              schoolId: params.schoolId,
              examId: { in: filteredExamIds },
              status: "APPROVED",
              reviewedBy: { not: null }
            },
            _count: { reviewedBy: true }
          })
        ])
      : [0, 0, [], []];

  const subjectMap = new Map<string, number>();
  const difficultyMap = new Map<string, number>();
  const teacherExamMap = new Map<string, number>();

  filteredExams.forEach((exam) => {
    const meta = parseExamMeta(exam.meta);
    const subject = meta.subject ?? "Unknown";
    const difficulty = meta.difficulty ?? "unknown";
    subjectMap.set(subject, (subjectMap.get(subject) ?? 0) + 1);
    difficultyMap.set(difficulty, (difficultyMap.get(difficulty) ?? 0) + 1);
    if (exam.teacherId) {
      teacherExamMap.set(exam.teacherId, (teacherExamMap.get(exam.teacherId) ?? 0) + 1);
    }
  });

  const teacherReviewMap = new Map<string, number>();
  reviewCounts.forEach((item) => {
    if (item.reviewedBy) {
      teacherReviewMap.set(item.reviewedBy, item._count.reviewedBy);
    }
  });

  const evaluationQuality = {
    averagePercentage:
      submissionsCount > 0
        ? Number(((evaluatedCount / submissionsCount) * 100).toFixed(2))
        : 0,
    overrideRate:
      filteredApprovedEvaluations.length > 0
        ? Number(
            (
              filteredApprovedEvaluations.filter((row) => row.hasTeacherOverride).length /
              filteredApprovedEvaluations.length
            ).toFixed(2)
          )
        : 0,
    averageScoreDelta:
      filteredApprovedEvaluations.filter((row) => row.scoreDelta !== null).length > 0
        ? Number(
            (
              filteredApprovedEvaluations.reduce((sum, row) => sum + (row.scoreDelta ?? 0), 0) /
              filteredApprovedEvaluations.filter((row) => row.scoreDelta !== null).length
            ).toFixed(2)
          )
        : 0
  };

  const statusBreakdown = evaluationStatus.reduce(
    (acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    },
    {} as Record<string, number>
  );

  const teacherActivity = Array.from(
    new Set([...teacherExamMap.keys(), ...teacherReviewMap.keys()])
  ).map((teacherId) => {
    const teacherName =
      exams.find((exam) => exam.teacherId === teacherId)?.teacher?.fullName?.trim() || teacherId;
    return {
      teacherId,
      teacherName,
      examsCreated: teacherExamMap.get(teacherId) ?? 0,
      evaluationsReviewed: teacherReviewMap.get(teacherId) ?? 0
    };
  });

  const generatedAt = new Date().toISOString();

  console.log("[analytics][admin]", {
    schoolId: params.schoolId,
    examsCount: filteredExams.length,
    submissionsCount,
    evaluatedCount,
    approvedEvaluatedCount: filteredApprovedEvaluations.length
  });

  return {
    range: {
      startDate: null,
      endDate: null
    },
    summary: {
      totalExams: filteredExams.length,
      totalSubmissions: submissionsCount,
      evaluatedCount,
      approvedEvaluations: filteredApprovedEvaluations.length,
      averagePercentage: evaluationQuality.averagePercentage,
      activeTeachers: teacherActivity.length
    },
    examVolume: {
      bySubject: clampTopTopics(subjectMap),
      byDifficulty: clampTopTopics(difficultyMap)
    },
    teacherActivity,
    evaluationQuality,
    statusBreakdown: {
      approved: statusBreakdown.APPROVED ?? 0,
      pending: statusBreakdown.PENDING ?? 0,
      rejected: statusBreakdown.REJECTED ?? 0
    },
    report: {
      title: "Admin Usage Report",
      generatedAt,
      filters: {
        startDate: params.startDate?.toISOString() ?? null,
        endDate: params.endDate?.toISOString() ?? null,
        subject: params.subject ?? null,
        classLevel: params.classLevel ?? null,
        difficulty: params.difficulty ?? null
      },
      sections: [
        {
          id: "summary",
          title: "Usage snapshot",
          type: "metrics",
          metrics: [
            { label: "Total exams", value: filteredExams.length },
            { label: "Total submissions", value: submissionsCount },
            { label: "Evaluated", value: filteredApprovedEvaluations.length },
            { label: "Evaluated %", value: evaluationQuality.averagePercentage }
          ]
        },
        {
          id: "teachers",
          title: "Teacher activity",
          type: "table",
          columns: ["Teacher", "Exams", "Reviews"],
          rows: teacherActivity.map((item) => [
            item.teacherName,
            item.examsCreated,
            item.evaluationsReviewed
          ])
        }
      ]
    }
  };
}
