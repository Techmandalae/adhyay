"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
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
    <header className="border-b border-border bg-surface px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <Link href={dashboardHref} className="flex items-center gap-2">
          <Logo variant="full" size="md" className="h-14 w-auto" />
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-3">
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
