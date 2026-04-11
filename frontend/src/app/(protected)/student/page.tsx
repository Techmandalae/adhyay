"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { BarChart } from "@/components/analytics/BarChart";
import { DataTable } from "@/components/analytics/DataTable";
import { MetricGrid } from "@/components/analytics/MetricGrid";
import { TrendChart } from "@/components/analytics/TrendChart";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  downloadExamPdf,
  getAcademicSubjects,
  getAssignedExams,
  getExamPreview,
  getEvaluation,
  getStudentAnalytics,
  uploadSubmission
} from "@/lib/api";
import { loadSubmissions, saveSubmission, type StoredSubmission } from "@/lib/localSubmissions";
import { summarizeNotifications } from "@/lib/notifications";
import type { StudentAnalyticsResponse } from "@/types/analytics";
import type { AcademicSubject } from "@/types/academic";
import type { ExamDetailResponse, ExamSummary } from "@/types/exam";
import type { EvaluationDetail } from "@/types/evaluation";
import type { NotificationDispatchSummary } from "@/types/notifications";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

export default function StudentDashboard() {
  const { token, user } = useAuth();
  const [examId, setExamId] = useState("");
  const [assignedExams, setAssignedExams] = useState<AsyncState<ExamSummary[]>>({
    status: "idle",
    data: null
  });
  const [examDetail, setExamDetail] = useState<AsyncState<ExamDetailResponse>>({
    status: "idle",
    data: null
  });
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [rawAnswerText, setRawAnswerText] = useState("");
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<
    AsyncState<{
      submissionId: string;
      score?: number;
      notifications?: NotificationDispatchSummary[];
      fileUrl?: string | null;
    }>
  >({
    status: "idle",
    data: null
  });
  const [submissions, setSubmissions] = useState<StoredSubmission[]>(() => loadSubmissions());
  const [evaluationState, setEvaluationState] = useState<AsyncState<EvaluationDetail>>({
    status: "idle",
    data: null
  });
  const [analyticsState, setAnalyticsState] = useState<AsyncState<StudentAnalyticsResponse>>({
    status: "idle",
    data: null
  });
  const [analyticsFilters, setAnalyticsFilters] = useState({
    startDate: "",
    endDate: "",
    subject: "",
    difficulty: ""
  });
  const [subjectOptions, setSubjectOptions] = useState<AcademicSubject[]>([]);

  const refreshAssigned = async () => {
    if (!token) return;
    setAssignedExams({ status: "loading", data: null });
    try {
      const response = await getAssignedExams(token);
      setAssignedExams({ status: "success", data: response.items });
    } catch (error) {
      setAssignedExams({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Unable to load assigned exams"
      });
    }
  };

  useEffect(() => {
    if (!token) return;
    let isActive = true;
    const loadAssigned = async () => {
      setAssignedExams({ status: "loading", data: null });
      try {
        const response = await getAssignedExams(token);
        if (!isActive) return;
        setAssignedExams({ status: "success", data: response.items });
      } catch (error) {
        if (!isActive) return;
        setAssignedExams({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Unable to load assigned exams"
        });
      }
    };
    void loadAssigned();
    return () => {
      isActive = false;
    };
  }, [token]);

  useEffect(() => {
    const classId = user?.classId;
    if (!token || !classId) return;
    let isActive = true;
    const loadSubjects = async () => {
      try {
        const response = await getAcademicSubjects(token, classId);
        if (!isActive) return;
        setSubjectOptions(response.items);
      } catch {
        if (!isActive) return;
        setSubjectOptions([]);
      }
    };
    void loadSubjects();
    return () => {
      isActive = false;
    };
  }, [token, user?.classId]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleFetchExam = async () => {
    if (!token || !examId.trim()) return;
    setExamDetail({ status: "loading", data: null });
    try {
      const response = await getExamPreview(token, examId.trim());
      setExamDetail({ status: "success", data: response });
    } catch (error) {
      setExamDetail({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Unable to fetch exam"
      });
    }
  };

  const handleFileChange = (nextFile: File | null) => {
    setFilePreviewUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      return nextFile && nextFile.type.startsWith("image/")
        ? URL.createObjectURL(nextFile)
        : null;
    });
    setFile(nextFile);
  };

  const handleDownloadPdf = async () => {
    if (!token || !examId.trim()) return;
    try {
      const blob = await downloadExamPdf(token, examId.trim());
      triggerDownload(blob, `exam-${examId.trim()}.pdf`);
    } catch (error) {
      setExamDetail({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Unable to download exam PDF"
      });
    }
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !examId.trim()) return;

    if (!file && rawAnswerText.trim().length === 0) {
      setAnswerError("Upload a file or type your answers.");
      return;
    }
    setAnswerError(null);

    setUploadState({ status: "loading", data: null });
    try {
      const response = await uploadSubmission(
        token,
        examId.trim(),
        file,
        rawAnswerText.trim()
      );
      setUploadState({
        status: "success",
        data: {
          submissionId: response.submissionId,
          score: response.score,
          notifications: response.notifications,
          fileUrl: response.fileUrl ?? null
        }
      });
      const stored: StoredSubmission = {
        submissionId: response.submissionId,
        evaluationId: response.evaluationId,
        examId: examId.trim(),
        createdAt: new Date().toISOString()
      };
      saveSubmission(stored);
      setSubmissions(loadSubmissions());
      handleFileChange(null);
      setRawAnswerText("");
    } catch (error) {
      setUploadState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to upload submission"
      });
    }
  };

  const handleLoadEvaluation = async (submissionId: string) => {
    if (!token) return;
    setEvaluationState({ status: "loading", data: null });
    try {
      const detail = await getEvaluation(token, submissionId);
      setEvaluationState({ status: "success", data: detail });
    } catch (error) {
      setEvaluationState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load evaluation"
      });
    }
  };

  const handleLoadAnalytics = async () => {
    if (!token) return;
    setAnalyticsState({ status: "loading", data: null });
    try {
      const payload = await getStudentAnalytics(token, {
        startDate: analyticsFilters.startDate || undefined,
        endDate: analyticsFilters.endDate || undefined,
        subject: analyticsFilters.subject.trim() || undefined,
        difficulty: analyticsFilters.difficulty || undefined
      });
      setAnalyticsState({ status: "success", data: payload });
    } catch (error) {
      setAnalyticsState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load analytics"
      });
    }
  };

  return (
    <RequireRole roles={["STUDENT"]}>
      <div className="mx-auto grid max-w-6xl gap-10">
        <SectionHeader
          eyebrow="Student hub"
          title="Submit answers and track progress"
          subtitle="Upload handwritten sheets and view approved feedback."
        />
        <div className="flex flex-wrap gap-3">
          <Link href="/student/results">
            <Button variant="outline">Open results</Button>
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-4">
            <SectionHeader eyebrow="Exam lookup" title="Find your exam" />
            <Select
              label="Assigned exams"
              value={examId}
              onChange={(event) => setExamId(event.target.value)}
            >
              <option value="">Select an exam</option>
              {(assignedExams.data ?? []).map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.subject ?? "Exam"} · Class {exam.classLevel ?? "—"}
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleFetchExam} disabled={!token || !examId}>
                Fetch exam details
              </Button>
              {examId ? (
                <Link href={`/student/exam/${examId}`}>
                  <Button variant="outline">Preview Exam</Button>
                </Link>
              ) : (
                <Button variant="outline" disabled>
                  Preview Exam
                </Button>
              )}
              <Button variant="outline" onClick={handleDownloadPdf} disabled={!token || !examId}>
                Download PDF
              </Button>
              <Button
                variant="ghost"
                onClick={refreshAssigned}
                disabled={!token}
              >
                Refresh list
              </Button>
            </div>
            {assignedExams.status === "loading" ? (
              <p className="text-sm text-ink-soft">Loading assigned exams…</p>
            ) : null}
            {assignedExams.status === "error" ? (
              <StatusBlock
                tone="negative"
                title="Unable to load exams"
                description={assignedExams.error ?? ""}
              />
            ) : null}
            {examDetail.status === "loading" ? (
              <p className="text-sm text-ink-soft">Loading exam…</p>
            ) : null}
            {examDetail.status === "error" ? (
              <StatusBlock tone="negative" title="Unable to fetch" description={examDetail.error ?? ""} />
            ) : null}
            {examDetail.data ? (
              <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                <p className="font-semibold">{examDetail.data.metadata.subject ?? "Exam"}</p>
                <p className="text-xs text-ink-soft">
                  Class {examDetail.data.metadata.classLevel ?? "—"} ·{" "}
                  {examDetail.data.metadata.difficulty ?? "—"}
                </p>
              </div>
            ) : null}
          </Card>

          <Card className="space-y-4">
            <SectionHeader
              eyebrow="Upload"
              title="Submit your answer sheet"
              subtitle="Upload a handwritten answer PDF or image, or type your answers directly."
            />
            <form className="grid gap-4" onSubmit={handleUpload}>
              <Select
                label="Assigned exam"
                value={examId}
                onChange={(event) => setExamId(event.target.value)}
                required
              >
                <option value="">Select an exam</option>
                {(assignedExams.data ?? []).map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.subject ?? "Exam"} · Class {exam.classLevel ?? "—"}
                  </option>
                ))}
              </Select>
              <label className="flex flex-col gap-2 text-sm">
                <span className="font-medium text-foreground">Answer sheet file</span>
                <input
                  className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="space-y-3">
                    <span className="text-xs text-ink-soft">{file.name}</span>
                    {filePreviewUrl ? (
                      <div className="inline-flex flex-col gap-2 rounded-2xl border border-border bg-white p-2">
                        <Image
                          src={filePreviewUrl}
                          alt={`Preview of ${file.name}`}
                          unoptimized
                          width={112}
                          height={112}
                          className="h-28 w-28 rounded-xl object-cover"
                        />
                        <span className="max-w-28 text-xs text-ink-soft">{file.name}</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-3 py-2 text-xs text-ink-soft">
                        <span className="text-base font-semibold leading-none">PDF</span>
                        <span>{file.name}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-ink-soft">PDF, JPG, or PNG up to 5MB.</span>
                )}
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="font-medium text-foreground">Write your answers (optional)</span>
                <textarea
                  className="min-h-[120px] rounded-2xl border border-border bg-surface px-4 py-2 text-sm outline-none transition focus:border-accent"
                  placeholder={"Write answers like:\n1. Answer text\n2. Answer text"}
                  value={rawAnswerText}
                  onChange={(event) => setRawAnswerText(event.target.value)}
                />
              </label>
              <Button
                type="submit"
                disabled={!token || !examId || uploadState.status === "loading"}
              >
                {uploadState.status === "loading" ? "Uploading…" : "Submit answers"}
              </Button>
            </form>
            {uploadState.status === "success" ? (
              <StatusBlock
                tone="positive"
                title="Submission received"
                description={
                  [
                    `Submission ID: ${uploadState.data?.submissionId}`,
                    uploadState.data?.fileUrl ? "Answer sheet uploaded successfully." : null,
                    uploadState.data?.score !== undefined
                      ? `AI score: ${uploadState.data.score}`
                      : null,
                    summarizeNotifications(uploadState.data?.notifications)
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
              />
            ) : null}
            {uploadState.status === "error" ? (
              <StatusBlock
                tone="negative"
                title="Submission failed"
                description={uploadState.error ?? ""}
              />
            ) : null}
            {answerError ? (
              <StatusBlock
                tone="negative"
                title="Answer entry required"
                description={answerError}
              />
            ) : null}
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="space-y-4">
            <SectionHeader eyebrow="History" title="Your submissions" />
            {submissions.length === 0 ? (
              <p className="text-sm text-ink-soft">No submissions stored yet.</p>
            ) : (
              <div className="space-y-3">
                {submissions.map((submission) => (
                  <button
                    key={submission.submissionId}
                    type="button"
                    className="w-full rounded-2xl border border-border bg-white/70 p-4 text-left transition hover:border-accent"
                    onClick={() => handleLoadEvaluation(submission.submissionId)}
                  >
                    <p className="text-sm font-semibold">Submission {submission.submissionId}</p>
                    <p className="text-xs text-ink-soft">Exam {submission.examId}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4">
            <SectionHeader
              eyebrow="Results"
              title="Approved evaluation"
              subtitle="Only approved reports will appear here."
            />
            {evaluationState.status === "loading" ? (
              <p className="text-sm text-ink-soft">Loading evaluation…</p>
            ) : null}
            {evaluationState.status === "error" ? (
              <StatusBlock
                tone="negative"
                title="Unable to load evaluation"
                description={evaluationState.error ?? ""}
              />
            ) : null}
            {evaluationState.data ? (
              evaluationState.data.status === "APPROVED" ? (
                <div className="space-y-4 text-sm">
                  <div className="rounded-2xl border border-border bg-white/70 p-4">
                    <p className="font-semibold">Final score</p>
                    <p className="text-2xl font-semibold text-accent">
                      {evaluationState.data.score ?? "—"} /{" "}
                      {evaluationState.data.result?.maxScore ?? "—"}
                    </p>
                    <p className="mt-2 text-ink-soft">
                      {evaluationState.data.result?.summary ?? ""}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-white/70 p-4">
                    <p className="font-semibold">AI evaluation</p>
                    <p className="mt-2 text-sm text-ink-soft">
                      Score: {evaluationState.data.aiScore ?? "â€”"} /{" "}
                      {evaluationState.data.aiResult?.maxScore ??
                        evaluationState.data.result?.maxScore ??
                        "â€”"}
                    </p>
                    <p className="mt-2 text-ink-soft">
                      {evaluationState.data.aiResult?.summary ??
                        "AI feedback will appear after processing."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-white/70 p-4">
                    <p className="font-semibold">Strengths</p>
                    <ul className="mt-2 list-disc pl-4 text-ink-soft">
                      {evaluationState.data.result?.topicAnalysis.strengths.map((item) => (
                        <li key={item}>{item}</li>
                      )) ?? <li>—</li>}
                    </ul>
                    <p className="mt-3 font-semibold">Weaknesses</p>
                    <ul className="mt-2 list-disc pl-4 text-ink-soft">
                      {evaluationState.data.result?.topicAnalysis.weaknesses.map((item) => (
                        <li key={item}>{item}</li>
                      )) ?? <li>—</li>}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-border bg-white/70 p-4">
                    <p className="font-semibold">Teacher corrections</p>
                    <p className="mt-2 text-ink-soft">
                      {evaluationState.data.teacherResult?.summary ??
                        (evaluationState.data.teacherScore !== null &&
                        evaluationState.data.teacherScore !== undefined
                          ? `Teacher approved final score: ${evaluationState.data.teacherScore}`
                          : "No teacher correction details available.")}
                    </p>
                  </div>
                </div>
              ) : (
                <StatusBlock
                  title="Report not approved"
                  description="Your evaluation is pending or rejected. Check back later."
                  tone="negative"
                />
              )
            ) : (
              <p className="text-sm text-ink-soft">Select a submission to view results.</p>
            )}
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-4">
            <SectionHeader
              eyebrow="Insights"
              title="Performance analytics"
              subtitle="Filter approved evaluations to view trends."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Start date"
                type="date"
                value={analyticsFilters.startDate}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, startDate: event.target.value })
                }
              />
              <Input
                label="End date"
                type="date"
                value={analyticsFilters.endDate}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, endDate: event.target.value })
                }
              />
              <Select
                label="Subject"
                value={analyticsFilters.subject}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, subject: event.target.value })
                }
              >
                <option value="">All subjects</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={subject.name}>
                    {subject.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Difficulty"
                value={analyticsFilters.difficulty}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, difficulty: event.target.value })
                }
              >
                <option value="">All levels</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </div>
            <Button onClick={handleLoadAnalytics} disabled={!token}>
              Refresh analytics
            </Button>
            {analyticsState.status === "loading" ? (
              <p className="text-sm text-ink-soft">Loading analytics...</p>
            ) : null}
            {analyticsState.status === "error" ? (
              <StatusBlock
                tone="negative"
                title="Analytics unavailable"
                description={analyticsState.error ?? ""}
              />
            ) : null}
            {analyticsState.data ? (
              <MetricGrid
                metrics={[
                  {
                    label: "Approved evaluations",
                    value: analyticsState.data.summary.totalEvaluations,
                    tone: "accent"
                  },
                  {
                    label: "Average score",
                    value: analyticsState.data.summary.averageScore
                  },
                  {
                    label: "Average %",
                    value: analyticsState.data.summary.averagePercentage,
                    tone: "cool"
                  }
                ]}
              />
            ) : null}
          </Card>

          <Card className="space-y-4">
            <SectionHeader eyebrow="Progress" title="Monthly trend" />
            {analyticsState.data ? (
              <TrendChart
                data={analyticsState.data.progress.map((point) => ({
                  label: point.period,
                  value: point.averagePercentage
                }))}
              />
            ) : (
              <p className="text-sm text-ink-soft">Load analytics to see progress.</p>
            )}
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="space-y-4">
            <SectionHeader eyebrow="Subjects" title="Subject-wise averages" />
            {analyticsState.data ? (
              <BarChart
                data={analyticsState.data.subjectPerformance.map((item, index) => ({
                  label: item.subject,
                  value: item.averagePercentage,
                  suffix: "%",
                  tone: index % 3 === 0 ? "accent" : index % 3 === 1 ? "cool" : "warm"
                }))}
                maxValue={100}
              />
            ) : (
              <p className="text-sm text-ink-soft">No subject data yet.</p>
            )}
          </Card>
          <Card className="space-y-4">
            <SectionHeader eyebrow="Topics" title="Strengths and weaknesses" />
            {analyticsState.data ? (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">Strengths</p>
                  <BarChart
                    data={analyticsState.data.topicInsights.strengths.map((item) => ({
                      label: item.topic,
                      value: item.count,
                      tone: "cool"
                    }))}
                  />
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">Weaknesses</p>
                  <BarChart
                    data={analyticsState.data.topicInsights.weaknesses.map((item) => ({
                      label: item.topic,
                      value: item.count,
                      tone: "warm"
                    }))}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">No topic insights yet.</p>
            )}
          </Card>
        </div>

        <Card className="space-y-4">
          <SectionHeader eyebrow="Report" title="Recent approved evaluations" />
          {analyticsState.data ? (
            <DataTable
              columns={["Exam", "Subject", "Difficulty", "Score", "%", "Evaluated at"]}
              rows={analyticsState.data.recentEvaluations.map((row) => [
                row.examId,
                row.subject,
                row.difficulty,
                row.score ?? "-",
                row.percentage ?? "-",
                new Date(row.evaluatedAt).toLocaleDateString()
              ])}
            />
          ) : (
            <p className="text-sm text-ink-soft">No evaluation history available.</p>
          )}
        </Card>
      </div>
    </RequireRole>
  );
}
