import type { UserRole } from "@/types/auth";

const PENDING_VERIFICATION_KEY = "pending-verification";

export type PendingVerificationSession = {
  email: string;
  schoolId?: string;
  password?: string;
};

export function getRoleRoute(role?: UserRole) {
  switch (role) {
    case "SUPER_ADMIN":
      return "/platform";
    case "ADMIN":
      return "/dashboard";
    case "TEACHER":
      return "/dashboard";
    case "STUDENT":
      return "/dashboard";
    case "PARENT":
      return "/dashboard";
    default:
      return "/";
  }
}

export function setPendingVerification(session: PendingVerificationSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(session));
}

export function getPendingVerification(): PendingVerificationSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(PENDING_VERIFICATION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PendingVerificationSession;
  } catch {
    return null;
  }
}

export function clearPendingVerification() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
}
