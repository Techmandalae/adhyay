"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminWorkspaceTabs } from "@/components/admin/AdminWorkspaceTabs";
import { RequireRole } from "@/components/auth/RequireRole";
import { useAuth } from "@/components/auth/AuthProvider";
import { DataTable } from "@/components/analytics/DataTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import {
  type AdminUser,
  type BulkImportResponse,
  createUser,
  getAcademicSetup,
  getAdminMetrics,
  importStudents,
  importTeachers,
  linkParentToStudent,
  listUsers,
  saveAcademicSetup,
  updateUser,
  uploadSchoolLogo
} from "@/lib/api";
import {
  buildImportPreview,
  downloadErrorCsv,
  downloadSampleCsv,
  studentImportColumns,
  studentSampleRow,
  teacherImportColumns,
  teacherSampleRow,
  type ImportKind,
  type ImportPreviewResult
} from "@/lib/imports";

type AsyncState<T> = {
  status: "idle" | "loading" | "error" | "success";
  data: T | null;
  error?: string;
};

type ImportState = {
  status: "idle" | "parsing" | "ready" | "uploading" | "success" | "error";
  file: File | null;
  preview: ImportPreviewResult | null;
  result: BulkImportResponse | null;
  message?: string;
};

const initialImportState: ImportState = {
  status: "idle",
  file: null,
  preview: null,
  result: null
};

