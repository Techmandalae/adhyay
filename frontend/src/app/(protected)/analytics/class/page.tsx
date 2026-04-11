"use client";

import { useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { DataTable } from "@/components/analytics/DataTable";
import { DonutBreakdownChart } from "@/components/analytics/DonutBreakdownChart";
import { MetricGrid } from "@/components/analytics/MetricGrid";
import { SubjectVolumeChart } from "@/components/analytics/SubjectVolumeChart";
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

export default function ClassAnalyticsPage() {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });
  const [teacherData, setTeacherData] = useState<TeacherAnalyticsResponse | null>(null);
  const [studentData, setStudentData] = useState<StudentAnalyticsResponse | null>(null);
  const [adminData, setAdminData] = useState<AdminAnalyticsResponse | null>(null);

  const handleLoad = async () => {
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
        message: error instanceof Error ? error.message : "Failed to load analytics."
      });
    }
  };

  return (
    <RequireRole roles={["TEACHER", "STUDENT", "ADMIN"]}>
      <PageFade>
        <div className="mx-auto grid max-w-6xl gap-8">
          <SectionHeader
            eyebrow="Class analytics"
            title="Visual performance overview"
            subtitle="Latest exam volume, submissions, and evaluation percentage."
          />
          <Card className="space-y-4">
            <Button onClick={handleLoad} disabled={!token || status.state === "loading"}>
              {status.state === "loading" ? "Loading..." : "Refresh analytics"}
            </Button>
            {status.state === "error" ? (
              <StatusBlock tone="negative" title="Analytics unavailable" description={status.message ?? ""} />
            ) : null}
          </Card>

          {teacherData ? (
            <>
              <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Overview" title="Performance mix" />
                  <DonutBreakdownChart
                    data={[
                      {
                        label: "Exams",
                        value: teacherData.summary.totalExams,
                        color: "#ff6b35"
                      },
                      {
                        label: "Submissions",
                        value: teacherData.summary.totalSubmissions,
                        color: "#1e90ff"
                      },
                      {
                        label: "Evaluated %",
                        value: Math.round(teacherData.summary.averagePercentage),
                        suffix: "%",
                        color: "#f4b942"
                      }
                    ]}
                  />
                </Card>
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Volume" title="Exam volume by subject" />
                  <SubjectVolumeChart
                    data={teacherData.subjectPerformance.map((item) => ({
                      label: item.subject,
                      value: item.exams
                    }))}
                  />
                </Card>
              </div>
              <MetricGrid
                metrics={[
                  { label: "Total exams", value: teacherData.summary.totalExams, tone: "accent" },
                  { label: "Submissions", value: teacherData.summary.totalSubmissions },
                  { label: "Evaluated", value: teacherData.summary.evaluatedCount },
                  { label: "Evaluated %", value: teacherData.summary.averagePercentage, tone: "cool" }
                ]}
              />
            </>
          ) : null}

          {studentData ? (
            <>
              <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Overview" title="Performance mix" />
                  <DonutBreakdownChart
                    data={[
                      {
                        label: "Evaluations",
                        value: studentData.summary.totalEvaluations,
                        color: "#ff6b35"
                      },
                      {
                        label: "Avg score",
                        value: Math.round(studentData.summary.averageScore),
                        color: "#1e90ff"
                      },
                      {
                        label: "Average %",
                        value: Math.round(studentData.summary.averagePercentage),
                        suffix: "%",
                        color: "#f4b942"
                      }
                    ]}
                  />
                </Card>
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Volume" title="Exam volume by subject" />
                  <SubjectVolumeChart
                    data={studentData.subjectPerformance.map((item) => ({
                      label: item.subject,
                      value: item.exams
                    }))}
                  />
                </Card>
              </div>
            </>
          ) : null}

          {adminData ? (
            <>
              <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Overview" title="Performance mix" />
                  <DonutBreakdownChart
                    data={[
                      {
                        label: "Total Exams",
                        value: adminData.summary.totalExams,
                        color: "#ff6b35"
                      },
                      {
                        label: "Submissions",
                        value: adminData.summary.totalSubmissions,
                        color: "#1e90ff"
                      },
                      {
                        label: "Evaluated %",
                        value: Math.round(adminData.summary.averagePercentage),
                        suffix: "%",
                        color: "#f4b942"
                      }
                    ]}
                  />
                </Card>
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Volume" title="Exam volume by subject" />
                  <SubjectVolumeChart
                    data={adminData.examVolume.bySubject.map((item) => ({
                      label: item.topic,
                      value: item.count
                    }))}
                  />
                </Card>
              </div>
              <MetricGrid
                metrics={[
                  { label: "Total exams", value: adminData.summary.totalExams, tone: "accent" },
                  { label: "Submissions", value: adminData.summary.totalSubmissions },
                  { label: "Evaluated", value: adminData.summary.evaluatedCount },
                  { label: "Evaluated %", value: adminData.summary.averagePercentage, tone: "cool" }
                ]}
              />
              <div className="grid gap-8 lg:grid-cols-[1fr]">
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Teacher activity" title="Teacher output" />
                  <DataTable
                    columns={["Teacher", "Exams", "Reviews"]}
                    rows={adminData.teacherActivity.map((item) => [
                      item.teacherName,
                      item.examsCreated,
                      item.evaluationsReviewed
                    ])}
                  />
                </Card>
              </div>
            </>
          ) : null}
        </div>
      </PageFade>
    </RequireRole>
  );
}
