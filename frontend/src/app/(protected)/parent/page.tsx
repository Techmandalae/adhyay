"use client";

import { useEffect, useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { BarChart } from "@/components/analytics/BarChart";
import { DataTable } from "@/components/analytics/DataTable";
import { MetricGrid } from "@/components/analytics/MetricGrid";
import { TrendChart } from "@/components/analytics/TrendChart";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { getParentChildren, getStudentAnalyticsById } from "@/lib/api";
import type { StudentAnalyticsResponse } from "@/types/analytics";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

export default function ParentDashboard() {
  const { token } = useAuth();
  const [children, setChildren] = useState<
    Array<{ id: string; name?: string; email?: string; classLevel?: number }>
  >([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [analyticsState, setAnalyticsState] = useState<AsyncState<StudentAnalyticsResponse>>({
    status: "idle",
    data: null
  });

  useEffect(() => {
    if (!token) return;
    let isActive = true;
    const loadChildren = async () => {
      try {
        const response = await getParentChildren(token);
        if (!isActive) return;
        setChildren(response.items);
        if (!selectedStudentId && response.items.length > 0) {
          setSelectedStudentId(response.items[0].id);
        }
      } catch (_error) {
        if (!isActive) return;
        setChildren([]);
      }
    };
    void loadChildren();
    return () => {
      isActive = false;
    };
  }, [token, selectedStudentId]);

  useEffect(() => {
    if (!token || !selectedStudentId) return;
    let isActive = true;
    const loadAnalytics = async () => {
      setAnalyticsState({ status: "loading", data: null });
      try {
        const payload = await getStudentAnalyticsById(token, selectedStudentId);
        if (!isActive) return;
        setAnalyticsState({ status: "success", data: payload });
      } catch (error) {
        if (!isActive) return;
        setAnalyticsState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Failed to load analytics"
        });
      }
    };
    void loadAnalytics();
    return () => {
      isActive = false;
    };
  }, [token, selectedStudentId]);

  return (
    <RequireRole roles={["PARENT"]}>
      <div className="mx-auto grid max-w-6xl gap-10">
        <SectionHeader
          eyebrow="Parent view"
          title="Track your child’s progress"
          subtitle="Link students and view approved reports."
        />

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="space-y-4">
            <SectionHeader eyebrow="Linked students" title="Manage student profiles" />
            <Select
              label="Select student"
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
            >
              <option value="">Select student</option>
              {children.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name ?? student.email ?? student.id}
                </option>
              ))}
            </Select>
            {children.length === 0 ? (
              <p className="text-sm text-ink-soft">No linked students yet.</p>
            ) : null}
          </Card>

          <Card className="space-y-4">
            <SectionHeader
              eyebrow="Student report"
              title="Performance summary"
              subtitle="Auto-generated overview for the selected student."
            />
            {analyticsState.status === "loading" ? (
              <p className="text-sm text-ink-soft">Loading report…</p>
            ) : null}
            {analyticsState.status === "error" ? (
              <StatusBlock tone="negative" title="Unable to load" description={analyticsState.error ?? ""} />
            ) : null}
            {analyticsState.data ? (
              <MetricGrid
                metrics={[
                  {
                    label: "Evaluations",
                    value: analyticsState.data.summary.totalEvaluations,
                    tone: "accent"
                  },
                  {
                    label: "Average %",
                    value: analyticsState.data.summary.averagePercentage,
                    tone: "cool"
                  },
                  {
                    label: "Last evaluation",
                    value: analyticsState.data.summary.lastEvaluationAt
                      ? new Date(analyticsState.data.summary.lastEvaluationAt).toLocaleDateString()
                      : "—"
                  }
                ]}
              />
            ) : (
              <p className="text-sm text-ink-soft">Select a student to load their report.</p>
            )}
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-4">
            <SectionHeader
              eyebrow="Student analytics"
              title="Performance"
              subtitle="Highlights from recent approved evaluations."
            />
            {analyticsState.status === "loading" ? (
              <p className="text-sm text-ink-soft">Loading analytics...</p>
            ) : null}
            {analyticsState.status === "error" ? (
              <StatusBlock
                tone="negative"
                title="Analytics unavailable"
                description={analyticsState.error ?? ""}
              />
            ) : null}
            {analyticsState.data ? (
              <MetricGrid
                metrics={[
                  {
                    label: "Evaluations",
                    value: analyticsState.data.summary.totalEvaluations,
                    tone: "accent"
                  },
                  {
                    label: "Average %",
                    value: analyticsState.data.summary.averagePercentage
                  },
                  {
                    label: "Best subject",
                    value: analyticsState.data.summary.bestSubject ?? "—",
                    tone: "cool"
                  }
                ]}
              />
            ) : null}
          </Card>

          <Card className="space-y-4">
            <SectionHeader eyebrow="Trends" title="Recent progress" />
            {analyticsState.data ? (
              <TrendChart
                data={analyticsState.data.progress.map((point) => ({
                  label: point.period,
                  value: point.averagePercentage
                }))}
              />
            ) : (
              <p className="text-sm text-ink-soft">Load analytics to see progress.</p>
            )}
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="space-y-4">
            <SectionHeader eyebrow="Subjects" title="Subject analytics" />
            {analyticsState.data ? (
              <BarChart
                data={analyticsState.data.subjectPerformance.map((item, index) => ({
                  label: item.subject,
                  value: item.averagePercentage,
                  suffix: "%",
                  tone: index % 3 === 0 ? "accent" : index % 3 === 1 ? "cool" : "warm"
                }))}
                maxValue={100}
              />
            ) : (
              <p className="text-sm text-ink-soft">No subject data yet.</p>
            )}
          </Card>
          <Card className="space-y-4">
            <SectionHeader eyebrow="Recent exams" title="Latest evaluations" />
            {analyticsState.data ? (
              <DataTable
                columns={["Exam", "Subject", "Difficulty", "%", "Evaluated"]}
                rows={analyticsState.data.recentEvaluations.map((item) => [
                  item.examId,
                  item.subject,
                  item.difficulty,
                  item.percentage ?? "-",
                  new Date(item.evaluatedAt).toLocaleDateString()
                ])}
              />
            ) : (
              <p className="text-sm text-ink-soft">No reports available.</p>
            )}
          </Card>
        </div>
      </div>
    </RequireRole>
  );
}
