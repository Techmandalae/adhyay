"use client";

import { useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { Button } from "@/components/ui/Button";
import { getEvaluationBreakdown } from "@/lib/evaluation";
import { getEvaluation } from "@/lib/api";
import { loadSubmissions, type StoredSubmission } from "@/lib/localSubmissions";
import type { EvaluationDetail } from "@/types/evaluation";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

export default function StudentResultsPage() {
  const { token } = useAuth();
  const [submissions, setSubmissions] = useState<StoredSubmission[]>(() => loadSubmissions());
  const [detailState, setDetailState] = useState<AsyncState<EvaluationDetail>>({
    status: "idle",
    data: null
  });

  const loadResult = async (submissionId: string) => {
    if (!token) return;
    setDetailState({ status: "loading", data: null });
    try {
      const detail = await getEvaluation(token, submissionId);
      setDetailState({ status: "success", data: detail });
    } catch (error) {
      setDetailState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load result"
      });
    }
  };

  const feedbackBreakdown = getEvaluationBreakdown(
    detailState.data?.teacherResult ?? detailState.data?.aiResult ?? detailState.data?.result
  );

  return (
    <RequireRole roles={["STUDENT"]}>
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="space-y-4">
          <SectionHeader
            eyebrow="Results"
            title="Your submissions"
            subtitle="Open an approved evaluation to see scores and feedback."
          />
          <Button variant="outline" onClick={() => setSubmissions(loadSubmissions())}>
            Refresh submissions
          </Button>
          {submissions.length ? (
            <div className="space-y-3">
              {submissions.map((submission) => (
                <button
                  key={submission.submissionId}
                  type="button"
                  className="w-full rounded-2xl border border-border bg-white/70 p-4 text-left transition hover:border-accent"
                  onClick={() => void loadResult(submission.submissionId)}
                >
                  <p className="text-sm font-semibold">Submission {submission.submissionId}</p>
                  <p className="text-xs text-ink-soft">Exam {submission.examId}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">No submissions found.</p>
          )}
        </Card>

        <Card className="space-y-4">
          <SectionHeader
            eyebrow="Approved result"
            title="Evaluation result"
            subtitle="AI feedback becomes visible here after teacher approval."
          />
          {detailState.status === "loading" ? (
            <p className="text-sm text-ink-soft">Loading result...</p>
          ) : null}
          {detailState.status === "error" ? (
            <StatusBlock tone="negative" title="Result unavailable" description={detailState.error ?? ""} />
          ) : null}
          {detailState.data ? (
            detailState.data.status === "APPROVED" ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                  <p className="font-semibold">Final score</p>
                  <p className="mt-2 text-2xl font-semibold text-accent">
                    {detailState.data.score ?? "-"} / {detailState.data.result?.maxScore ?? "-"}
                  </p>
                  <p className="mt-2 text-ink-soft">
                    {detailState.data.result?.summary ?? "No summary available."}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                  <p className="font-semibold">AI score</p>
                  <p className="mt-2 text-2xl font-semibold text-accent">
                    {detailState.data.aiScore ?? "-"} /{" "}
                    {detailState.data.aiResult?.maxScore ?? detailState.data.result?.maxScore ?? "-"}
                  </p>
                  <p className="mt-2 text-ink-soft">
                    {detailState.data.aiResult?.summary ?? "AI evaluation summary is not available."}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                  <p className="font-semibold">AI feedback</p>
                  <div className="mt-3 space-y-3">
                    {feedbackBreakdown.map((item) => (
                      <div key={item.questionNumber} className="rounded-2xl border border-border p-3">
                        <p className="font-medium">Q{item.questionNumber}</p>
                        <p className="mt-1 text-xs text-foreground">{item.question}</p>
                        <p className="mt-1 text-xs text-ink-soft">
                          Your answer: {item.studentAnswer}
                        </p>
                        <p className="mt-1 text-xs text-ink-soft">
                          Expected answer: {item.correctAnswer}
                        </p>
                        <p className="text-xs text-ink-soft">
                          Score: {item.score} / {item.maxScore}
                        </p>
                        <p className="mt-1 text-xs text-ink-soft">{item.reason}</p>
                      </div>
                    ))}
                    {feedbackBreakdown.length === 0 ? (
                      <p className="text-xs text-ink-soft">No question feedback available.</p>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                  <p className="font-semibold">Teacher comments</p>
                  <p className="mt-2 text-ink-soft">
                    {detailState.data.teacherResult?.summary ??
                      (detailState.data.teacherScore !== null &&
                      detailState.data.teacherScore !== undefined
                        ? `Teacher approved final score: ${detailState.data.teacherScore}`
                        : detailState.data.rejectionReason ?? "No teacher comments available.")}
                  </p>
                </div>
                {detailState.data.extractedText ? (
                  <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                    <p className="font-semibold">Extracted answer text</p>
                    <p className="mt-2 whitespace-pre-wrap text-ink-soft">
                      {detailState.data.extractedText}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <StatusBlock
                tone="negative"
                title="Awaiting approval"
                description="Your result will appear here once the teacher approves the AI evaluation."
              />
            )
          ) : (
            <p className="text-sm text-ink-soft">Select a submission to view the result.</p>
          )}
        </Card>
      </div>
    </RequireRole>
  );
}
