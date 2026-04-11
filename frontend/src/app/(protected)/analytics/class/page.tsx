"use client";

import { useEffect, useMemo, useState } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { DataTable } from "@/components/analytics/DataTable";
import { DonutBreakdownChart } from "@/components/analytics/DonutBreakdownChart";
import { MetricGrid } from "@/components/analytics/MetricGrid";
import { SubjectVolumeChart } from "@/components/analytics/SubjectVolumeChart";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageFade } from "@/components/ui/PageFade";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  getAcademicClasses,
  getAcademicSubjects,
  getAdminAnalytics,
  getStudentAnalytics,
  getTeacherAnalytics
} from "@/lib/api";
import type { AcademicClass, AcademicSubject } from "@/types/academic";
import type {
  AdminAnalyticsResponse,
  StudentAnalyticsResponse,
  TeacherAnalyticsResponse
} from "@/types/analytics";

type AnalyticsClassOption = {
  classId: string;
  classLevel: number;
  label: string;
};

function compareClassOptions(left: AnalyticsClassOption, right: AnalyticsClassOption) {
  if (left.classLevel !== right.classLevel) {
    return left.classLevel - right.classLevel;
  }
  return left.label.localeCompare(right.label);
}

function dedupeSubjectOptions(subjects: AcademicSubject[]) {
  const deduped = new Map<string, AcademicSubject>();

  subjects.forEach((subject) => {
    const key = subject.name.trim().toLowerCase();
    if (!key || deduped.has(key)) {
      return;
    }
    deduped.set(key, subject);
  });

  return Array.from(deduped.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

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
    classId: ""
  });
  const [teacherData, setTeacherData] = useState<TeacherAnalyticsResponse | null>(null);
  const [studentData, setStudentData] = useState<StudentAnalyticsResponse | null>(null);
  const [adminData, setAdminData] = useState<AdminAnalyticsResponse | null>(null);
  const [classOptions, setClassOptions] = useState<AnalyticsClassOption[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<AcademicSubject[]>([]);

  const selectedClassOption = useMemo(
    () => classOptions.find((option) => option.classId === filters.classId) ?? null,
    [classOptions, filters.classId]
  );

  useEffect(() => {
    if (!token || !user || user.role === "STUDENT") {
      return;
    }

    let isActive = true;
    const loadClasses = async () => {
      try {
        const response = await getAcademicClasses(token);
        if (!isActive) {
          return;
        }

        const deduped = new Map<string, AnalyticsClassOption>();
        response.items.forEach((item: AcademicClass) => {
          if (!item.classId || deduped.has(item.classId)) {
            return;
          }
          deduped.set(item.classId, {
            classId: item.classId,
            classLevel: item.classLevel,
            label: item.className || item.label
          });
        });

        setClassOptions(Array.from(deduped.values()).sort(compareClassOptions));
      } catch {
        if (!isActive) {
          return;
        }
        setClassOptions([]);
      }
    };

    void loadClasses();
    return () => {
      isActive = false;
    };
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    let isActive = true;
    const loadSubjects = async () => {
      try {
        const classId =
          user.role === "STUDENT"
            ? user.classId ?? ""
            : filters.classId;

        if (!classId) {
          if (isActive) {
            setSubjectOptions([]);
          }
          return;
        }

        const response = await getAcademicSubjects(token, classId);
        if (!isActive) {
          return;
        }
        const nextSubjects = dedupeSubjectOptions(response.items);
        setSubjectOptions(nextSubjects);
        setFilters((current) =>
          current.subject && !nextSubjects.some((subject) => subject.name === current.subject)
            ? { ...current, subject: "" }
            : current
        );
      } catch {
        if (!isActive) {
          return;
        }
        setSubjectOptions([]);
        setFilters((current) => (current.subject ? { ...current, subject: "" } : current));
      }
    };

    void loadSubjects();
    return () => {
      isActive = false;
    };
  }, [token, user, filters.classId]);

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
          classLevel: selectedClassOption?.classLevel
        });
        setTeacherData(response);
        setStudentData(null);
        setAdminData(null);
      } else if (user.role === "STUDENT") {
        const response = await getStudentAnalytics(token, {
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          subject: filters.subject || undefined
        });
        setStudentData(response);
        setTeacherData(null);
        setAdminData(null);
      } else {
        const response = await getAdminAnalytics(token, {
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          subject: filters.subject || undefined,
          classLevel: selectedClassOption?.classLevel
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
            title="Visual performance overview"
            subtitle="Use start date, end date, class, and an optional clean subject filter to spot volume and score trends quickly."
          />
          <Card className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              {user?.role !== "STUDENT" ? (
                <Select
                  label="Class"
                  value={filters.classId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      classId: event.target.value,
                      subject: ""
                    }))
                  }
                >
                  <option value="">All classes</option>
                  {classOptions.map((option) => (
                    <option key={option.classId} value={option.classId}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Select
                label="Subject"
                value={filters.subject}
                onChange={(event) => setFilters((current) => ({ ...current, subject: event.target.value }))}
                disabled={user?.role !== "STUDENT" && !filters.classId}
              >
                <option value="">All subjects</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={subject.name}>
                    {subject.name}
                  </option>
                ))}
              </Select>
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
