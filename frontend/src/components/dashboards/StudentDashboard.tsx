"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { getAssignedExams, getStudentAnalytics } from "@/lib/api";
import { loadSubmissions } from "@/lib/localSubmissions";

type DashboardState = {
  assignedExams: number;
  submissionStatus: number;
  scores: number;
};

export function StudentDashboard() {
  const { token } = useAuth();
  const [state, setState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    data: DashboardState | null;
    error?: string;
  }>({
    status: "idle",
    data: null
  });

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;

    const loadDashboard = async () => {
      setState({ status: "loading", data: null });
      try {
        const [assignedResponse, analyticsResponse] = await Promise.all([
          getAssignedExams(token),
          getStudentAnalytics(token, {})
        ]);

        if (!isActive) {
          return;
        }

        setState({
          status: "success",
          data: {
            assignedExams: assignedResponse.items.length,
            submissionStatus: loadSubmissions().length,
            scores: Math.round(analyticsResponse.summary.averagePercentage)
          }
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load student dashboard."
        });
      }
    };

    void loadDashboard();

    return () => {
      isActive = false;
    };
  }, [token]);

  return (
    <div className="mx-auto grid max-w-6xl gap-8">
      <SectionHeader
        eyebrow="Student dashboard"
        title="Track assignments, submissions, and scores"
        subtitle="Assigned exams, submission progress, and reports are now separated into clearer pages."
      />
      <div className="flex flex-wrap gap-3">
        <Link href="/student/results">
          <Button>Results</Button>
        </Link>
        <Link href="/reports">
          <Button variant="outline">Reports</Button>
        </Link>
        <Link href="/analytics/trends">
          <Button variant="ghost">Performance trends</Button>
        </Link>
      </div>

      {state.status === "error" ? (
        <StatusBlock tone="negative" title="Dashboard unavailable" description={state.error ?? ""} />
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Assigned exams</p>
          <p className="mt-3 text-3xl font-semibold text-accent">
            {state.data?.assignedExams ?? "—"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">Exams currently available for submission.</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Submission status</p>
          <p className="mt-3 text-3xl font-semibold text-accent-cool">
            {state.data?.submissionStatus ?? "—"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">Tracked submissions stored in this browser.</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Scores</p>
          <p className="mt-3 text-3xl font-semibold text-accent-warm">
            {state.data?.scores ?? "—"}%
          </p>
          <p className="mt-2 text-sm text-ink-soft">Average approved score percentage.</p>
        </Card>
      </div>

      <Card className="grid gap-4 md:grid-cols-3">
        <Link href="/student" className="rounded-[var(--radius)] border border-border bg-white/70 p-4 transition hover:border-accent">
          <p className="text-sm font-semibold text-foreground">Workspace</p>
          <p className="mt-1 text-sm text-ink-soft">Open the student submission workspace.</p>
        </Link>
        <Link href="/analytics/class" className="rounded-[var(--radius)] border border-border bg-white/70 p-4 transition hover:border-accent">
          <p className="text-sm font-semibold text-foreground">Analytics</p>
          <p className="mt-1 text-sm text-ink-soft">See subject and difficulty-level performance.</p>
        </Link>
        <Link href="/reports" className="rounded-[var(--radius)] border border-border bg-white/70 p-4 transition hover:border-accent">
          <p className="text-sm font-semibold text-foreground">Animated report</p>
          <p className="mt-1 text-sm text-ink-soft">View a more polished summary of your recent results.</p>
        </Link>
      </Card>
    </div>
  );
}
