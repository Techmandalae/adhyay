"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  downloadExamPdf,
  downloadExamDocx,
  getAcademicClasses,
  getExamById,
  publishExam,
  updateAnswerKeyRelease
} from "@/lib/api";
import type { ExamDetailResponse } from "@/types/exam";
import type { AcademicClass } from "@/types/academic";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

export default function TeacherExamPreviewPage() {
  const params = useParams();
  const examId = typeof params?.id === "string" ? params.id : "";
  const { token, user } = useAuth();
  const [examState, setExamState] = useState<AsyncState<ExamDetailResponse>>({
    status: "idle",
    data: null
  });
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [publishState, setPublishState] = useState<AsyncState<null>>({
    status: "idle",
    data: null
  });
  const [downloadState, setDownloadState] = useState<AsyncState<null>>({
    status: "idle",
    data: null
  });
  const [answerKeyState, setAnswerKeyState] = useState<AsyncState<null>>({
    status: "idle",
    data: null
  });
  const [answerKeyReleased, setAnswerKeyReleased] = useState(false);

  useEffect(() => {
    if (!token || !examId) return;
    let isActive = true;
    const loadExam = async () => {
      setExamState({ status: "loading", data: null });
      try {
        const response = await getExamById(token, examId);
        if (!isActive) return;
        setExamState({ status: "success", data: response });
        setAnswerKeyReleased(Boolean(response.metadata?.answerKeyReleased));
      } catch (error) {
        if (!isActive) return;
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

  useEffect(() => {
    if (!token) return;
    let isActive = true;
    const loadClasses = async () => {
      try {
        const response = await getAcademicClasses(token);
        if (!isActive) return;
        setClasses(response.items);
      } catch (_error) {
        if (!isActive) return;
        setClasses([]);
      }
    };
    void loadClasses();
    return () => {
      isActive = false;
    };
  }, [token]);

  const handlePublish = async () => {
    if (!token || !selectedClassId || !examId) return;
    setPublishState({ status: "loading", data: null });
    try {
      await publishExam(token, examId, selectedClassId);
      setPublishState({ status: "success", data: null });
    } catch (error) {
      setPublishState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to publish exam"
      });
    }
  };

  const handleDownloadPdf = async () => {
    if (!token || !examId) return;
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

  const handleDownloadDocx = async () => {
    if (!token || !examId) return;
    setDownloadState({ status: "loading", data: null });
    try {
      const blob = await downloadExamDocx(token, examId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setDownloadState({ status: "success", data: null });
    } catch (error) {
      setDownloadState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to download Word file"
      });
    }
  };

  const handleAnswerKeyToggle = async () => {
    if (!token || !examId) return;
    setAnswerKeyState({ status: "loading", data: null });
    try {
      const response = await updateAnswerKeyRelease(token, examId, !answerKeyReleased);
      setAnswerKeyReleased(response.answerKeyReleased);
      setAnswerKeyState({ status: "success", data: null });
    } catch (error) {
      setAnswerKeyState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to update answer key"
      });
    }
  };

  const exam = examState.data;
  const sections = Array.isArray(exam?.sections) ? exam?.sections : [];
  const questions = Array.isArray(exam?.questions) ? exam?.questions : [];

  return (
    <RequireRole roles={["TEACHER"]}>
      <div className="mx-auto grid max-w-5xl gap-8">
        <SectionHeader
          eyebrow="Preview"
          title="Exam preview"
          subtitle="Review sections and publish when ready."
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
                Class {exam.metadata.classLevel ?? "—"} · {exam.metadata.difficulty ?? "—"} ·{" "}
                {exam.metadata.language ?? "—"}
              </p>
              <p className="text-xs text-ink-soft">
                Status: {exam.metadata.status ?? "DRAFT"}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={downloadState.status === "loading"}
                >
                  Download PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadDocx}
                  disabled={downloadState.status === "loading"}
                >
                  Download Word
                </Button>
              </div>
              {downloadState.status === "error" ? (
                <StatusBlock
                  tone="negative"
                  title="Download failed"
                  description={downloadState.error ?? ""}
                />
              ) : null}
            </Card>

            <Card className="space-y-4">
              <SectionHeader eyebrow="Sections" title="Section breakdown" />
              {sections.length === 0 ? (
                <p className="text-sm text-ink-soft">No sections found.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  {sections.map((section: any) => (
                    <div key={section.sectionNumber} className="rounded-2xl border border-border bg-white/70 p-4">
                      <p className="font-semibold">{section.title}</p>
                      <p className="text-xs text-ink-soft">
                        Questions: {section.questionsToGenerate ?? section.questionNumbers?.length ?? 0} ·
                        Attempt: {section.questionsToAttempt ?? section.questionNumbers?.length ?? 0} ·
                        Marks/Q: {section.marksPerQuestion ?? "—"}
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
                  {questions.map((question: any) => (
                    <div key={question.id ?? question.number} className="rounded-2xl border border-border bg-white/70 p-4">
                      <p className="font-semibold">
                        Q{question.number}. {question.prompt}
                      </p>
                      {Array.isArray(question.choices) ? (
                        <ul className="mt-2 list-disc pl-5 text-xs text-ink-soft">
                          {question.choices.map((choice: string, idx: number) => (
                            <li key={`${question.id}-${idx}`}>{choice}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="space-y-4">
              <SectionHeader eyebrow="Publish" title="Make exam available" />
              <Select
                label="Assign to class"
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
              >
                <option value="">Select class</option>
                {Array.from(
                  new Map(classes.map((klass) => [klass.classId, klass])).values()
                ).map((klass) => (
                  <option key={klass.classId} value={klass.classId}>
                    {klass.className}
                  </option>
                ))}
              </Select>
              <Button
                onClick={handlePublish}
                disabled={!selectedClassId || publishState.status === "loading" || user?.canPublish === false}
              >
                Publish exam
              </Button>
              {user?.canPublish === false ? (
                <StatusBlock
                  tone="negative"
                  title="Publishing disabled"
                  description="Independent teachers can preview and download exams, but they cannot publish them to students."
                />
              ) : null}
              {publishState.status === "success" ? (
                <StatusBlock tone="positive" title="Exam published" description="Students can now access the exam." />
              ) : null}
              {publishState.status === "error" ? (
                <StatusBlock tone="negative" title="Publish failed" description={publishState.error ?? ""} />
              ) : null}
            </Card>

            <Card className="space-y-4">
              <SectionHeader
                eyebrow="Answer key"
                title="Control student access"
                subtitle="Release the answer key only after students complete the exam."
              />
              <p className="text-xs text-ink-soft">
                Current status: {answerKeyReleased ? "Released to students" : "Hidden from students"}
              </p>
              <Button
                variant={answerKeyReleased ? "outline" : "primary"}
                onClick={handleAnswerKeyToggle}
                disabled={answerKeyState.status === "loading"}
              >
                {answerKeyReleased ? "Hide answer key" : "Release answer key"}
              </Button>
              {answerKeyState.status === "error" ? (
                <StatusBlock tone="negative" title="Update failed" description={answerKeyState.error ?? ""} />
              ) : null}
            </Card>
          </>
        ) : null}
      </div>
    </RequireRole>
  );
}
