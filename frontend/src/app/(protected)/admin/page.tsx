"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BarChart } from "@/components/analytics/BarChart";
import { DataTable } from "@/components/analytics/DataTable";
import { MetricGrid } from "@/components/analytics/MetricGrid";
import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  createUser,
  getAdminAnalytics,
  getAdminMetrics,
  getExams,
  getAcademicSetup,
  importStudents,
  importTeachers,
  saveAcademicSetup,
  uploadSchoolLogo,
  linkParentToStudent,
  listUsers,
  updateUser
} from "@/lib/api";
import type { AdminAnalyticsResponse } from "@/types/analytics";
import type { ExamSummary } from "@/types/exam";
import type { EvaluationSummary } from "@/types/evaluation";
import type { AdminUser } from "@/lib/api";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

export default function AdminDashboard() {
  const { token } = useAuth();
  const router = useRouter();
  const [examsState, setExamsState] = useState<AsyncState<ExamSummary[]>>({
    status: "idle",
    data: null
  });
  const [pendingState, setPendingState] = useState<AsyncState<EvaluationSummary[]>>({
    status: "idle",
    data: null
  });
  const [metricsState, setMetricsState] = useState<
    AsyncState<{ totalExamsGenerated: number; activeTeachers: number }>
  >({
    status: "idle",
    data: null
  });
  const [analyticsState, setAnalyticsState] = useState<AsyncState<AdminAnalyticsResponse>>({
    status: "idle",
    data: null
  });
  const [analyticsFilters, setAnalyticsFilters] = useState({
    startDate: "",
    endDate: ""
  });
  const [usersState, setUsersState] = useState<AsyncState<AdminUser[]>>({
    status: "idle",
    data: null
  });
  const [createForm, setCreateForm] = useState({
    role: "TEACHER",
    email: "",
    name: "",
    password: "",
    classId: ""
  });
  const [linkForm, setLinkForm] = useState({
    parentId: "",
    studentId: ""
  });
  const [academicSetupState, setAcademicSetupState] = useState<AsyncState<
    Array<{ name: string; hasStreams: boolean; sections: string[] }>
  >>({
    status: "idle",
    data: null
  });
  const [selectedClasses, setSelectedClasses] = useState<Record<number, boolean>>({});
  const [sectionInputs, setSectionInputs] = useState<Record<number, string>>({});
  const [logoState, setLogoState] = useState<AsyncState<{ logoUrl: string }>>({
    status: "idle",
    data: null
  });
  const [academicSaveMessage, setAcademicSaveMessage] = useState<string | null>(null);
  const [importState, setImportState] = useState<AsyncState<{ message: string; importedCount: number }>>({
    status: "idle",
    data: null
  });
  const [teacherImportState, setTeacherImportState] = useState<
    AsyncState<{ message: string; importedCount: number }>
  >({
    status: "idle",
    data: null
  });

  const fetchMetrics = async () => {
    if (!token) return;
    setMetricsState({ status: "loading", data: null });
    try {
      const payload = await getAdminMetrics(token);
      setMetricsState({ status: "success", data: payload });
    } catch (error) {
      setMetricsState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load metrics"
      });
    }
  };

  useEffect(() => {
    if (!token) return;
    void fetchMetrics();
  }, [token]);

  const fetchAnalytics = async () => {
    if (!token) return;
    setExamsState({ status: "loading", data: null });
    try {
      const exams = await getExams(token);
      setExamsState({ status: "success", data: exams.items });
    } catch (error) {
      setExamsState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load exams"
      });
    }

  };

  const fetchAdminAnalytics = async () => {
    if (!token) return;
    setAnalyticsState({ status: "loading", data: null });
    try {
      const payload = await getAdminAnalytics(token, {
        startDate: analyticsFilters.startDate || undefined,
        endDate: analyticsFilters.endDate || undefined
      });
      setAnalyticsState({ status: "success", data: payload });
    } catch (error) {
      setAnalyticsState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load analytics"
      });
    }
  };

  const fetchUsers = async () => {
    if (!token) return;
    setUsersState({ status: "loading", data: null });
    try {
      const payload = await listUsers(token);
      setUsersState({ status: "success", data: payload.items });
    } catch (error) {
      setUsersState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load users"
      });
    }
  };

  const handleCreateUser = async () => {
    if (!token) return;
    try {
      await createUser(token, {
        role: createForm.role as AdminUser["role"],
        email: createForm.email.trim(),
        name: createForm.name.trim() || undefined,
        password: createForm.password,
        classId: createForm.role === "STUDENT" ? createForm.classId.trim() : undefined
      });
      setCreateForm({ role: "TEACHER", email: "", name: "", password: "", classId: "" });
      await fetchUsers();
    } catch (error) {
      setUsersState({
        status: "error",
        data: usersState.data,
        error: error instanceof Error ? error.message : "Failed to create user"
      });
    }
  };

  const handleDeactivate = async (userId: string, isActive: boolean) => {
    if (!token) return;
    try {
      await updateUser(token, userId, { isActive: !isActive });
      await fetchUsers();
    } catch (error) {
      setUsersState({
        status: "error",
        data: usersState.data,
        error: error instanceof Error ? error.message : "Failed to update user"
      });
    }
  };

  const handleLinkParent = async () => {
    if (!token) return;
    try {
      await linkParentToStudent(token, linkForm.parentId.trim(), linkForm.studentId.trim());
      setLinkForm({ parentId: "", studentId: "" });
      await fetchUsers();
    } catch (error) {
      setUsersState({
        status: "error",
        data: usersState.data,
        error: error instanceof Error ? error.message : "Failed to link parent"
      });
    }
  };

  const loadAcademicSetup = async () => {
    if (!token) return;
    setAcademicSetupState({ status: "loading", data: null });
    try {
      const payload = await getAcademicSetup(token);
      const classes = payload.items.map((item) => ({
        name: item.name,
        hasStreams: item.hasStreams,
        sections: item.sections.map((section) => section.name)
      }));
      const selections: Record<number, boolean> = {};
      const sections: Record<number, string> = {};
      classes.forEach((klass) => {
        const match = klass.name.match(/(\d+)/);
        if (!match) return;
        const level = Number(match[1]);
        selections[level] = true;
        sections[level] = klass.sections.join(", ");
      });
      setSelectedClasses(selections);
      setSectionInputs(sections);
      setAcademicSetupState({ status: "success", data: classes });
    } catch (error) {
      setAcademicSetupState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to load academic setup"
      });
    }
  };

  const handleSaveAcademicSetup = async () => {
    if (!token) return;
    const classes = Array.from({ length: 12 }, (_v, idx) => idx + 1)
      .filter((level) => selectedClasses[level])
      .map((level) => {
        const hasStreams = level >= 11;
        const rawSections = sectionInputs[level] ?? "";
        const sections = rawSections
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        return {
          name: `Class ${level}`,
          hasStreams,
          sections: sections.length > 0 ? sections : hasStreams ? ["Science", "Commerce", "Arts"] : ["A"]
        };
      });

    setAcademicSetupState({ status: "loading", data: academicSetupState.data });
    try {
      await saveAcademicSetup(token, { classes });
      setAcademicSetupState({ status: "success", data: classes });
      setAcademicSaveMessage("Academic setup saved successfully");
      await loadAcademicSetup();
      router.refresh();
      window.setTimeout(() => setAcademicSaveMessage(null), 3000);
    } catch (error) {
      setAcademicSetupState({
        status: "error",
        data: academicSetupState.data,
        error: error instanceof Error ? error.message : "Failed to save academic setup"
      });
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!token || !event.target.files?.[0]) return;
    setLogoState({ status: "loading", data: null });
    try {
      const response = await uploadSchoolLogo(token, event.target.files[0]);
      setLogoState({ status: "success", data: response });
    } catch (error) {
      setLogoState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to upload logo"
      });
    }
  };

  const handleStudentImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!token || !event.target.files?.[0]) return;
    setImportState({ status: "loading", data: null });
    try {
      const response = await importStudents(token, event.target.files[0]);
      setImportState({ status: "success", data: response });
      await fetchUsers();
    } catch (error) {
      setImportState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to import students"
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleTeacherImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!token || !event.target.files?.[0]) return;
    setTeacherImportState({ status: "loading", data: null });
    try {
      const response = await importTeachers(token, event.target.files[0]);
      setTeacherImportState({ status: "success", data: response });
      await fetchUsers();
    } catch (error) {
      setTeacherImportState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Failed to import teachers"
      });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <RequireRole roles={["ADMIN", "SUPER_ADMIN"]}>
      <div className="mx-auto grid max-w-6xl gap-10">
        <SectionHeader
          eyebrow="Admin insights"
          title="School-wide oversight"
          subtitle="Monitor usage, manage imports, and track exam volume."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Exams generated</p>
            <p className="mt-3 text-3xl font-semibold text-accent">
              {metricsState.data?.totalExamsGenerated ?? "—"}
            </p>
            <p className="mt-2 text-xs text-ink-soft">Across all teachers in the current school.</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Pending reviews</p>
            <p className="mt-3 text-3xl font-semibold text-accent-cool">
              {pendingState.data?.length ?? "—"}
            </p>
            <p className="mt-2 text-xs text-ink-soft">Awaiting teacher review.</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Active teachers</p>
            <p className="mt-3 text-3xl font-semibold text-accent-warm">
              {metricsState.data?.activeTeachers ?? "—"}
            </p>
            <p className="mt-2 text-xs text-ink-soft">Approved teachers with active access.</p>
          </Card>
        </div>

        <Card id="academic-setup" className="space-y-4">
          <SectionHeader
            eyebrow="Academic setup"
            title="Define classes & sections"
            subtitle="Select classes that exist in your school and add sections or streams."
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={loadAcademicSetup} disabled={!token}>
              Load academic setup
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveAcademicSetup}
              disabled={!token || academicSetupState.status === "loading"}
            >
              Save academic setup
            </Button>
          </div>
          {academicSaveMessage ? (
            <StatusBlock tone="positive" title={academicSaveMessage} description="Updated setup is now active." />
          ) : null}
          {academicSetupState.status === "error" ? (
            <StatusBlock
              tone="negative"
              title="Academic setup failed"
              description={academicSetupState.error ?? ""}
            />
          ) : null}
          <div className="grid gap-4">
            {Array.from({ length: 12 }, (_val, index) => index + 1).map((level) => {
              const isSelected = Boolean(selectedClasses[level]);
              const isStreamClass = level >= 11;
              return (
                <div
                  key={level}
                  className="rounded-2xl border border-border bg-white/70 p-4 text-sm"
                >
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) =>
                        setSelectedClasses({
                          ...selectedClasses,
                          [level]: event.target.checked
                        })
                      }
                    />
                    <span className="font-semibold">Class {level}</span>
                    <span className="text-xs text-ink-soft">
                      {isStreamClass ? "Streams" : "Sections"}
                    </span>
                  </label>
                  {isSelected ? (
                    <div className="mt-3">
                      <Input
                        label={isStreamClass ? "Streams (comma separated)" : "Sections (comma separated)"}
                        helperText={
                          isStreamClass
                            ? "Defaults to Science, Commerce, Arts if left blank."
                            : "Defaults to A if left blank."
                        }
                        value={sectionInputs[level] ?? ""}
                        onChange={(event) =>
                          setSectionInputs({
                            ...sectionInputs,
                            [level]: event.target.value
                          })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-4">
          <SectionHeader
            eyebrow="Branding"
            title="Upload school logo"
            subtitle="The logo appears on PDF exam exports."
          />
          <Input label="School logo" type="file" accept="image/*" onChange={handleLogoUpload} />
          {logoState.status === "success" && logoState.data?.logoUrl ? (
            <StatusBlock
              tone="positive"
              title="Logo uploaded"
              description={`Stored at ${logoState.data.logoUrl}`}
            />
          ) : null}
          {logoState.status === "error" ? (
            <StatusBlock tone="negative" title="Logo upload failed" description={logoState.error ?? ""} />
          ) : null}
        </Card>

        <Card className="space-y-4">
          <SectionHeader
            eyebrow="Bulk import"
            title="Import students from CSV or Excel"
            subtitle="Create students, create/reuse parent accounts by email, and auto-link children."
          />
          <Input
            label="Student import file"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleStudentImport}
          />
          {importState.status === "success" && importState.data ? (
            <StatusBlock
              tone="positive"
              title={importState.data.message}
              description={`Imported ${importState.data.importedCount} students.`}
            />
          ) : null}
          {importState.status === "error" ? (
            <StatusBlock
              tone="negative"
              title="Student import failed"
              description={importState.error ?? ""}
            />
          ) : null}
        </Card>

        <Card className="space-y-4">
          <SectionHeader
            eyebrow="Bulk import"
            title="Import teachers from CSV or Excel"
            subtitle="Create teacher accounts automatically from name, contact, email, and subject."
          />
          <Input
            label="Teacher import file"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleTeacherImport}
          />
          {teacherImportState.status === "success" && teacherImportState.data ? (
            <StatusBlock
              tone="positive"
              title={teacherImportState.data.message}
              description={`Imported ${teacherImportState.data.importedCount} teachers.`}
            />
          ) : null}
          {teacherImportState.status === "error" ? (
            <StatusBlock
              tone="negative"
              title="Teacher import failed"
              description={teacherImportState.error ?? ""}
            />
          ) : null}
        </Card>

        <Card id="users" className="space-y-4">
          <SectionHeader
            eyebrow="User management"
            title="Manage teachers, students, and parents"
            subtitle="Create users, disable access, and link parents to students."
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-border bg-white/70 p-4">
              <p className="text-sm font-semibold text-ink">Create user</p>
              <div className="grid gap-3">
                <Input
                  label="Role (TEACHER/STUDENT/PARENT)"
                  value={createForm.role}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, role: event.target.value.toUpperCase() })
                  }
                />
                <Input
                  label="Email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, email: event.target.value })
                  }
                />
                <Input
                  label="Name"
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, name: event.target.value })
                  }
                />
                <Input
                  label="Password"
                  type="password"
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, password: event.target.value })
                  }
                />
                {createForm.role === "STUDENT" ? (
                  <Input
                    label="Class ID"
                    value={createForm.classId}
                    onChange={(event) =>
                      setCreateForm({ ...createForm, classId: event.target.value })
                    }
                  />
                ) : null}
                <Button onClick={handleCreateUser} disabled={!token}>
                  Create user
                </Button>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-white/70 p-4">
              <p className="text-sm font-semibold text-ink">Link parent to student</p>
              <div className="grid gap-3">
                <Input
                  label="Parent profile ID"
                  value={linkForm.parentId}
                  onChange={(event) =>
                    setLinkForm({ ...linkForm, parentId: event.target.value })
                  }
                />
                <Input
                  label="Student profile ID"
                  value={linkForm.studentId}
                  onChange={(event) =>
                    setLinkForm({ ...linkForm, studentId: event.target.value })
                  }
                />
                <Button onClick={handleLinkParent} disabled={!token}>
                  Link parent
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={fetchUsers} disabled={!token}>
              Refresh user list
            </Button>
          </div>
          {usersState.status === "error" ? (
            <StatusBlock tone="negative" title="User fetch failed" description={usersState.error ?? ""} />
          ) : null}
          {usersState.data ? (
            <DataTable
              columns={[
                "Role",
                "Email",
                "Name",
                "Active",
                "Profile ID",
                "Class",
                "Actions"
              ]}
              rows={usersState.data.map((user) => [
                user.role,
                user.email,
                user.name ?? "-",
                user.isActive ? "Yes" : "No",
                user.teacherId ?? user.studentId ?? user.parentId ?? "-",
                user.classLevel ? `Class ${user.classLevel}` : "-",
                (
                  <Button
                    key={user.id}
                    variant="ghost"
                    onClick={() => handleDeactivate(user.id, user.isActive)}
                  >
                    {user.isActive ? "Deactivate" : "Activate"}
                  </Button>
                )
              ])}
            />
          ) : (
            <p className="text-sm text-ink-soft">No users loaded yet.</p>
          )}
        </Card>

        <Card className="space-y-4">
          <SectionHeader
            eyebrow="Operations"
            title="Pull latest usage metrics"
            subtitle="Refresh analytics from the backend."
          />
          <Button onClick={fetchAnalytics} disabled={!token}>
            Refresh analytics
          </Button>
          {examsState.status === "error" ? (
            <StatusBlock tone="negative" title="Exam fetch failed" description={examsState.error ?? ""} />
          ) : null}
          {pendingState.status === "error" ? (
            <StatusBlock
              tone="negative"
              title="Pending fetch failed"
              description={pendingState.error ?? ""}
            />
          ) : null}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
              <p className="font-semibold">Teacher onboarding</p>
              <p className="mt-2 text-ink-soft">
                Use CSV imports or direct teacher registration instead of approval queues.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
              <p className="font-semibold">Usage metrics</p>
              <p className="mt-2 text-ink-soft">
                Connect subscription and billing data for richer dashboards.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-4">
            <SectionHeader
              eyebrow="Analytics"
              title="School-wide performance"
              subtitle="Review usage, quality, and activity trends."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Start date"
                type="date"
                value={analyticsFilters.startDate}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, startDate: event.target.value })
                }
              />
              <Input
                label="End date"
                type="date"
                value={analyticsFilters.endDate}
                onChange={(event) =>
                  setAnalyticsFilters({ ...analyticsFilters, endDate: event.target.value })
                }
              />
            </div>
            <Button onClick={fetchAdminAnalytics} disabled={!token}>
              Refresh admin analytics
            </Button>
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
                    label: "Total exams",
                    value: analyticsState.data.summary.totalExams,
                    tone: "accent"
                  },
                  {
                    label: "Submissions",
                    value: analyticsState.data.summary.totalSubmissions
                  },
                  {
                    label: "Average %",
                    value: analyticsState.data.summary.averagePercentage,
                    tone: "cool"
                  }
                ]}
              />
            ) : null}
          </Card>

          <Card className="space-y-4">
            <SectionHeader eyebrow="Quality" title="Evaluation quality" />
            {analyticsState.data ? (
              <MetricGrid
                metrics={[
                  {
                    label: "Override rate",
                    value: Math.round(analyticsState.data.evaluationQuality.overrideRate * 100),
                    tone: "warm"
                  },
                  {
                    label: "Avg % score",
                    value: analyticsState.data.evaluationQuality.averagePercentage,
                    tone: "cool"
                  },
                  {
                    label: "Score delta",
                    value: analyticsState.data.evaluationQuality.averageScoreDelta
                  }
                ]}
              />
            ) : (
              <p className="text-sm text-ink-soft">Load analytics to see quality metrics.</p>
            )}
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="space-y-4">
            <SectionHeader eyebrow="Volume" title="Exam volume by subject" />
            {analyticsState.data ? (
              <BarChart
                data={analyticsState.data.examVolume.bySubject.map((item, index) => ({
                  label: item.topic,
                  value: item.count,
                  tone: index % 3 === 0 ? "accent" : index % 3 === 1 ? "cool" : "warm"
                }))}
              />
            ) : (
              <p className="text-sm text-ink-soft">No exam volume data yet.</p>
            )}
          </Card>
          <Card className="space-y-4">
            <SectionHeader eyebrow="Difficulty" title="Exam volume by difficulty" />
            {analyticsState.data ? (
              <BarChart
                data={analyticsState.data.examVolume.byDifficulty.map((item, index) => ({
                  label: item.topic,
                  value: item.count,
                  tone: index % 2 === 0 ? "cool" : "warm"
                }))}
              />
            ) : (
              <p className="text-sm text-ink-soft">No difficulty data yet.</p>
            )}
          </Card>
        </div>

        <Card className="space-y-4">
          <SectionHeader eyebrow="Teachers" title="Teacher activity" />
          {analyticsState.data ? (
            <DataTable
              columns={["Teacher", "Exams", "Reviews"]}
              rows={analyticsState.data.teacherActivity.map((item) => [
                item.teacherId,
                item.examsCreated,
                item.evaluationsReviewed
              ])}
            />
          ) : (
            <p className="text-sm text-ink-soft">No activity data yet.</p>
          )}
        </Card>
      </div>
    </RequireRole>
  );
}
