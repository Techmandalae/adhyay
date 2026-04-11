"use client";

import dynamic from "next/dynamic";

const AuthRoleMotion = dynamic(
  () => import("./AuthRoleMotion").then((module) => module.AuthRoleMotion),
  {
    ssr: false,
    loading: () => <div className="auth-role-motion auth-role-motion--loading" aria-hidden="true" />
  }
);

type AuthMotionRole = "school" | "teacher" | "student" | "parent";

type AuthRoleMotionPanelProps = {
  role: AuthMotionRole;
  title: string;
  subtitle: string;
  active?: boolean;
};

const roleLabels: Record<AuthMotionRole, string> = {
  school: "Admin workspace",
  teacher: "Teacher workspace",
  student: "Student workspace",
  parent: "Parent workspace"
};

export function AuthRoleMotionPanel({
  role,
  title,
  subtitle,
  active = true
}: AuthRoleMotionPanelProps) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:gap-4">
      <div className="rounded-[var(--radius)] border border-border bg-white/72 p-6 shadow-[var(--shadow)] backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">{roleLabels[role]}</p>
        <h2 className="mt-3 font-display text-2xl font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>
      </div>
      <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-white/70 p-4 shadow-[var(--shadow)] backdrop-blur">
        <AuthRoleMotion role={role} active={active} />
      </div>
    </aside>
  );
}
