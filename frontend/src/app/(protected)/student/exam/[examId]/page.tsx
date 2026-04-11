"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  downloadExamPdf,
  getAssignedExamById,
  submitTypedAnswers
} from "@/lib/api";
import { saveSubmission, type StoredSubmission } from "@/lib/localSubmissions";
import type { ExamDetailResponse } from "@/types/exam";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

type PreviewSection = {
  sectionNumber?: string | number;
  title?: string;
  questionsToGenerate?: number;
  questionsToAttempt?: number;
  marksPerQuestion?: number | string;
  questionNumbers?: number[];
};

type PreviewQuestion = {
  id?: string;
  number?: string | number;
  prompt?: string;
  choices?: string[];
};

export default function StudentExamPreviewPage() {
  const params = useParams();
  const examId = typeof params?.examId === "string" ? params.examId : "";
  const { token } = useAuth();
  const [examState, setExamState] = useState<AsyncState<ExamDetailResponse>>({
    status: "idle",
    data: null
  });
  const [downloadState, setDownloadState] = useState<AsyncState<null>>({
    status: "idle",
    data: null
  });
  const [submitState, setSubmitState] = useState<
    AsyncState<{ submissionId: string; evaluationId: string; score?: number }>
  >({
    status: "idle",
    data: null
  });
  const [answerMap, setAnswerMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token || !examId) {
      return;
    }

    let isActive = true;

    const loadExam = async () => {
      setExamState({ status: "loading", data: null });
      try {
        const response = await getAssignedExamById(token, examId);
        if (!isActive) {
          return;
        }
        setExamState({ status: "success", data: response });
      } catch (error) {
        if (!isActive) {
          return;
        }
        setExamState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load exam"
        });
      }
    };

    void loadExam();

    return () => {
      isActive = false;
    };
  }, [token, examId]);

  const handleDownloadPdf = async () => {
    if (!token || !examId) {
      return;
    }

    setDownloadState({ status: "loading", data: null });
    try {
      const blob = await downloadExamPdf(token, examId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setDownloadState({ status: "success", data: null });
    } catch (error) {
      setDownloadState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to download PDF"
      });
    }
  };

  const handleSubmit = async () => {
    if (!token || !examId) {
      return;
    }

    const answers = Object.entries(answerMap)
      .map(([questionNumber, answer]) => ({
        questionNumber: Number(questionNumber),
        answer: answer.trim()
      }))
      .filter(
        (item) =>
          Number.isFinite(item.questionNumber) &&
          item.questionNumber > 0 &&
          item.answer.length > 0
      );

    if (answers.length === 0) {
      setSubmitState({
        status: "error",
        data: null,
        error: "Enter at least one answer before submitting."
      });
      return;
    }

    setSubmitState({ status: "loading", data: null });
    try {
      const response = await submitTypedAnswers(token, examId, answers);
      const stored: StoredSubmission = {
        submissionId: response.submissionId,
        evaluationId: response.evaluationId,
        examId,
        createdAt: new Date().toISOString()
      };
      saveSubmission(stored);
      setSubmitState({
        status: "success",
        data: {
          submissionId: response.submissionId,
          evaluationId: response.evaluationId,
          score: response.score
        }
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to submit answers"
      });
    }
  };

  const exam = examState.data;
  const sections = Array.isArray(exam?.sections) ? exam.sections : [];
  const questions = Array.isArray(exam?.questions) ? exam.questions : [];

  return (
    <RequireRole roles={["STUDENT"]}>
      <div className="mx-auto grid max-w-5xl gap-8">
        <SectionHeader
          eyebrow="Preview"
          title="Exam preview"
          subtitle="Review the paper and answer directly in the browser."
        />

        {examState.status === "loading" ? (
          <p className="text-sm text-ink-soft">Loading exam…</p>
        ) : null}
        {examState.status === "error" ? (
          <StatusBlock tone="negative" title="Unable to load exam" description={examState.error ?? ""} />
        ) : null}

        {exam ? (
          <>
            <Card className="space-y-3">
              <p className="text-sm font-semibold">{exam.metadata.subject ?? "Exam"}</p>
              <p className="text-xs text-ink-soft">
                Class {exam.metadata.classLevel ?? "-"} · {exam.metadata.difficulty ?? "-"} ·{" "}
                {exam.metadata.language ?? "-"}
              </p>
              <p className="text-xs text-ink-soft">
                Status: {exam.metadata.status ?? "PUBLISHED"}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={downloadState.status === "loading"}
                >
                  Download PDF
                </Button>
              </div>
              {downloadState.status === "error" ? (
                <StatusBlock tone="negative" title="Download failed" description={downloadState.error ?? ""} />
              ) : null}
            </Card>

            <Card className="space-y-4">
              <SectionHeader eyebrow="Sections" title="Section breakdown" />
              {sections.length === 0 ? (
                <p className="text-sm text-ink-soft">No sections found.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  {(sections as PreviewSection[]).map((section) => (
                    <div key={section.sectionNumber} className="rounded-2xl border border-border bg-white/70 p-4">
                      <p className="font-semibold">{section.title}</p>
                      <p className="text-xs text-ink-soft">
                        Questions: {section.questionsToGenerate ?? section.questionNumbers?.length ?? 0} ·
                        Attempt: {section.questionsToAttempt ?? section.questionNumbers?.length ?? 0} ·
                        Marks/Q: {section.marksPerQuestion ?? "-"}
                      </p>
                      <p className="text-xs text-ink-soft">
                        Question numbers: {(section.questionNumbers ?? []).join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="space-y-4">
              <SectionHeader eyebrow="Questions" title="Generated questions" />
              {questions.length === 0 ? (
                <p className="text-sm text-ink-soft">No questions available.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  {(questions as PreviewQuestion[]).map((question) => {
                    const questionNumber = Number(question.number);
                    const answerKey = Number.isFinite(questionNumber) ? String(questionNumber) : "";
                    const value = answerMap[answerKey] ?? "";

                    return (
                      <div
                        key={question.id ?? question.number}
                        className="rounded-2xl border border-border bg-white/70 p-4"
                      >
                        <p className="font-semibold">
                          Q{question.number}. {question.prompt}
                        </p>
                        {Array.isArray(question.choices) && question.choices.length > 0 ? (
                          <div className="mt-3 grid gap-2">
                            {question.choices.map((choice, idx) => (
                              <label
                                key={`${question.id ?? question.number}-${idx}`}
                                className="flex items-center gap-2 text-sm text-foreground"
                              >
                                <input
                                  type="radio"
                                  name={`question-${answerKey}`}
                                  checked={value === choice}
                                  onChange={() =>
                                    setAnswerMap((current) => ({
                                      ...current,
                                      [answerKey]: choice
                                    }))
                                  }
                                />
                                <span>{choice}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <textarea
                            className="mt-3 min-h-[120px] w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none transition focus:border-accent"
                            placeholder="Write your answer here"
                            value={value}
                            onChange={(event) =>
                              setAnswerMap((current) => ({
                                ...current,
                                [answerKey]: event.target.value
                              }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="space-y-4">
              <SectionHeader eyebrow="Submit" title="Send your attempt" />
              <Button
                onClick={handleSubmit}
                disabled={submitState.status === "loading"}
              >
                {submitState.status === "loading" ? "Submitting…" : "Submit answers"}
              </Button>
              {submitState.status === "success" ? (
                <StatusBlock
                  tone="positive"
                  title="Submission received"
                  description={[
                    `Submission ID: ${submitState.data?.submissionId}`,
                    submitState.data?.score !== undefined
                      ? `AI score: ${submitState.data.score}`
                      : null
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ) : null}
              {submitState.status === "error" ? (
                <StatusBlock tone="negative" title="Submission failed" description={submitState.error ?? ""} />
              ) : null}
            </Card>
          </>
        ) : null}
      </div>
    </RequireRole>
  );
}
