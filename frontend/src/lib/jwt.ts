import type { AuthUser } from "@/types/auth";

function base64UrlDecode(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return atob(padded);
}

export function decodeJwt(token: string): AuthUser | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
    const role = payload.role;
    const id = payload.id;
    if (typeof role !== "string" || typeof id !== "string") {
      return null;
    }

    return {
      id,
      role: role as AuthUser["role"],
      approvalStatus:
        typeof payload.approvalStatus === "string" ? (payload.approvalStatus as AuthUser["approvalStatus"]) : undefined,
      schoolStatus:
        typeof payload.schoolStatus === "string" ? (payload.schoolStatus as AuthUser["schoolStatus"]) : undefined,
      schoolId: typeof payload.schoolId === "string" ? payload.schoolId : undefined,
      teacherId: typeof payload.teacherId === "string" ? payload.teacherId : undefined,
      studentId: typeof payload.studentId === "string" ? payload.studentId : undefined,
      parentId: typeof payload.parentId === "string" ? payload.parentId : undefined,
      classId: typeof payload.classId === "string" ? payload.classId : undefined,
      sectionId: typeof payload.sectionId === "string" ? payload.sectionId : undefined,
      classLevel:
        typeof payload.classLevel === "number"
          ? payload.classLevel
          : typeof payload.classLevel === "string"
            ? Number(payload.classLevel)
            : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
      canPublish:
        typeof payload.canPublish === "boolean" ? payload.canPublish : undefined,
      isIndependentTeacher:
        typeof payload.isIndependentTeacher === "boolean"
          ? payload.isIndependentTeacher
          : undefined
    };
  } catch (_error) {
    return null;
  }
}
