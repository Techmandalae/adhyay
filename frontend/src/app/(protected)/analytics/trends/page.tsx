"use client";

import { useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { BarChart } from "@/components/analytics/BarChart";
import { TrendChart } from "@/components/analytics/TrendChart";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageFade } from "@/components/ui/PageFade";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  getStudentAnalytics,
  getTeacherAnalytics
} from "@/lib/api";
import type { StudentAnalyticsResponse, TeacherAnalyticsResponse } from "@/types/analytics";

export default function TrendAnalyticsPage() {
  const { token, user } = useAuth();
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: ""
  });
  const [status, setStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });
  const [teacherData, setTeacherData] = useState<TeacherAnalyticsResponse | null>(null);
  const [studentData, setStudentData] = useState<StudentAnalyticsResponse | null>(null);

  const handleLoad = async () => {
    if (!token || !user) {
      return;
    }

    setStatus({ state: "loading" });

    try {
      if (user.role === "TEACHER") {
        const response = await getTeacherAnalytics(token, {
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined
        });
        setTeacherData(response);
        setStudentData(null);
      } else if (user.role === "STUDENT") {
        const response = await getStudentAnalytics(token, {
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined
        });
        setStudentData(response);
        setTeacherData(null);
      } else {
        setTeacherData(null);
        setStudentData(null);
      }
      setStatus({ state: "success" });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Failed to load trend analytics."
      });
    }
  };

  const isAdmin = user?.role === "ADMIN";

  return (
    <RequireRole roles={["TEACHER", "STUDENT", "ADMIN"]}>
      <PageFade>
        <div className="mx-auto grid max-w-6xl gap-8">
          <SectionHeader
            eyebrow="Trends"
            title="Progress and activity trends"
            subtitle="Use this page for movement over time, separate from the broader class overview."
          />

          <Card className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Start date"
                type="date"
                value={filters.startDate}
                onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
              />
              <Input
                label="End date"
                type="date"
                value={filters.endDate}
                onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
              />
            </div>
            <Button onClick={handleLoad} disabled={!token || status.state === "loading" || isAdmin}>
              {status.state === "loading" ? "Loading..." : "Refresh trends"}
            </Button>
            {isAdmin ? (
              <StatusBlock
                title="Use class analytics or reports"
                description="Admin trend reporting is consolidated on the analytics overview and reports pages."
              />
            ) : null}
            {status.state === "error" ? (
              <StatusBlock tone="negative" title="Trend load failed" description={status.message ?? ""} />
            ) : null}
          </Card>

          {teacherData ? (
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              <Card className="space-y-4">
                <SectionHeader eyebrow="Trend" title="Recent evaluation movement" />
                <TrendChart
                  data={teacherData.recentEvaluations
                    .slice()
                    .reverse()
                    .map((item) => ({
                      label: new Date(item.evaluatedAt).toLocaleDateString(),
                      value: item.percentage ?? 0
                    }))}
                />
              </Card>
              <Card className="space-y-4">
                <SectionHeader eyebrow="Overrides" title="Teacher intervention rate" />
                <BarChart
                  data={[
                    {
                      label: "Override rate",
                      value: Math.round(teacherData.overrideStats.overrideRate * 100),
                      suffix: "%",
                      tone: "warm"
                    },
                    {
                      label: "AI only",
                      value: teacherData.overrideStats.aiOnlyCount,
                      tone: "cool"
                    },
                    {
                      label: "Overrides",
                      value: teacherData.overrideStats.overrideCount,
                      tone: "accent"
                    }
                  ]}
                  maxValue={100}
                />
              </Card>
            </div>
          ) : null}

          {studentData ? (
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              <Card className="space-y-4">
                <SectionHeader eyebrow="Trend" title="Progress over time" />
                <TrendChart
                  data={studentData.progress.map((point) => ({
                    label: point.period,
                    value: point.averagePercentage
                  }))}
                />
              </Card>
              <Card className="space-y-4">
                <SectionHeader eyebrow="Topics" title="Strengths vs weaknesses" />
                <BarChart
                  data={[
                    {
                      label: "Strengths",
                      value: studentData.topicInsights.strengths.reduce((sum, item) => sum + item.count, 0),
                      tone: "cool"
                    },
                    {
                      label: "Weaknesses",
                      value: studentData.topicInsights.weaknesses.reduce((sum, item) => sum + item.count, 0),
                      tone: "warm"
                    }
                  ]}
                />
              </Card>
            </div>
          ) : null}
        </div>
      </PageFade>
    </RequireRole>
  );
}
