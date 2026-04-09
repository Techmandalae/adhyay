"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import DashboardTabs from "@/components/common/DashboardTabs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { getAdminMetrics, listUsers } from "@/lib/api";

type DashboardState = {
  totalTeachers: number;
  totalStudents: number;
  totalExams: number;
};

export function AdminDashboard() {
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
        const [metricsResponse, usersResponse] = await Promise.all([
          getAdminMetrics(token),
          listUsers(token)
        ]);

        if (!isActive) {
          return;
        }

        setState({
          status: "success",
          data: {
            totalTeachers: usersResponse.items.filter((item) => item.role === "TEACHER").length,
            totalStudents: usersResponse.items.filter((item) => item.role === "STUDENT").length,
            totalExams: metricsResponse.totalExamsGenerated
          }
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load admin dashboard."
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
        eyebrow="Admin dashboard"
        title="Monitor teachers, students, and exam volume"
        subtitle="The landing view is now a cleaner control panel, while operational workflows stay on their own pages."
      />
      <DashboardTabs />

      <div className="flex flex-wrap gap-3">
        <Link href="/admin">
          <Button>User management</Button>
        </Link>
        <Link href="/analytics/class">
          <Button variant="outline">Analytics</Button>
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
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Total teachers</p>
          <p className="mt-3 text-3xl font-semibold text-accent">
            {state.data?.totalTeachers ?? "—"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">Active and inactive teacher accounts in the school.</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Total students</p>
          <p className="mt-3 text-3xl font-semibold text-accent-cool">
            {state.data?.totalStudents ?? "—"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">Imported and provisioned student accounts.</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Total exams</p>
          <p className="mt-3 text-3xl font-semibold text-accent-warm">
            {state.data?.totalExams ?? "—"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">Total generated papers across the school.</p>
        </Card>
      </div>

      <Card className="grid gap-4 md:grid-cols-3">
        <Link href="/admin#academic-setup" className="rounded-[var(--radius)] border border-border bg-white/70 p-4 transition hover:border-accent">
          <p className="text-sm font-semibold text-foreground">Academic setup</p>
          <p className="mt-1 text-sm text-ink-soft">Manage classes, sections, and school structure.</p>
        </Link>
        <Link href="/admin#users" className="rounded-[var(--radius)] border border-border bg-white/70 p-4 transition hover:border-accent">
          <p className="text-sm font-semibold text-foreground">Users</p>
          <p className="mt-1 text-sm text-ink-soft">Create, deactivate, and link accounts.</p>
        </Link>
        <Link href="/reports" className="rounded-[var(--radius)] border border-border bg-white/70 p-4 transition hover:border-accent">
          <p className="text-sm font-semibold text-foreground">Animated report</p>
          <p className="mt-1 text-sm text-ink-soft">Review exam and usage metrics with chart animation.</p>
        </Link>
      </Card>
    </div>
  );
}
