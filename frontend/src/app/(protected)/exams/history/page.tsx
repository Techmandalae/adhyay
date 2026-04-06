"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageFade } from "@/components/ui/PageFade";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  archiveExam,
  downloadAnswerKeyPdf,
  downloadExamDocx,
  downloadExamPdf,
  getExams,
  getTeacherCatalog,
  publishExam
} from "@/lib/api";
import { normalizeTeacherCatalog } from "@/lib/catalog";
import type { AcademicClass } from "@/types/academic";
import type { ExamSummary } from "@/types/exam";

export default function ExamHistoryPage() {
  const { token, user } = useAuth();
  const [examState, setExamState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    data: ExamSummary[] | null;
    error?: string;
  }>({
    status: "idle",
    data: null
  });
  const [classOptions, setClassOptions] = useState<AcademicClass[]>([]);
  const [publishSelections, setPublishSelections] = useState<Record<string, string>>({});
  const [actionState, setActionState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({
    status: "idle"
  });

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;

    const loadPage = async () => {
      setExamState({ status: "loading", data: null });
      try {
        const [examResponse, catalogResponse] = await Promise.all([
          getExams(token),
          getTeacherCatalog(token)
        ]);

        if (!isActive) {
          return;
        }

        setExamState({ status: "success", data: examResponse.items });
        setClassOptions(normalizeTeacherCatalog(catalogResponse).classOptions);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setExamState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load exam history."
        });
      }
    };

    void loadPage();

    return () => {
      isActive = false;
    };
  }, [token]);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const refreshExams = async () => {
    if (!token) return;
    setExamState({ status: "loading", data: examState.data });
    try {
      const response = await getExams(token);
      setExamState({ status: "success", data: response.items });
    } catch (error) {
      setExamState({
        status: "error",
        data: examState.data,
        error: error instanceof Error ? error.message : "Failed to refresh exam history."
      });
    }
  };

  const handleStatusUpdate = async (
    examId: string,
    status: "PUBLISHED" | "ARCHIVED",
    assignedClassId?: string
  ) => {
    if (!token) {
      return;
    }

    setActionState({ status: "loading" });
    try {
      if (status === "PUBLISHED") {
        if (!assignedClassId) {
          throw new Error("Please select a class before publishing.");
        }
        await publishExam(token, examId, assignedClassId);
      } else {
        await archiveExam(token, examId);
      }

      setActionState({
        status: "success",
        message: status === "PUBLISHED" ? "Exam published successfully." : "Exam archived successfully."
      });
      await refreshExams();
    } catch (error) {
      setActionState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to update exam status."
      });
    }
  };

  return (
    <RequireRole roles={["TEACHER"]}>
      <PageFade>
        <div className="mx-auto grid max-w-6xl gap-8">
          <SectionHeader
            eyebrow="Exam history"
            title="Recent generated exams"
            subtitle="Publishing and archiving now live on a dedicated page, separate from generation."
          />

          <div className="flex flex-wrap gap-3">
            <Link href="/exams/new">
              <Button>New Exam</Button>
            </Link>
            <Button variant="outline" onClick={() => void refreshExams()} disabled={!token}>
              Refresh history
            </Button>
            <Link href="/teacher/archived-exams">
              <Button variant="ghost">Archived exams</Button>
            </Link>
          </div>

          {actionState.status === "error" ? (
            <StatusBlock tone="negative" title="Action failed" description={actionState.message ?? ""} />
          ) : null}
          {actionState.status === "success" ? (
            <StatusBlock title="Status updated" description={actionState.message ?? ""} tone="positive" />
          ) : null}
          {examState.status === "error" ? (
            <StatusBlock tone="negative" title="Unable to load exams" description={examState.error ?? ""} />
          ) : null}

          <div className="grid gap-4">
            {(examState.data ?? []).map((exam) => {
              const classOption =
                classOptions.find(
                  (item) =>
                    item.classId === exam.classId && item.sectionId === (exam.sectionId ?? "")
                ) ?? classOptions.find((item) => item.classId === exam.classId);
              const publishClassId =
                publishSelections[exam.id] ?? exam.assignedClassId ?? exam.classId ?? "";

              return (
                <Card key={exam.id} className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-foreground">
                      {exam.subject ?? "Untitled exam"}
                    </p>
                    <p className="text-sm text-ink-soft">
                      Class {exam.classLevel ?? "-"} | {exam.difficulty ?? "-"} |{" "}
                      {new Date(exam.createdAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-ink-soft">Status: {exam.status ?? "DRAFT"}</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        if (!token) return;
                        const blob = await downloadExamPdf(token, exam.id);
                        triggerDownload(blob, `exam-${exam.id}.pdf`);
                      }}
                    >
                      Download PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        if (!token) return;
                        const blob = await downloadExamDocx(token, exam.id);
                        triggerDownload(blob, `exam-${exam.id}.docx`);
                      }}
                    >
                      Download Word
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!token || !exam.examPaperId}
                      onClick={async () => {
                        if (!token || !exam.examPaperId) return;
                        const blob = await downloadAnswerKeyPdf(token, exam.examPaperId);
                        triggerDownload(blob, `answer-key-${exam.examPaperId}.pdf`);
                      }}
                    >
                      Download Answer Key
                    </Button>
                  </div>

                  {exam.status === "DRAFT" ? (
                    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                      <Select
                        label="Publish to class"
                        value={publishClassId}
                        onChange={(event) =>
                          setPublishSelections((current) => ({
                            ...current,
                            [exam.id]: event.target.value
                          }))
                        }
                      >
                        <option value="">Select class</option>
                        {classOption ? (
                          <option value={classOption.classId}>{classOption.label}</option>
                        ) : null}
                      </Select>
                      <Button
                        disabled={actionState.status === "loading" || !publishClassId || !user?.canPublish}
                        onClick={() => void handleStatusUpdate(exam.id, "PUBLISHED", publishClassId)}
                      >
                        Publish exam
                      </Button>
                    </div>
                  ) : null}

                  {exam.status === "PUBLISHED" ? (
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={() => void handleStatusUpdate(exam.id, "ARCHIVED")}
                        disabled={actionState.status === "loading"}
                      >
                        Archive exam
                      </Button>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </div>
      </PageFade>
    </RequireRole>
  );
}
