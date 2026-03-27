"use client";

import { useEffect, useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  approveSubmission,
  getEvaluation,
  getPendingEvaluations
} from "@/lib/api";
import type { EvaluationDetail, EvaluationSummary } from "@/types/evaluation";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

export default function TeacherEvaluationsPage() {
  const { token } = useAuth();
  const [pendingState, setPendingState] = useState<AsyncState<EvaluationSummary[]>>({
    status: "idle",
    data: null
  });
  const [detailState, setDetailState] = useState<AsyncState<EvaluationDetail>>({
    status: "idle",
    data: null
  });
  const [teacherScore, setTeacherScore] = useState("");
  const [actionState, setActionState] = useState<AsyncState<{ status: string }>>({
    status: "idle",
    data: null
  });

  const loadPending = async () => {
    if (!token) return;
    setPendingState({ status: "loading", data: null });
    try {
      const response = await getPendingEvaluations(token);
      setPendingState({ status: "success", data: response.items });
    } catch (error) {
      setPendingState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load evaluations"
      });
    }
  };

  useEffect(() => {
    void loadPending();
  }, [token]);

  const loadDetail = async (submissionId: string) => {
    if (!token) return;
    setDetailState({ status: "loading", data: null });
    try {
      const detail = await getEvaluation(token, submissionId);
      setTeacherScore(detail.teacherScore !== null && detail.teacherScore !== undefined
        ? String(detail.teacherScore)
        : detail.score !== null
          ? String(detail.score)
          : "");
      setDetailState({ status: "success", data: detail });
    } catch (error) {
      setDetailState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load evaluation detail"
      });
    }
  };

  const handleApprove = async () => {
    if (!token || !detailState.data) return;
    setActionState({ status: "loading", data: null });
    try {
      const response = await approveSubmission(token, {
        submissionId: detailState.data.submissionId,
        ...(teacherScore.trim() ? { teacherScore: Number(teacherScore) } : {})
      });
      setActionState({ status: "success", data: { status: response.status } });
      await loadDetail(detailState.data.submissionId);
      await loadPending();
    } catch (error) {
      setActionState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to approve submission"
      });
    }
  };

  return (
    <RequireRole roles={["TEACHER"]}>
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <SectionHeader
            eyebrow="AI evaluation"
            title="Pending submissions"
            subtitle="Open a submission to review AI feedback before approving it."
          />
          <Button variant="outline" onClick={loadPending} disabled={!token}>
            Refresh queue
          </Button>
          {pendingState.status === "error" ? (
            <StatusBlock tone="negative" title="Queue failed" description={pendingState.error ?? ""} />
          ) : null}
          {pendingState.data?.length ? (
            <div className="space-y-3">
              {pendingState.data.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full rounded-2xl border border-border bg-white/70 p-4 text-left transition hover:border-accent"
                  onClick={() => void loadDetail(item.submissionId)}
                >
                  <p className="text-sm font-semibold">
                    {item.studentName ?? `Student ${item.studentId}`}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {item.examName ?? `Exam ${item.examId}`} | Submission {item.submissionId}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">AI score: {item.aiScore ?? "-"}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">No pending evaluations.</p>
          )}
        </Card>

        <Card className="space-y-4">
          <SectionHeader
            eyebrow="Teacher review"
            title="AI feedback review panel"
            subtitle="Inspect the AI score, adjust marks if needed, then approve."
          />
          {detailState.status === "loading" ? (
            <p className="text-sm text-ink-soft">Loading evaluation...</p>
          ) : null}
          {detailState.status === "error" ? (
            <StatusBlock tone="negative" title="Load failed" description={detailState.error ?? ""} />
          ) : null}
          {detailState.data ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                <p className="font-semibold">AI score</p>
                <p className="mt-2 text-2xl font-semibold text-accent">
                  {detailState.data.aiScore ?? detailState.data.score ?? "-"} /{" "}
                  {detailState.data.aiResult?.maxScore ?? detailState.data.result?.maxScore ?? "-"}
                </p>
                <p className="mt-2 text-ink-soft">
                  {detailState.data.aiResult?.summary ??
                    detailState.data.result?.summary ??
                    "No summary available."}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                <p className="font-semibold">Per-question feedback</p>
                <div className="mt-3 space-y-3">
                  {(detailState.data.aiResult ?? detailState.data.result)?.perQuestion.map((item) => (
                    <div key={item.questionNumber} className="rounded-2xl border border-border p-3">
                      <p className="font-medium">Q{item.questionNumber}</p>
                      <p className="text-xs text-ink-soft">
                        Marks: {item.score} / {item.maxScore}
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">{item.remarks}</p>
                    </div>
                  )) ?? <p className="text-xs text-ink-soft">No feedback available.</p>}
                </div>
              </div>
              {detailState.data.extractedText ? (
                <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                  <p className="font-semibold">Extracted text</p>
                  <p className="mt-2 whitespace-pre-wrap text-ink-soft">
                    {detailState.data.extractedText}
                  </p>
                </div>
              ) : null}
              <Input
                label="Teacher score override"
                type="number"
                value={teacherScore}
                onChange={(event) => setTeacherScore(event.target.value)}
              />
              <Button onClick={handleApprove} disabled={!token || actionState.status === "loading"}>
                {actionState.status === "loading" ? "Approving..." : "Approve evaluation"}
              </Button>
              {actionState.status === "success" ? (
                <StatusBlock tone="positive" title="Evaluation approved" description="Student results are now available." />
              ) : null}
              {actionState.status === "error" ? (
                <StatusBlock tone="negative" title="Approval failed" description={actionState.error ?? ""} />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Select a pending submission to review it.</p>
          )}
        </Card>
      </div>
    </RequireRole>
  );
}
