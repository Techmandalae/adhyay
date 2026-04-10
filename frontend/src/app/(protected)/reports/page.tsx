"use client";

import { useEffect, useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { MetricGrid } from "@/components/analytics/MetricGrid";
import { AnimatedBarReportChart } from "@/components/reports/AnimatedBarReportChart";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageFade } from "@/components/ui/PageFade";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  getAdminAnalytics,
  getStudentAnalytics,
  getTeacherAnalytics
} from "@/lib/api";
import type {
  AdminAnalyticsResponse,
  StudentAnalyticsResponse,
  TeacherAnalyticsResponse
} from "@/types/analytics";

export default function ReportsPage() {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });
  const [teacherData, setTeacherData] = useState<TeacherAnalyticsResponse | null>(null);
  const [studentData, setStudentData] = useState<StudentAnalyticsResponse | null>(null);
  const [adminData, setAdminData] = useState<AdminAnalyticsResponse | null>(null);

  const loadReport = async () => {
    if (!token || !user) {
      return;
    }

    setStatus({ state: "loading" });

    try {
      if (user.role === "TEACHER") {
        const response = await getTeacherAnalytics(token, {});
        setTeacherData(response);
        setStudentData(null);
        setAdminData(null);
      } else if (user.role === "STUDENT") {
        const response = await getStudentAnalytics(token, {});
        setStudentData(response);
        setTeacherData(null);
        setAdminData(null);
      } else {
        const response = await getAdminAnalytics(token, {});
        setAdminData(response);
        setTeacherData(null);
        setStudentData(null);
      }
      setStatus({ state: "success" });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Failed to load report."
      });
    }
  };

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    let isActive = true;

    const preloadReport = async () => {
      try {
        if (user.role === "TEACHER") {
          const response = await getTeacherAnalytics(token, {});
          if (!isActive) return;
          setTeacherData(response);
          setStudentData(null);
          setAdminData(null);
        } else if (user.role === "STUDENT") {
          const response = await getStudentAnalytics(token, {});
          if (!isActive) return;
          setStudentData(response);
          setTeacherData(null);
          setAdminData(null);
        } else {
          const response = await getAdminAnalytics(token, {});
          if (!isActive) return;
          setAdminData(response);
          setTeacherData(null);
          setStudentData(null);
        }
        setStatus({ state: "success" });
      } catch (error) {
        if (!isActive) return;
        setStatus({
          state: "error",
          message: error instanceof Error ? error.message : "Failed to load report."
        });
      }
    };

    void preloadReport();

    return () => {
      isActive = false;
    };
  }, [token, user]);

  return (
    <RequireRole roles={["TEACHER", "STUDENT", "ADMIN"]}>
      <PageFade>
        <div className="mx-auto grid max-w-6xl gap-8">
          <SectionHeader
            eyebrow="Reports"
            title="Animated performance report"
            subtitle="This page adds motion and chart animation without changing any backend contracts."
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={loadReport} disabled={!token || status.state === "loading"}>
              {status.state === "loading" ? "Refreshing..." : "Refresh report"}
            </Button>
          </div>

          {status.state === "error" ? (
            <StatusBlock tone="negative" title="Report unavailable" description={status.message ?? ""} />
          ) : null}

          {teacherData ? (
            <>
              <MetricGrid
                metrics={[
                  { label: "Evaluations", value: teacherData.summary.totalEvaluations, tone: "accent" },
                  { label: "Students", value: teacherData.summary.uniqueStudents },
                  { label: "Average %", value: teacherData.summary.averagePercentage, tone: "cool" }
                ]}
              />
              <Card className="space-y-4">
                <SectionHeader eyebrow="Score report" title="Recent class percentages" />
                <AnimatedBarReportChart
                  data={teacherData.recentEvaluations.slice(0, 8).map((item) => ({
                    label: item.subject,
                    score: item.percentage ?? 0
                  }))}
                />
              </Card>
            </>
          ) : null}

          {studentData ? (
            <>
              <MetricGrid
                metrics={[
                  { label: "Evaluations", value: studentData.summary.totalEvaluations, tone: "accent" },
                  { label: "Average score", value: studentData.summary.averageScore },
                  { label: "Average %", value: studentData.summary.averagePercentage, tone: "cool" }
                ]}
              />
              <Card className="space-y-4">
                <SectionHeader eyebrow="Score report" title="Recent exam percentages" />
                <AnimatedBarReportChart
                  data={studentData.recentEvaluations.slice(0, 8).map((item) => ({
                    label: item.subject,
                    score: item.percentage ?? 0
                  }))}
                />
              </Card>
            </>
          ) : null}

          {adminData ? (
            <>
              <MetricGrid
                metrics={[
                  { label: "Total exams", value: adminData.summary.totalExams, tone: "accent" },
                  { label: "Submissions", value: adminData.summary.totalSubmissions },
                  { label: "Average %", value: adminData.summary.averagePercentage, tone: "cool" }
                ]}
              />
              <Card className="space-y-4">
                <SectionHeader eyebrow="Volume report" title="Exam volume by subject" />
                <AnimatedBarReportChart
                  data={adminData.examVolume.bySubject.slice(0, 8).map((item) => ({
                    label: item.topic,
                    score: item.count
                  }))}
                />
              </Card>
            </>
          ) : null}
        </div>
      </PageFade>
    </RequireRole>
  );
}
