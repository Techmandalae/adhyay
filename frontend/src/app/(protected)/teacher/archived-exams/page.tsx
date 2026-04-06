"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { downloadExamDocx, downloadExamPdf, getArchivedExams } from "@/lib/api";
import type { ExamSummary } from "@/types/exam";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

export default function ArchivedExamsPage() {
  const { token } = useAuth();
  const [state, setState] = useState<AsyncState<ExamSummary[]>>({
    status: "idle",
    data: null
  });

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const loadArchivedExams = async () => {
    if (!token) return;

    setState({ status: "loading", data: null });
    try {
      const response = await getArchivedExams(token);
      setState({ status: "success", data: response.items });
    } catch (error) {
      setState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load archived exams"
      });
    }
  };

  useEffect(() => {
    if (!token) return;

    let isActive = true;

    const preloadArchivedExams = async () => {
      try {
        const response = await getArchivedExams(token);
        if (!isActive) return;
        setState({ status: "success", data: response.items });
      } catch (error) {
        if (!isActive) return;
        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load archived exams"
        });
      }
    };

    void preloadArchivedExams();

    return () => {
      isActive = false;
    };
  }, [token]);

  const handleDownloadPdf = async (examId: string) => {
    if (!token) return;
    const blob = await downloadExamPdf(token, examId);
    triggerDownload(blob, `exam-${examId}.pdf`);
  };

  const handleDownloadDocx = async (examId: string) => {
    if (!token) return;
    const blob = await downloadExamDocx(token, examId);
    triggerDownload(blob, `exam-${examId}.docx`);
  };

  return (
    <RequireRole roles={["TEACHER"]}>
      <div className="mx-auto grid max-w-5xl gap-6">
        <SectionHeader
          eyebrow="Archived"
          title="Archived exams"
          subtitle="Review older papers and export them again when needed."
        />

        <div className="flex flex-wrap gap-3">
          <Link href="/exams/history">
            <Button variant="outline">Back to exam history</Button>
          </Link>
          <Button variant="outline" onClick={() => void loadArchivedExams()} disabled={!token}>
            Refresh archived exams
          </Button>
        </div>

        {state.status === "loading" ? (
          <Card>
            <p className="text-sm text-ink-soft">Loading archived exams...</p>
          </Card>
        ) : null}

        {state.status === "error" ? (
          <StatusBlock
            tone="negative"
            title="Unable to load archived exams"
            description={state.error ?? ""}
          />
        ) : null}

        {state.status === "success" && state.data?.length === 0 ? (
          <StatusBlock
            title="No archived exams"
            description="Archived exams will appear here after you archive a published paper."
          />
        ) : null}

        {state.data?.length ? (
          <div className="grid gap-4">
            {state.data.map((exam) => (
              <Card key={exam.id} className="space-y-3">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">
                    {exam.subject ?? "Untitled exam"}
                  </p>
                  <p className="text-sm text-ink-soft">
                    Class {exam.classLevel ?? "-"} | {exam.difficulty ?? "-"} | Archived on{" "}
                    {new Date(exam.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-ink-soft">ID: {exam.id}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => void handleDownloadPdf(exam.id)}>
                    Download PDF
                  </Button>
                  <Button variant="outline" onClick={() => void handleDownloadDocx(exam.id)}>
                    Download Word
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </RequireRole>
  );
}
