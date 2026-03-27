"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { UserRole } from "@/types/auth";
import { useAuth } from "./AuthProvider";

type RequireRoleProps = {
  roles?: UserRole[];
  children: React.ReactNode;
};

export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.replace(`/signin?next=${encodeURIComponent(pathname ?? "/")}`);
      return;
    }
    if (!user) {
      router.replace(`/signin?next=${encodeURIComponent(pathname ?? "/")}`);
      return;
    }
    if (roles && !roles.includes(user.role)) {
      router.replace(`/unauthorized?from=${encodeURIComponent(pathname ?? "/")}`);
    }
  }, [isLoading, user, router, roles, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-soft">
        Loading session...
      </div>
    );
  }

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (!token) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (roles && !roles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
