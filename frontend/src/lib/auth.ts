import type { UserRole } from "@/types/auth";

export function getRoleRoute(role?: UserRole) {
  switch (role) {
    case "SUPER_ADMIN":
      return "/platform";
    case "ADMIN":
      return "/admin";
    case "TEACHER":
      return "/teacher";
    case "STUDENT":
      return "/student";
    case "PARENT":
      return "/parent";
    default:
      return "/";
  }
}
