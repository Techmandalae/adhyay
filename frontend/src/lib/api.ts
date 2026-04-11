import type { EvaluationDetail, EvaluationSummary, EvaluationResult } from "@/types/evaluation";
import type {
  ExamDetailResponse,
  ExamListResponse,
  GenerateExamInput,
  GenerateExamResponse
} from "@/types/exam";
import type {
  AcademicBooksResponse,
  AcademicChaptersResponse,
  AcademicBook,
  AcademicClass,
  AcademicSubject,
  TeacherCatalogResponse
} from "@/types/academic";
import type {
  AdminAnalyticsResponse,
  ParentAnalyticsResponse,
  StudentAnalyticsResponse,
  TeacherAnalyticsResponse
} from "@/types/analytics";
import type { NotificationDispatchSummary } from "@/types/notifications";
import type { AuthUser } from "@/types/auth";

const DEFAULT_API_BASE =
  process.env.NODE_ENV === "production"
    ? "https://api.adhyay.techmandalae.com"
    : "http://localhost:4000";
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  DEFAULT_API_BASE
).replace(/\/+$/, "");

const GET_CACHE_TTL_MS = 5 * 60 * 1000;
const HOT_CACHE_TTL_MS = 30 * 1000;
const ANALYTICS_CACHE_TTL_MS = 60 * 1000;
const getCache = new Map<
  string,
  {
    expiresAt: number;
    data?: unknown;
    promise?: Promise<unknown>;
  }
>();

/* =======================
   Core API Helper
======================= */

export class ApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function fetchWithCache<T>(
  url: string,
  init?: RequestInit & { ttlMs?: number }
) {
  const ttlMs = init?.ttlMs ?? GET_CACHE_TTL_MS;
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  const authKey = headers.get("Authorization") ?? "public";
  const cacheKey = `${method}:${url}:${authKey}`;
  const cached = getCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    if (cached.data !== undefined) {
      return cached.data as T;
    }
    if (cached.promise) {
      return (await cached.promise) as T;
    }
  }

  const request = fetch(url, init).then(async (response) => {
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as T) : (null as T);

    if (!response.ok) {
      getCache.delete(cacheKey);
      const errorMessage =
        (payload as { error?: { message?: string } })?.error?.message ??
        (payload as { error?: string })?.error ??
        (payload as { message?: string })?.message ??
        `Request failed with status ${response.status}`;
      throw new ApiError(errorMessage, response.status, payload);
    }

    getCache.set(cacheKey, {
      data: payload,
      expiresAt: Date.now() + ttlMs
    });

    return payload;
  });

  getCache.set(cacheKey, {
    promise: request,
    expiresAt: now + ttlMs
  });

  return (await request) as T;
}

export function invalidateApiCache(match?: string) {
  if (!match) {
    getCache.clear();
    return;
  }

  for (const key of getCache.keys()) {
    if (key.includes(match)) {
      getCache.delete(key);
    }
  }
}

/* =======================
   Auth
======================= */

export async function login(payload: {
  email: string;
  password: string;
  schoolId?: string;
}) {
  return apiFetch<{ token: string; user?: AuthUser }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify(payload) },
    null
  );
}

export async function registerSchool(payload: {
  schoolName: string;
  adminName: string;
  email: string;
  password: string;
  location: string;
  adminContactNumber: string;
  domain?: string;
}) {
  return apiFetch<{ schoolId: string; adminId: string; status: string }>(
    "/auth/register-school",
    {
      method: "POST",
      body: JSON.stringify({
        schoolName: payload.schoolName,
        adminName: payload.adminName,
        email: payload.email,
        password: payload.password,
        location: payload.location,
        adminContactNumber: payload.adminContactNumber,
        domain: payload.domain
      })
    },
    null
  );
}

export async function registerTeacher(payload: {
  schoolId?: string;
  email: string;
  password: string;
  name: string;
  employeeId?: string;
}) {
  return apiFetch<{ id: string; approvalStatus: string; schoolId: string; canPublish: boolean }>(
    "/auth/register-teacher",
    { method: "POST", body: JSON.stringify(payload) },
    null
  );
}

