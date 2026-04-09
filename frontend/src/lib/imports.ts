"use client";

import * as XLSX from "xlsx";
import { z } from "zod";

export type ImportKind = "students" | "teachers";

export type ImportPreviewRow = {
  rowNumber: number;
  status: "valid" | "invalid";
  errors: string[];
  values: Record<string, string>;
};

export type ImportPreviewResult = {
  rows: ImportPreviewRow[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
};

const studentSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  className: z.string().trim().min(1, "Class is required"),
  sectionName: z.string().trim().min(1, "Section is required"),
  parentEmail: z.string().trim().email("Valid parent email is required")
});

const teacherSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  phone: z.string().trim().optional(),
  subject: z.string().trim().optional()
});

export const studentImportColumns = [
  "name",
  "email",
  "className",
  "sectionName",
  "parentEmail"
] as const;

export const teacherImportColumns = ["name", "email", "phone"] as const;

export const studentSampleRow = {
  name: "Aarav Sharma",
  email: "aarav@example.com",
  className: "Class 10",
  sectionName: "A",
  parentEmail: "parent@example.com"
};

export const teacherSampleRow = {
  name: "Riya Singh",
  email: "riya@example.com",
  phone: "+91-9000000000"
};

function normalizeImportKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

function normalizeImportRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      normalizeImportKey(key),
      typeof value === "string" ? value.trim() : String(value ?? "").trim()
    ])
  ) as Record<string, string>;
}

function firstNonEmptyValue(row: Record<string, string>, ...keys: string[]) {
  return keys.find((key) => row[key]?.trim()) ? row[keys.find((key) => row[key]?.trim()) as string] : "";
}

async function readImportRows(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("The selected file does not contain any readable rows.");
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: ""
  });
}

function buildStudentPreview(rows: Record<string, unknown>[]): ImportPreviewResult {
  const previewRows = rows.map((row, index) => {
    const normalized = normalizeImportRow(row);
    const candidate = {
      name: firstNonEmptyValue(normalized, "name", "studentname"),
      email: firstNonEmptyValue(normalized, "email", "studentemail"),
      className: firstNonEmptyValue(normalized, "classname", "class"),
      sectionName: firstNonEmptyValue(normalized, "sectionname", "section"),
      parentEmail: firstNonEmptyValue(normalized, "parentemail")
    };
    const parsed = studentSchema.safeParse(candidate);

    return {
      rowNumber: index + 2,
      status: parsed.success ? "valid" : "invalid",
      errors: parsed.success ? [] : parsed.error.issues.map((issue) => issue.message),
      values: {
        name: candidate.name,
        email: candidate.email,
        className: candidate.className,
        sectionName: candidate.sectionName,
        parentEmail: candidate.parentEmail
      }
    } satisfies ImportPreviewRow;
  });

  return {
    rows: previewRows,
    totalRows: previewRows.length,
    validCount: previewRows.filter((row) => row.status === "valid").length,
    invalidCount: previewRows.filter((row) => row.status === "invalid").length
  };
}

function buildTeacherPreview(rows: Record<string, unknown>[]): ImportPreviewResult {
  const previewRows = rows.map((row, index) => {
    const normalized = normalizeImportRow(row);
    const candidate = {
      name: firstNonEmptyValue(normalized, "name"),
      email: firstNonEmptyValue(normalized, "email"),
      phone: firstNonEmptyValue(normalized, "phone", "contact"),
      subject: firstNonEmptyValue(normalized, "subject")
    };
    const parsed = teacherSchema.safeParse(candidate);

    return {
      rowNumber: index + 2,
      status: parsed.success ? "valid" : "invalid",
      errors: parsed.success ? [] : parsed.error.issues.map((issue) => issue.message),
      values: {
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        subject: candidate.subject
      }
    } satisfies ImportPreviewRow;
  });

  return {
    rows: previewRows,
    totalRows: previewRows.length,
    validCount: previewRows.filter((row) => row.status === "valid").length,
    invalidCount: previewRows.filter((row) => row.status === "invalid").length
  };
}

export async function buildImportPreview(kind: ImportKind, file: File) {
  const rows = await readImportRows(file);
  return kind === "students" ? buildStudentPreview(rows) : buildTeacherPreview(rows);
}

function escapeCsvValue(value: string) {
  const safeValue = value ?? "";
  return /[",\n]/.test(safeValue) ? `"${safeValue.replace(/"/g, "\"\"")}"` : safeValue;
}

function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob([rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n")], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadSampleCsv(kind: ImportKind) {
  if (kind === "students") {
    downloadCsv("students-sample.csv", [Array.from(studentImportColumns), studentImportColumns.map((key) => studentSampleRow[key])]);
    return;
  }

  downloadCsv("teachers-sample.csv", [Array.from(teacherImportColumns), teacherImportColumns.map((key) => teacherSampleRow[key])]);
}

export function downloadErrorCsv(kind: ImportKind, rows: ImportPreviewRow[]) {
  const invalidRows = rows.filter((row) => row.status === "invalid");
  const header =
    kind === "students"
      ? ["rowNumber", "message", "name", "email", "className", "sectionName", "parentEmail"]
      : ["rowNumber", "message", "name", "email", "phone", "subject"];

  const data = invalidRows.map((row) =>
    kind === "students"
      ? [
          String(row.rowNumber),
          row.errors.join("; "),
          row.values.name ?? "",
          row.values.email ?? "",
          row.values.className ?? "",
          row.values.sectionName ?? "",
          row.values.parentEmail ?? ""
        ]
      : [
          String(row.rowNumber),
          row.errors.join("; "),
          row.values.name ?? "",
          row.values.email ?? "",
          row.values.phone ?? "",
          row.values.subject ?? ""
        ]
  );

  downloadCsv(`${kind}-import-errors.csv`, [header, ...data]);
}
