"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLockup } from "@/components/layout/BrandLockup";
import { Button } from "@/components/ui/Button";
import { getRoleRoute } from "@/lib/auth";

function getProfileHref(role?: string) {
  switch (role) {
    case "TEACHER":
      return "/teacher/profile";
    case "STUDENT":
      return "/student/profile";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/admin/profile";
    case "PARENT":
      return "/parent/profile";
    default:
      return "/";
  }
}

export function TopNav() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const dashboardHref = getRoleRoute(user?.role);
  const profileHref = getProfileHref(user?.role);

  const identityLabel = user
    ? `${user.name ?? user.email ?? "User"} | ID: ${user.publicId ?? user.id}`
    : null;

  useEffect(() => {
    router.prefetch(dashboardHref);
    router.prefetch(profileHref);
  }, [dashboardHref, profileHref, router]);

  return (
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
        <div className="hidden md:block" />

        <BrandLockup href={dashboardHref} className="justify-center" />

        <div className="flex flex-wrap items-center justify-center gap-3 md:justify-end">
        {user ? (
          <>
            {identityLabel ? (
              <Link
                href={profileHref}
                className="rounded-full px-3 py-2 text-sm font-medium text-foreground transition hover:bg-white"
              >
                {identityLabel}
              </Link>
            ) : null}
            <Button variant="outline" onClick={signOut}>
              Logout
            </Button>
          </>
        ) : (
          <Link href="/signin">
            <Button>Sign in</Button>
          </Link>
        )}
        </div>
      </div>
    </header>
  );
}