export async function registerStudent(payload: {
  schoolId: string;
  email: string;
  password: string;
  name: string;
  classId: string;
  rollNumber: string;
  dateOfBirth: string;
}) {
  return apiFetch<{ id: string; approvalStatus: string }>(
    "/auth/register-student",
    { method: "POST", body: JSON.stringify(payload) },
    null
  );
}

export async function registerParent(payload: {
  schoolId: string;
  email: string;
  password: string;
  studentRollNumber: string;
  studentDob: string;
}) {
  return apiFetch<{ id: string; approvalStatus: string }>(
    "/auth/register-parent",
    { method: "POST", body: JSON.stringify(payload) },
    null
  );
}

export async function requestPasswordReset(payload: {
  email: string;
  schoolId?: string;
}) {
  return apiFetch<{ message: string }>(
    "/auth/forgot-password",
    { method: "POST", body: JSON.stringify(payload) },
    null
  );
}

export async function resetPassword(payload: {
  token: string;
  newPassword: string;
}) {
  return apiFetch<{ message: string; token?: string; user?: AuthUser }>(
    "/auth/reset-password",
    { method: "POST", body: JSON.stringify(payload) },
    null
  );
}

export async function changePassword(
  token: string,
  payload: { oldPassword: string; newPassword: string }
) {
  return apiFetch<{ message: string; token?: string; user?: AuthUser }>(
    "/auth/change-password",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export async function requestEmailVerification(token: string) {
  return apiFetch<{ message: string }>(
    "/auth/request-email-verification",
    { method: "POST" },
    token
  );
}

export async function verifyOtp(payload: {
  email: string;
  otp: string;
  schoolId?: string;
}) {
  return apiFetch<{ message: string }>(
    "/auth/verify-otp",
    { method: "POST", body: JSON.stringify(payload) },
    null
  );
}

export async function resendOtp(payload: {
  email: string;
  schoolId?: string;
}) {
  return apiFetch<{ message: string }>(
    "/auth/resend-otp",
    { method: "POST", body: JSON.stringify(payload) },
    null
  );
}

/* =======================
   Admin Users
======================= */

export type AdminUser = {
  id: string;
  role: "TEACHER" | "STUDENT" | "PARENT";
  email: string;
  name: string | null;
  isActive: boolean;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  teacherId: string | null;
  studentId: string | null;
  parentId: string | null;
  classId: string | null;
  classLevel: number | null;
  sectionId?: string | null;
};

export type TeacherRequest = {
  id: string;
  email: string;
  name: string | null;
  approvalStatus: string;
  teacherId: string | null;
};

export type StudentRequest = {
  id: string;
  email: string;
  name: string | null;
  approvalStatus: string;
  studentProfile?: {
    id: string;
    classId: string;
    classLevel: number;
    rollNumber?: string | null;
  } | null;
};

export type ParentRequest = {
  id: string;
  email: string;
  name: string | null;
  approvalStatus: string;
};

export type BulkImportError = {
  rowNumber: number;
  message: string;
  values?: Record<string, string>;
};

export type BulkImportResponse = {
  message: string;
  importedCount: number;
  totalRows?: number;
  failedCount?: number;
  errors?: BulkImportError[];
};

export type ExamTemplate = {
  id: string;
  name: string;
  sections: unknown;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSchool = {
  id: string;
  name: string;
  email: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  aiMonthlyLimit: number;
  createdAt: string;
};

export type PlatformOverview = {
  schoolsRegistered: number;
  teachersRegistered: number;
  examsGenerated: number;
  aiUsage: {
    totalRequests: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
  };
};

type VerificationFields = {
  emailVerified?: boolean;
};

export type TeacherProfile = VerificationFields & {
  role: "TEACHER";
  fullName: string;
  email: string;
  contact: string;
  subject: string;
  location: string;
  linkedin: string;
  experience: string;
  education: string;
};

export type StudentProfile = VerificationFields & {
  role: "STUDENT";
  fullName: string;
  className: string;
  section: string;
  rollNumber: string;
  phoneNumber: string;
  email: string;
  location: string;
  dob: string;
};

export type BasicProfile = VerificationFields & {
  role: "ADMIN" | "SUPER_ADMIN" | "PARENT";
  fullName: string;
  email: string;
  contact: string;
  location: string;
};

export type UserProfile = TeacherProfile | StudentProfile | BasicProfile;

export async function listUsers(token: string, params?: { role?: AdminUser["role"]; query?: string }) {
  const query = new URLSearchParams();
  if (params?.role) query.set("role", params.role);
  if (params?.query) query.set("query", params.query);
  const suffix = query.toString() ? `?${query}` : "";
  return apiFetch<{ items: AdminUser[] }>(`/admin/users${suffix}`, { method: "GET" }, token);
}

export async function getAdminMetrics(token: string) {
  return apiFetch<{ totalExamsGenerated: number; activeTeachers: number }>(
    "/admin/metrics",
    { method: "GET" },
    token
  );
}

export async function listTeacherRequests(token: string) {
  return apiFetch<{ items: TeacherRequest[] }>(
    "/admin/teacher-requests",
    { method: "GET" },
    token
  );
}

export async function approveTeacherRequest(token: string, userId: string, classIds?: string[]) {
  return apiFetch<{ id: string; approvalStatus: string }>(
    `/admin/teacher-requests/${userId}/approve`,
    { method: "POST", body: JSON.stringify({ classIds }) },
    token
  );
}

export async function rejectTeacherRequest(token: string, userId: string) {
  return apiFetch<{ id: string; approvalStatus: string }>(
    `/admin/teacher-requests/${userId}/reject`,
    { method: "POST" },
    token
  );
}

export async function listStudentRequests(token: string) {
  return apiFetch<{ items: StudentRequest[] }>(
    "/teacher/student-requests",
    { method: "GET" },
    token
  );
}

export async function approveStudentRequest(token: string, userId: string) {
  return apiFetch<{ id: string; approvalStatus: string }>(
    `/teacher/student-requests/${userId}/approve`,
    { method: "POST" },
    token
  );
}

export async function rejectStudentRequest(token: string, userId: string) {
  return apiFetch<{ id: string; approvalStatus: string }>(
    `/teacher/student-requests/${userId}/reject`,
    { method: "POST" },
    token
  );
}

export async function listParentRequests(token: string) {
  return apiFetch<{ items: ParentRequest[] }>(
    "/teacher/parent-requests",
    { method: "GET" },
    token
  );
}

export async function approveParentRequest(token: string, parentId: string) {
  return apiFetch<{ id: string; approvalStatus: string }>(
    `/teacher/parent-requests/${parentId}/approve`,
    { method: "POST" },
    token
  );
}

export async function rejectParentRequest(token: string, parentId: string) {
  return apiFetch<{ id: string; approvalStatus: string }>(
    `/teacher/parent-requests/${parentId}/reject`,
    { method: "POST" },
    token
  );
}

export async function getTemplates(token: string) {
  return apiFetch<{ items: ExamTemplate[] }>(
    "/templates",
    { method: "GET" },
    token
  );
}

export async function createTemplate(token: string, payload: { name: string; sections: unknown[] }) {
  return apiFetch<ExamTemplate>(
    "/templates",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export async function updateTemplate(
  token: string,
  templateId: string,
  payload: { name: string; sections: unknown[] }
) {
  return apiFetch<ExamTemplate>(
    `/templates/${templateId}`,
    { method: "PUT", body: JSON.stringify(payload) },
    token
  );
}

export async function deleteTemplate(token: string, templateId: string) {
  await apiFetch<void>(`/templates/${templateId}`, { method: "DELETE" }, token);
}

export async function listPlatformSchools(token: string) {
  return apiFetch<{ items: PlatformSchool[] }>(
    "/platform/schools",
    { method: "GET" },
    token
  );
}

export async function getPlatformOverview(token: string) {
  return apiFetch<PlatformOverview>(
    "/platform/overview",
    { method: "GET" },
    token
  );
}

export async function approveSchool(
  token: string,
  schoolId: string,
  aiMonthlyLimit?: number
) {
  return apiFetch<{ id: string; status: string; aiMonthlyLimit: number }>(
    `/platform/schools/${schoolId}/approve`,
    { method: "POST", body: JSON.stringify({ aiMonthlyLimit }) },
    token
  );
}

export async function suspendSchool(token: string, schoolId: string) {
  return apiFetch<{ id: string; status: string }>(
    `/platform/schools/${schoolId}/suspend`,
    { method: "POST" },
    token
  );
}

export async function createUser(
  token: string,
  payload: {
    role: AdminUser["role"];
    email: string;
    name?: string;
    password: string;
    classId?: string;
  }
) {
  return apiFetch<AdminUser>(
    "/admin/users",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export async function updateUser(
  token: string,
  userId: string,
  payload: {
    email?: string;
    name?: string;
    password?: string;
    isActive?: boolean;
    classId?: string;
  }
) {
  return apiFetch<AdminUser>(
    `/admin/users/${userId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  );
}

export async function linkParentToStudent(
  token: string,
  parentId: string,
  studentId: string
) {
  return apiFetch<{ id: string; parentId: string; studentId: string }>(
    `/admin/parents/${parentId}/links`,
    { method: "POST", body: JSON.stringify({ studentId }) },
    token
  );
}

export async function unlinkParentStudent(
  token: string,
  parentId: string,
  studentId: string
) {
  await apiFetch<void>(
    `/admin/parents/${parentId}/links/${studentId}`,
    { method: "DELETE" },
    token
  );
}

function getAuthToken(explicitToken?: string | null): string | null {
  if (explicitToken) {
    return explicitToken;
  }
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("token");
}

function getAuthHeaders(explicitToken?: string | null): Record<string, string> {
  const token = getAuthToken(explicitToken);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetchCached<T>(
  path: string,
  token: string | null = null,
  ttlMs = GET_CACHE_TTL_MS
): Promise<T> {
  return fetchWithCache<T>(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(token)
    },
    ttlMs
  });
}

async function apiFetch<T>(
  path: string,
  options: RequestInit,
  token: string | null = null
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
        ...getAuthHeaders(token)
      }
    });
  } catch (error) {
    console.error("API error:", error);
    throw error;
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const errorMessage =
      (payload as { error?: { message?: string } })?.error?.message ??
      (payload as { error?: string })?.error ??
      (payload as { message?: string })?.message ??
      undefined;
    throw new ApiError(
      errorMessage ?? `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  return payload as T;
}

/* =======================
   Exams
======================= */

export async function getExams(token: string, page = 1, pageSize = 20) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });
  return apiFetchCached<ExamListResponse>(`/exams?${query}`, token, HOT_CACHE_TTL_MS);
}

export async function getExamsByStatus(
  token: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
  page = 1,
  pageSize = 20
) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    status
  });
  return apiFetchCached<ExamListResponse>(`/exams?${query}`, token, HOT_CACHE_TTL_MS);
}

export async function getExamById(token: string, examId: string) {
  return apiFetch<ExamDetailResponse>(`/exams/${examId}`, { method: "GET" }, token);
}

export async function getAssignedExams(token: string) {
  return apiFetchCached<{ items: ExamListResponse["items"] }>(
    "/exams/student/exams",
    token,
    HOT_CACHE_TTL_MS
  );
}

export async function getAssignedExamById(token: string, examId: string) {
  return apiFetch<ExamDetailResponse>(
    `/exams/assigned/${examId}`,
    { method: "GET" },
    token
  );
}

export async function getExamPreview(token: string, examId: string) {
  return apiFetch<ExamDetailResponse>(
    `/exams/${examId}/preview`,
    { method: "GET" },
    token
  );
}

export async function getArchivedExams(token: string) {
  return apiFetchCached<{ items: ExamListResponse["items"] }>(
    "/exams/archived",
    token,
    HOT_CACHE_TTL_MS
  );
}

export async function generateExam(token: string, input: GenerateExamInput) {
  const response = await apiFetch<GenerateExamResponse>(
    "/exams/generate",
    { method: "POST", body: JSON.stringify(input) },
    token
  );
  invalidateApiCache("/exams?");
  invalidateApiCache("/analytics/");
  return response;
}

export async function publishExam(token: string, examId: string, assignedClassId: string) {
  const response = await apiFetch<{
    id: string;
    status: string;
    assignedClassId: string | null;
    assignedClassLevel: number | null;
    publishedAt?: string | null;
  }>(`/exams/${examId}/publish`, { method: "POST", body: JSON.stringify({ assignedClassId }) }, token);
  invalidateApiCache("/exams?");
  invalidateApiCache("/exams/student/exams");
  return response;
}

export async function archiveExam(token: string, examId: string) {
  const response = await apiFetch<{ id: string; status: string }>(
    `/exams/${examId}/archive`,
    { method: "POST" },
    token
  );
  invalidateApiCache("/exams?");
  invalidateApiCache("/exams/archived");
  return response;
}

export async function updateAnswerKeyRelease(
  token: string,
  examId: string,
  release: boolean
) {
  return apiFetch<{ id: string; answerKeyReleased: boolean }>(
    `/exams/${examId}/answer-key`,
    { method: "POST", body: JSON.stringify({ release }) },
    token
  );
}

export async function downloadExamPdf(token: string, examId: string) {
  const response = await fetch(`${API_BASE}/exams/${examId}/pdf`, {
    method: "GET",
    headers: getAuthHeaders(token)
  });

  if (!response.ok) {
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    throw new ApiError(
      (payload as { error?: { message?: string } })?.error?.message ??
        `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  return response.blob();
}

export async function downloadExamDocx(token: string, examId: string) {
  const response = await fetch(`${API_BASE}/exams/${examId}/docx`, {
    method: "GET",
    headers: getAuthHeaders(token)
  });

  if (!response.ok) {
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    throw new ApiError(
      (payload as { error?: { message?: string } })?.error?.message ??
        `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  return response.blob();
}

export async function downloadAnswerKeyPdf(token: string, examPaperId: string) {
  const response = await fetch(`${API_BASE}/exams/papers/${examPaperId}/answer-key`, {
    method: "GET",
    headers: getAuthHeaders(token)
  });

  if (!response.ok) {
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    throw new ApiError(
      (payload as { error?: { message?: string } })?.error?.message ??
        `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  return response.blob();
}

/* =======================
   Academic (Dropdowns)
======================= */

export async function getAcademicClasses(token: string | null) {
  return apiFetchCached<{ items: AcademicClass[] }>("/academic/classes", token);
}

export async function getAcademicSections(token: string | null) {
  return apiFetchCached<{ items: AcademicClass[] }>("/academic/sections", token);
}

export async function getTeacherCatalog(token: string) {
  return apiFetchCached<TeacherCatalogResponse>("/teacher/catalog", token);
}

export async function getAcademicSetup(token: string) {
  return apiFetchCached<{
    items: Array<{ id: string; name: string; hasStreams: boolean; sections: Array<{ id: string; name: string }> }>;
  }>("/admin/academic-setup", token);
}

export async function saveAcademicSetup(
  token: string,
  payload: { classes: Array<{ name: string; hasStreams: boolean; sections: string[] }> }
) {
  const response = await apiFetch<{ items: Array<{ id: string; name: string }> }>(
    "/admin/academic-setup",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
  invalidateApiCache("/admin/academic-setup");
  invalidateApiCache("/academic/classes");
  invalidateApiCache("/academic/sections");
  return response;
}

export async function uploadSchoolLogo(token: string, file: File) {
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/svg+xml"]);

  if (file.size > 2 * 1024 * 1024) {
    throw new ApiError("Max 2MB", 400);
  }

  if (!allowedTypes.has(file.type)) {
    throw new ApiError("Only PNG, JPEG, and SVG logos are allowed", 400);
  }

  const formData = new FormData();
  formData.append("logo", file, file.name);

  const response = await fetch("/api/upload-logo", {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "x-logo-size": String(file.size),
      "x-logo-type": file.type
    },
    body: formData
  });

  const text = await response.text();
  const payload = (() => {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  })();

  if (!response.ok) {
    throw new ApiError(
      (payload as { error?: { message?: string } })?.error?.message ??
        (payload as { error?: string })?.error ??
        (payload as { message?: string })?.message ??
        `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  const result = payload as { logoUrl?: string | null; url?: string | null; path?: string | null };
  return {
    logoUrl: result.logoUrl ?? result.url ?? "",
    url: result.url ?? result.logoUrl ?? null,
    path: result.path ?? null
  };
}

export async function deleteSchoolLogo(token: string) {
  const response = await fetch("/api/upload-logo", {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new ApiError(
      (payload as { error?: string })?.error ??
        (payload as { message?: string })?.message ??
        `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  return payload as { logoUrl: string | null; url?: string | null };
}

export async function importStudents(token: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/admin/import-students`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new ApiError(
      (payload as { error?: { message?: string } })?.error?.message ??
        (payload as { message?: string })?.message ??
        `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  return payload as BulkImportResponse;
}

export async function importTeachers(token: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/admin/import-teachers`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new ApiError(
      (payload as { error?: { message?: string } })?.error?.message ??
        (payload as { message?: string })?.message ??
        `Request failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  return payload as BulkImportResponse;
}

export async function getAcademicSubjects(token: string | null, classId: string) {
  const query = new URLSearchParams({ classId });
  return apiFetchCached<{ items: AcademicSubject[] }>(`/academic/subjects?${query}`, token);
}

export async function getAcademicSubjectsByClassId(
  token: string | null,
  classId: string
) {
  return apiFetchCached<{ items: AcademicSubject[] }>(`/academic/subjects/${classId}`, token);
}

export async function getSubjects(token: string | null, classId: string) {
  return getAcademicSubjectsByClassId(token, classId);
}

export async function loadSubjects(classId: string) {
  const url = `${API_BASE}/academic/subjects/${classId}`;
  return fetchWithCache<{ items: AcademicSubject[] }>(url);
}

export async function getAcademicBooksBySubjectId(
  token: string | null,
  classId: string,
  subjectId: string
) {
  const query = new URLSearchParams({ classId, subjectId });
  return fetchWithCache<{ ncertBooks: AcademicBook[]; referenceBooks: AcademicBook[] }>(
    `/api/books?${query}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(token)
      },
      ttlMs: GET_CACHE_TTL_MS
    }
  );
}

export async function getAcademicBooks(
  token: string | null,
  classId: string,
  subjectId: string
) {
  const query = new URLSearchParams({ classId, subjectId });
  return apiFetchCached<AcademicBooksResponse>(`/academic/books?${query}`, token);
}

export async function getAcademicChapters(
  token: string | null,
  bookId: string,
  classId?: string,
  subjectId?: string
) {
  const query = new URLSearchParams();
  if (classId) query.set("classId", classId);
  if (subjectId) query.set("subjectId", subjectId);
  const suffix = query.toString() ? `?${query}` : "";
  return apiFetchCached<AcademicChaptersResponse>(`/academic/chapters/${bookId}${suffix}`, token);
}

export async function getProfile(token: string) {
  return apiFetch<UserProfile>("/profile", { method: "GET" }, token);
}

export async function updateProfile(
  token: string,
  payload: Record<string, unknown>
) {
  return apiFetch<UserProfile>(
    "/profile",
    { method: "PUT", body: JSON.stringify(payload) },
    token
  );
}

/* =======================
   Submissions
======================= */

export async function uploadSubmission(
  token: string,
  examId: string,
  file: File | null,
  typedAnswers?: string
) {
  const formData = new FormData();
  formData.append("examId", examId);
  if (file) {
    formData.append("file", file);
  }
  if (typedAnswers && typedAnswers.trim().length > 0) {
    formData.append("typedAnswers", typedAnswers);
  }

  const response = await fetch(`${API_BASE}/submit`, {
    method: "POST",
    headers: getAuthHeaders(token),
    body: formData
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new ApiError(
      (payload as { error?: { message?: string } })?.error?.message ??
        `Upload failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  invalidateApiCache("/exams/student/exams");
  invalidateApiCache("/analytics/student");
  return payload as {
    message?: string;
    submissionId: string;
    evaluationId: string;
    status: string;
    score?: number;
    notifications?: NotificationDispatchSummary[];
  };
}

export async function submitTypedAnswers(
  token: string,
  examId: string,
  answers: Array<{ questionNumber: number; answer: string }>
) {
  return apiFetch<{ submissionId: string }>(
    "/submit",
    {
      method: "POST",
      body: JSON.stringify({ examId, answers })
    },
    token
  );
}

/* =======================
   Evaluations (FIXED)
======================= */

export async function getPendingEvaluations(token: string) {
  return apiFetchCached<{ items: EvaluationSummary[] }>(
    "/evaluations/pending",
    token,
    HOT_CACHE_TTL_MS
  );
}

export async function getEvaluation(token: string, submissionId: string) {
  return apiFetch<EvaluationDetail>(
    `/submissions/${submissionId}/evaluation`,
    { method: "GET" },
    token
  );
}

export async function reviewEvaluation(
  token: string,
  evaluationId: string,
  payload: {
    status: "APPROVED" | "REJECTED";
    teacherScore?: number;
    teacherResult?: EvaluationResult;
    rejectionReason?: string;
  }
) {
  const response = await apiFetch<EvaluationDetail>(
    `/evaluations/${evaluationId}/review`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  );
  invalidateApiCache("/evaluations/pending");
  invalidateApiCache("/analytics/");
  return response;
}

export async function approveSubmission(
  token: string,
  payload: {
    submissionId: string;
    teacherScore?: number;
    teacherResult?: EvaluationResult;
    rejectionReason?: string;
  }
) {
  const response = await apiFetch<{
    submissionId: string;
    status: string;
    teacherScore: number | null;
  }>(
    "/submission/approve",
    {
      method: "PUT",
      body: JSON.stringify(payload)
    },
    token
  );
  invalidateApiCache("/evaluations/pending");
  invalidateApiCache("/analytics/");
  return response;
}

/* =======================
   Analytics
======================= */

type AnalyticsQuery = {
  startDate?: string;
  endDate?: string;
  subject?: string;
  classLevel?: number;
  difficulty?: string;
  studentIds?: string[];
  teacherId?: string;
};

function buildAnalyticsQuery(params: AnalyticsQuery) {
  const query = new URLSearchParams();
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.subject) query.set("subject", params.subject);
  if (params.classLevel !== undefined) query.set("classLevel", String(params.classLevel));
  if (params.difficulty) query.set("difficulty", params.difficulty);
  if (params.studentIds?.length) query.set("studentIds", params.studentIds.join(","));
  if (params.teacherId) query.set("teacherId", params.teacherId);
  return query.toString() ? `?${query}` : "";
}

export async function getStudentAnalytics(token: string, params: AnalyticsQuery) {
  return apiFetchCached<StudentAnalyticsResponse>(
    `/analytics/student${buildAnalyticsQuery(params)}`,
    token,
    ANALYTICS_CACHE_TTL_MS
  );
}

export async function getStudentAnalyticsById(
  token: string,
  studentId: string,
  params: AnalyticsQuery = {}
) {
  return apiFetch<StudentAnalyticsResponse>(
    `/analytics/student/${studentId}${buildAnalyticsQuery(params)}`,
    { method: "GET" },
    token
  );
}

export async function getParentAnalytics(token: string, params: AnalyticsQuery) {
  return apiFetchCached<ParentAnalyticsResponse>(
    `/analytics/parent${buildAnalyticsQuery(params)}`,
    token,
    ANALYTICS_CACHE_TTL_MS
  );
}

export async function getParentChildren(token: string) {
  return apiFetch<{ items: Array<{ id: string; name?: string; email?: string; classLevel?: number }> }>(
    "/parent/children",
    { method: "GET" },
    token
  );
}

export async function getParentChildAnalytics(token: string, studentId: string, params: AnalyticsQuery) {
  const query = buildAnalyticsQuery(params);
  return apiFetch<ParentAnalyticsResponse>(
    `/parent/children/${studentId}/analytics${query}`,
    { method: "GET" },
    token
  );
}

export async function getTeacherAnalytics(token: string, params: AnalyticsQuery) {
  return apiFetchCached<TeacherAnalyticsResponse>(
    `/analytics/teacher${buildAnalyticsQuery(params)}`,
    token,
    ANALYTICS_CACHE_TTL_MS
  );
}

export async function getAdminAnalytics(token: string, params: AnalyticsQuery) {
  return apiFetchCached<AdminAnalyticsResponse>(
    `/analytics/admin${buildAnalyticsQuery(params)}`,
    token,
    ANALYTICS_CACHE_TTL_MS
  );
}
