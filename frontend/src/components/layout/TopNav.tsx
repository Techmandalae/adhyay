"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
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

  const navItems = useMemo(
    () =>
      user?.role === "TEACHER"
        ? [
            { href: "/dashboard", label: "Dashboard" },
            { href: "/exams/new", label: "New Exam" },
            { href: "/exams/history", label: "History" },
            { href: "/evaluations/pending", label: "Reviews" },
            { href: "/reports", label: "Reports" }
          ]
        : user?.role === "STUDENT"
          ? [
              { href: "/dashboard", label: "Dashboard" },
              { href: "/analytics/class", label: "Analytics" },
              { href: "/reports", label: "Reports" },
              { href: "/student/results", label: "Results" }
            ]
          : user?.role === "ADMIN"
            ? [
                { href: "/dashboard", label: "Dashboard" },
                { href: "/analytics/class", label: "Analytics" },
                { href: "/reports", label: "Reports" },
                { href: "/admin#users", label: "Users" }
              ]
            : [],
    [user?.role]
  );

  const identityLabel = user
    ? `${user.name ?? user.email ?? "User"} | ID: ${user.publicId ?? user.id}`
    : null;

  useEffect(() => {
    router.prefetch(dashboardHref);
    router.prefetch(profileHref);
    navItems.forEach((item) => router.prefetch(item.href));
  }, [dashboardHref, navItems, profileHref, router]);

  return (
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
        {navItems.length > 0 ? (
          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-full px-3 py-2 text-sm font-medium text-foreground transition hover:bg-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
        </div>

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