function PreviewTable({ kind, preview }: { kind: ImportKind; preview: ImportPreviewResult }) {
  const columns =
    kind === "students"
      ? ["Name", "Email", "Class", "Section", "Parent Email", "Status"]
      : ["Name", "Email", "Phone", "Subject", "Status"];

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-surface-muted">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-left font-semibold text-foreground">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row) => (
            <tr
              key={`${kind}-${row.rowNumber}`}
              className={
                row.status === "valid"
                  ? "border-t border-emerald-100 bg-emerald-50/70"
                  : "border-t border-rose-100 bg-rose-50/80"
              }
            >
              <td className="px-4 py-3">{row.values.name || "-"}</td>
              <td className="px-4 py-3">{row.values.email || "-"}</td>
              {kind === "students" ? (
                <>
                  <td className="px-4 py-3">{row.values.className || "-"}</td>
                  <td className="px-4 py-3">{row.values.sectionName || "-"}</td>
                  <td className="px-4 py-3">{row.values.parentEmail || "-"}</td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3">{row.values.phone || "-"}</td>
                  <td className="px-4 py-3">{row.values.subject || "-"}</td>
                </>
              )}
              <td className="px-4 py-3 font-medium">
                {row.status === "valid" ? "Valid" : row.errors.join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportInstructions({ kind }: { kind: ImportKind }) {
  const columns = kind === "students" ? [...studentImportColumns] : [...teacherImportColumns];
  const sampleValues =
    kind === "students"
      ? [
          studentSampleRow.name,
          studentSampleRow.email,
          studentSampleRow.password,
          studentSampleRow.className,
          studentSampleRow.sectionName,
          studentSampleRow.parentEmail
        ]
      : [
          teacherSampleRow.name,
          teacherSampleRow.email,
          teacherSampleRow.password,
          teacherSampleRow.phone
        ];

  return (
    <div className="rounded-2xl border border-border bg-surface-muted p-4">
      <p className="text-sm font-semibold text-foreground">Required CSV Format</p>
      <p className="mt-2 text-sm text-ink-soft">{columns.join(", ")}</p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-ink-soft">
        Example row
      </p>
      <code className="mt-2 block overflow-x-auto rounded-xl bg-white px-3 py-2 text-xs text-foreground">
        {sampleValues.join(", ")}
      </code>
    </div>
  );
}

function BulkImportCard({
  kind,
  title,
  subtitle,
  state,
  inputKey,
  onFileSelect,
  onConfirm,
  onCancel
}: {
  kind: ImportKind;
  title: string;
  subtitle: string;
  state: ImportState;
  inputKey: number;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const preview = state.preview;
  const canUpload = Boolean(preview?.validCount && state.status !== "uploading");
  const hasInvalidRows = Boolean(preview?.invalidCount);

  return (
    <Card className="space-y-5">
      <SectionHeader eyebrow="Bulk import" title={title} subtitle={subtitle} />
      <ImportInstructions kind={kind} />
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={() => downloadSampleCsv(kind)}>
          Download Sample CSV
        </Button>
      </div>
      <Input
        key={inputKey}
        label="Select file"
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={onFileSelect}
      />

      {state.status === "parsing" ? (
        <StatusBlock title="Parsing file" description="Validating rows and building preview." />
      ) : null}

      {state.status === "error" && state.message ? (
        <StatusBlock tone="negative" title="Import setup failed" description={state.message} />
      ) : null}

      {preview ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">Total rows</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{preview.totalRows}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-700">Valid rows</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">{preview.validCount}</p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-rose-700">Invalid rows</p>
              <p className="mt-2 text-2xl font-semibold text-rose-700">{preview.invalidCount}</p>
            </div>
          </div>

          <PreviewTable kind={kind} preview={preview} />

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={onConfirm} disabled={!canUpload}>
              {state.status === "uploading" ? "Uploading..." : "Confirm Upload"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadErrorCsv(kind, preview.rows)}
              disabled={!hasInvalidRows}
            >
              Download Error CSV
            </Button>
          </div>
        </div>
      ) : null}

      {state.result ? (
        <StatusBlock
          tone={state.result.failedCount ? "negative" : "positive"}
          title={state.result.message}
          description={`Imported ${state.result.importedCount} of ${state.result.totalRows ?? state.result.importedCount} rows.`}
        />
      ) : null}

      {state.result?.errors?.length ? (
        <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="font-semibold">Row-level upload errors</p>
          {state.result.errors.slice(0, 6).map((error) => (
            <p key={`${kind}-${error.rowNumber}-${error.message}`}>
              Row {error.rowNumber}: {error.message}
            </p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export default function AdminDashboard() {
  const { token } = useAuth();
  const router = useRouter();
  const [metricsState, setMetricsState] = useState<
    AsyncState<{ totalExamsGenerated: number; activeTeachers: number }>
  >({
    status: "idle",
    data: null
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
  const [academicSetupState, setAcademicSetupState] = useState<
    AsyncState<Array<{ name: string; hasStreams: boolean; sections: string[] }>>
  >({
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
  const [studentImportState, setStudentImportState] = useState<ImportState>(initialImportState);
  const [teacherImportState, setTeacherImportState] = useState<ImportState>(initialImportState);
  const [studentInputKey, setStudentInputKey] = useState(0);
  const [teacherInputKey, setTeacherInputKey] = useState(0);

  const fetchMetrics = useCallback(async () => {
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
  }, [token]);

  const fetchUsers = useCallback(async () => {
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
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void fetchMetrics();
    void fetchUsers();
  }, [fetchMetrics, fetchUsers, token]);

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
    const classes = Array.from({ length: 12 }, (_value, index) => index + 1)
      .filter((level) => selectedClasses[level])
      .map((level) => {
        const hasStreams = level >= 11;
        const sections = (sectionInputs[level] ?? "")
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

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
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

  const handlePreviewSelection = async (
    kind: ImportKind,
    event: ChangeEvent<HTMLInputElement>,
    setState: Dispatch<SetStateAction<ImportState>>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setState({
      status: "parsing",
      file,
      preview: null,
      result: null
    });

    try {
      const preview = await buildImportPreview(kind, file);
      setState({
        status: "ready",
        file,
        preview,
        result: null
      });
    } catch (error) {
      setState({
        status: "error",
        file: null,
        preview: null,
        result: null,
        message: error instanceof Error ? error.message : "Failed to parse import file"
      });
    }
  };

  const resetImportState = (
    kind: ImportKind,
    setState: Dispatch<SetStateAction<ImportState>>
  ) => {
    setState(initialImportState);
    if (kind === "students") {
      setStudentInputKey((value) => value + 1);
      return;
    }
    setTeacherInputKey((value) => value + 1);
  };

  const handleStudentImport = async () => {
    if (!token || !studentImportState.file) return;
    setStudentImportState((current) => ({ ...current, status: "uploading", result: null }));
    try {
      const response = await importStudents(token, studentImportState.file);
      setStudentImportState((current) => ({
        ...current,
        status: "success",
        result: response
      }));
      await fetchUsers();
      await fetchMetrics();
    } catch (error) {
      setStudentImportState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "Failed to import students"
      }));
    }
  };

  const handleTeacherImport = async () => {
    if (!token || !teacherImportState.file) return;
    setTeacherImportState((current) => ({ ...current, status: "uploading", result: null }));
    try {
      const response = await importTeachers(token, teacherImportState.file);
      setTeacherImportState((current) => ({
        ...current,
        status: "success",
        result: response
      }));
      await fetchUsers();
      await fetchMetrics();
    } catch (error) {
      setTeacherImportState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "Failed to import teachers"
      }));
    }
  };

  return (
    <RequireRole roles={["ADMIN", "SUPER_ADMIN"]}>
      <div className="mx-auto grid max-w-6xl gap-8">
        <SectionHeader
          eyebrow="Admin workspace"
          title="User management"
          subtitle="Import users with preview validation, manage accounts, and configure your school setup."
        />
        <AdminWorkspaceTabs />

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Exams generated</p>
            <p className="mt-3 text-3xl font-semibold text-accent">
              {metricsState.data?.totalExamsGenerated ?? "—"}
            </p>
            <p className="mt-2 text-xs text-ink-soft">Across the current school workspace.</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">Active teachers</p>
            <p className="mt-3 text-3xl font-semibold text-accent-cool">
              {metricsState.data?.activeTeachers ?? "—"}
            </p>
            <p className="mt-2 text-xs text-ink-soft">Teachers with approved active access.</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">User records</p>
            <p className="mt-3 text-3xl font-semibold text-accent-warm">
              {usersState.data?.length ?? "—"}
            </p>
            <p className="mt-2 text-xs text-ink-soft">Teachers, students, and parents in this school.</p>
          </Card>
        </div>

        <div className="grid gap-8 xl:grid-cols-2">
          <BulkImportCard
            kind="students"
            title="Import students"
            subtitle="Normalize headers, validate rows, preview the file, then upload only when ready."
            state={studentImportState}
            inputKey={studentInputKey}
            onFileSelect={(event) => void handlePreviewSelection("students", event, setStudentImportState)}
            onConfirm={handleStudentImport}
            onCancel={() => resetImportState("students", setStudentImportState)}
          />
          <BulkImportCard
            kind="teachers"
            title="Import teachers"
            subtitle="Preview teacher records before upload so bad rows never block the whole file."
            state={teacherImportState}
            inputKey={teacherInputKey}
            onFileSelect={(event) => void handlePreviewSelection("teachers", event, setTeacherImportState)}
            onConfirm={handleTeacherImport}
            onCancel={() => resetImportState("teachers", setTeacherImportState)}
          />
        </div>

        <Card className="space-y-4">
          <SectionHeader
            eyebrow="Branding"
            title="Upload school logo"
            subtitle="The school logo is used for exports while the app branding stays consistent in the UI."
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
            eyebrow="Academic setup"
            title="Define classes and sections"
            subtitle="Load the current setup, update classes, and save sections or streams."
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
            {Array.from({ length: 12 }, (_value, index) => index + 1).map((level) => {
              const isSelected = Boolean(selectedClasses[level]);
              const isStreamClass = level >= 11;
              return (
                <div key={level} className="rounded-2xl border border-border bg-white/70 p-4 text-sm">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) =>
                        setSelectedClasses((current) => ({
                          ...current,
                          [level]: event.target.checked
                        }))
                      }
                    />
                    <span className="font-semibold">Class {level}</span>
                    <span className="text-xs text-ink-soft">{isStreamClass ? "Streams" : "Sections"}</span>
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
                          setSectionInputs((current) => ({
                            ...current,
                            [level]: event.target.value
                          }))
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>

        <Card id="users" className="space-y-6">
          <SectionHeader
            eyebrow="User operations"
            title="Manage teachers, students, and parents"
            subtitle="Create accounts manually, link parents to students, and activate or deactivate access."
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-border bg-white/70 p-4">
              <p className="text-sm font-semibold text-ink">Create user</p>
              <div className="grid gap-3">
                <Input
                  label="Role (TEACHER/STUDENT/PARENT)"
                  value={createForm.role}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, role: event.target.value.toUpperCase() }))
                  }
                />
                <Input
                  label="Email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <Input
                  label="Name"
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <Input
                  label="Password"
                  type="password"
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
                {createForm.role === "STUDENT" ? (
                  <Input
                    label="Class ID"
                    value={createForm.classId}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, classId: event.target.value }))
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
                    setLinkForm((current) => ({ ...current, parentId: event.target.value }))
                  }
                />
                <Input
                  label="Student profile ID"
                  value={linkForm.studentId}
                  onChange={(event) =>
                    setLinkForm((current) => ({ ...current, studentId: event.target.value }))
                  }
                />
                <Button onClick={handleLinkParent} disabled={!token}>
                  Link parent
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={fetchUsers} disabled={!token || usersState.status === "loading"}>
              {usersState.status === "loading" ? "Refreshing..." : "Refresh user list"}
            </Button>
          </div>

          {usersState.status === "error" ? (
            <StatusBlock tone="negative" title="User fetch failed" description={usersState.error ?? ""} />
          ) : null}

          {usersState.data ? (
            <DataTable
              columns={["Role", "Email", "Name", "Active", "Profile ID", "Class", "Actions"]}
              rows={usersState.data.map((user) => [
                user.role,
                user.email,
                user.name ?? "-",
                user.isActive ? "Yes" : "No",
                user.teacherId ?? user.studentId ?? user.parentId ?? "-",
                user.classLevel ? `Class ${user.classLevel}` : "-",
                <Button
                  key={user.id}
                  variant="ghost"
                  onClick={() => void handleDeactivate(user.id, user.isActive)}
                >
                  {user.isActive ? "Deactivate" : "Activate"}
                </Button>
              ])}
            />
          ) : (
            <p className="text-sm text-ink-soft">No users loaded yet.</p>
          )}
        </Card>
      </div>
    </RequireRole>
  );
}
