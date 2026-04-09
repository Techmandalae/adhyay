"use client";

import { useState } from "react";

import { AdminWorkspaceTabs } from "@/components/admin/AdminWorkspaceTabs";
import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import DashboardTabs from "@/components/common/DashboardTabs";
import { BarChart } from "@/components/analytics/BarChart";
import { DataTable } from "@/components/analytics/DataTable";
import { MetricGrid } from "@/components/analytics/MetricGrid";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageFade } from "@/components/ui/PageFade";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
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
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    subject: "",
    difficulty: "",
    classLevel: ""
  });
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
        const response = await getTeacherAnalytics(token, {
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          subject: filters.subject || undefined,
          difficulty: filters.difficulty || undefined,
          classLevel: filters.classLevel ? Number(filters.classLevel) : undefined
        });
        setTeacherData(response);
        setStudentData(null);
        setAdminData(null);
      } else if (user.role === "STUDENT") {
        const response = await getStudentAnalytics(token, {
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          subject: filters.subject || undefined,
          difficulty: filters.difficulty || undefined
        });
        setStudentData(response);
        setTeacherData(null);
        setAdminData(null);
      } else {
        const response = await getAdminAnalytics(token, {
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined
        });
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
            title="Role-aware performance overview"
            subtitle="Teachers, students, and admins all land on the same route, but each role gets the analytics that match its scope."
          />
          <DashboardTabs />
          <AdminWorkspaceTabs />

          <Card className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
              <Input
                label="Subject"
                value={filters.subject}
                onChange={(event) => setFilters((current) => ({ ...current, subject: event.target.value }))}
              />
              <Select
                label="Difficulty"
                value={filters.difficulty}
                onChange={(event) => setFilters((current) => ({ ...current, difficulty: event.target.value }))}
              >
                <option value="">All</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
              <Input
                label="Class level"
                type="number"
                min={1}
                max={12}
                value={filters.classLevel}
                onChange={(event) => setFilters((current) => ({ ...current, classLevel: event.target.value }))}
                disabled={user?.role !== "TEACHER"}
              />
            </div>
            <Button onClick={handleLoad} disabled={!token || status.state === "loading"}>
              {status.state === "loading" ? "Loading..." : "Refresh analytics"}
            </Button>
            {status.state === "error" ? (
              <StatusBlock tone="negative" title="Analytics unavailable" description={status.message ?? ""} />
            ) : null}
          </Card>

          {teacherData ? (
            <>
              <MetricGrid
                metrics={[
                  { label: "Approved evaluations", value: teacherData.summary.totalEvaluations, tone: "accent" },
                  { label: "Unique students", value: teacherData.summary.uniqueStudents },
                  { label: "Average %", value: teacherData.summary.averagePercentage, tone: "cool" }
                ]}
              />
              <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Subjects" title="Subject performance" />
                  <BarChart
                    data={teacherData.subjectPerformance.map((item, index) => ({
                      label: item.subject,
                      value: item.averagePercentage,
                      suffix: "%",
                      tone: index % 3 === 0 ? "accent" : index % 3 === 1 ? "cool" : "warm"
                    }))}
                    maxValue={100}
                  />
                </Card>
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Difficulty" title="Difficulty effectiveness" />
                  <BarChart
                    data={teacherData.difficultyEffectiveness.map((item, index) => ({
                      label: item.difficulty,
                      value: item.averagePercentage,
                      suffix: "%",
                      tone: index % 2 === 0 ? "cool" : "warm"
                    }))}
                    maxValue={100}
                  />
                </Card>
              </div>
            </>
          ) : null}

          {studentData ? (
            <>
              <MetricGrid
                metrics={[
                  { label: "Approved evaluations", value: studentData.summary.totalEvaluations, tone: "accent" },
                  { label: "Average score", value: studentData.summary.averageScore },
                  { label: "Average %", value: studentData.summary.averagePercentage, tone: "cool" }
                ]}
              />
              <Card className="space-y-4">
                <SectionHeader eyebrow="Subjects" title="Subject-wise performance" />
                <BarChart
                  data={studentData.subjectPerformance.map((item, index) => ({
                    label: item.subject,
                    value: item.averagePercentage,
                    suffix: "%",
                    tone: index % 3 === 0 ? "accent" : index % 3 === 1 ? "cool" : "warm"
                  }))}
                  maxValue={100}
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
              <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Volume" title="Exam volume by subject" />
                  <BarChart
                    data={adminData.examVolume.bySubject.map((item, index) => ({
                      label: item.topic,
                      value: item.count,
                      tone: index % 3 === 0 ? "accent" : index % 3 === 1 ? "cool" : "warm"
                    }))}
                  />
                </Card>
                <Card className="space-y-4">
                  <SectionHeader eyebrow="Teacher activity" title="Teacher output" />
                  <DataTable
                    columns={["Teacher", "Exams", "Reviews"]}
                    rows={adminData.teacherActivity.map((item) => [
                      item.teacherId,
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
