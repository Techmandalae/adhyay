"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { getRoleRoute } from "@/lib/auth";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";

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
  const dashboardHref = getRoleRoute(user?.role);
  const profileHref = getProfileHref(user?.role);

  const navItems =
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
          : [];

  const identityLabel = user
    ? `${user.name ?? user.email ?? "User"} | ID: ${user.publicId ?? user.id}`
    : null;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
      <Link href={dashboardHref} className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-accent text-center text-xl font-black text-white shadow-[0_12px_20px_rgba(255,107,53,0.3)]">
          A
        </div>
        <div>
          <p className="font-display text-lg font-semibold">{APP_NAME}</p>
          <p className="text-xs text-ink-soft">{APP_TAGLINE}</p>
        </div>
      </Link>

      <div className="flex flex-wrap items-center gap-3">
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
    </header>
  );
}
