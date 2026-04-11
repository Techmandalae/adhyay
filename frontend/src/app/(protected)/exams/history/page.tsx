"use client";

import { useEffect, useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageLocalNav } from "@/components/common/PageLocalNav";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageFade } from "@/components/ui/PageFade";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
import { getPublishableClassOptions, normalizeTeacherCatalog } from "@/lib/catalog";
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
  const [publishSelections, setPublishSelections] = useState<Record<string, string[]>>({});
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
    classSectionIds?: string[]
  ) => {
    if (!token) {
      return;
    }

    setActionState({ status: "loading" });
    try {
      if (status === "PUBLISHED") {
        if (!classSectionIds || classSectionIds.length === 0) {
          throw new Error("Please select at least one class section before publishing.");
        }
        await publishExam(token, examId, classSectionIds);
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
            <PageLocalNav
              items={[
                { label: "New exam", href: "/exams/new" },
                { label: "Archived exams", href: "/teacher/archived-exams" }
              ]}
            />
            <Button variant="outline" onClick={() => void refreshExams()} disabled={!token}>
              Refresh history
            </Button>
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
              const publishableClasses = getPublishableClassOptions(classOptions, {
                classId: exam.classId ?? "",
                sectionId: exam.sectionId ?? ""
              });
              const publishSectionIds =
                publishSelections[exam.id] ?? exam.assignedSectionIds ?? [];

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
                      <div className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Publish to class sections</span>
                        <div className="grid gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
                          {publishableClasses.length > 0 ? (
                            publishableClasses.map((item) => {
                              const checked = publishSectionIds.includes(item.id);
                              return (
                                <label key={item.id} className="flex items-center gap-2 text-sm text-foreground">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) =>
                                      setPublishSelections((current) => {
                                        const nextValues = new Set(current[exam.id] ?? exam.assignedSectionIds ?? []);
                                        if (event.target.checked) {
                                          nextValues.add(item.id);
                                        } else {
                                          nextValues.delete(item.id);
                                        }
                                        return {
                                          ...current,
                                          [exam.id]: Array.from(nextValues)
                                        };
                                      })
                                    }
                                  />
                                  <span>{item.label}</span>
                                </label>
                              );
                            })
                          ) : (
                            <p className="text-xs text-ink-soft">No sections available for this class.</p>
                          )}
                        </div>
                      </div>
                      <Button
                        disabled={
                          actionState.status === "loading" ||
                          publishSectionIds.length === 0 ||
                          !user?.canPublish
                        }
                        onClick={() => void handleStatusUpdate(exam.id, "PUBLISHED", publishSectionIds)}
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
