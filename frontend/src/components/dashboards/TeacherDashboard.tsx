"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import { getExams, getPendingEvaluations, getTeacherAnalytics } from "@/lib/api";

type DashboardState = {
  examsGenerated: number;
  submissionsCount: number;
  pendingReviews: number;
};

export function TeacherDashboard() {
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
        const [examResponse, pendingResponse, analyticsResponse] = await Promise.all([
          getExams(token, 1, 1),
          getPendingEvaluations(token),
          getTeacherAnalytics(token, {})
        ]);

        if (!isActive) {
          return;
        }

        setState({
          status: "success",
          data: {
            examsGenerated: examResponse.total,
            submissionsCount: analyticsResponse.summary.totalEvaluations,
            pendingReviews: pendingResponse.items.length
          }
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load teacher dashboard."
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
        eyebrow="Teacher dashboard"
        title="Generate exams and track review workload"
        subtitle="The new dashboard keeps generation, evaluation, analytics, and reporting on dedicated pages."
      />

      <div className="flex flex-wrap gap-3">
        <Link href="/exams/new">
          <Button>New Exam</Button>
        </Link>
        <Link href="/exams/history">
          <Button variant="outline">Exam History</Button>
        </Link>
        <Link href="/evaluations/pending">
          <Button variant="outline">Pending Reviews</Button>
        </Link>
        <Link href="/reports">
          <Button variant="ghost">Reports</Button>
        </Link>
      </div>

      {state.status === "error" ? (
        <StatusBlock tone="negative" title="Dashboard unavailable" description={state.error ?? ""} />
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">New exam</p>
          <p className="mt-3 text-3xl font-semibold text-accent">Ready</p>
          <p className="mt-2 text-sm text-ink-soft">Open the generator to create a paper.</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Exams generated</p>
          <p className="mt-3 text-3xl font-semibold text-accent-cool">
            {state.data?.examsGenerated ?? "—"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">Total exam papers created from this account.</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Submissions count</p>
          <p className="mt-3 text-3xl font-semibold text-accent-warm">
            {state.data?.submissionsCount ?? "—"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">Approved and reviewed evaluation volume.</p>
        </Card>
      </div>

      <Card className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Pending reviews</p>
          <p className="mt-3 text-4xl font-semibold text-foreground">
            {state.data?.pendingReviews ?? "—"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            AI-evaluated submissions waiting for teacher review.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/analytics/class" className="rounded-[var(--radius)] border border-border bg-white/70 p-4 transition hover:border-accent">
            <p className="text-sm font-semibold text-foreground">Class analytics</p>
            <p className="mt-1 text-sm text-ink-soft">Review class-level performance and subject trends.</p>
          </Link>
          <Link href="/analytics/trends" className="rounded-[var(--radius)] border border-border bg-white/70 p-4 transition hover:border-accent">
            <p className="text-sm font-semibold text-foreground">Trends</p>
            <p className="mt-1 text-sm text-ink-soft">Track progress curves and review velocity over time.</p>
          </Link>
          <Link href="/evaluations/review" className="rounded-[var(--radius)] border border-border bg-white/70 p-4 transition hover:border-accent">
            <p className="text-sm font-semibold text-foreground">Review queue</p>
            <p className="mt-1 text-sm text-ink-soft">Open the focused evaluation review workspace.</p>
          </Link>
          <Link href="/teacher/templates" className="rounded-[var(--radius)] border border-border bg-white/70 p-4 transition hover:border-accent">
            <p className="text-sm font-semibold text-foreground">Templates</p>
            <p className="mt-1 text-sm text-ink-soft">Manage reusable exam structures without changing the API.</p>
          </Link>
        </div>
      </Card>
    </div>
  );
}
