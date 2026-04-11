"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";

const AuthRoleMotion = dynamic(
  () => import("./AuthRoleMotion").then((module) => module.AuthRoleMotion),
  {
    ssr: false,
    loading: () => <div className="auth-role-motion auth-role-motion--loading" aria-hidden="true" />
  }
);

type AuthMotionRole = "school" | "teacher" | "student" | "parent";

type AuthActionOverlayProps = {
  role: AuthMotionRole;
  title: string;
  subtitle: string;
};

export function AuthActionOverlay({ role, title, subtitle }: AuthActionOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
      animate={{ opacity: 1, backdropFilter: "blur(10px)" }}
      exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(245,242,237,0.76)] px-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        className="relative w-full max-w-4xl overflow-hidden rounded-[calc(var(--radius)+10px)] border border-[rgba(228,217,204,0.9)] bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(245,237,229,0.96))] p-5 shadow-[0_30px_80px_rgba(27,24,20,0.22)] md:p-8"
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-24 rounded-b-full bg-[radial-gradient(circle,rgba(15,139,141,0.16),transparent_70%)]" />
        <div className="pointer-events-none absolute -right-12 top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(255,107,53,0.14),transparent_68%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div className="space-y-3 text-center lg:text-left">
            <p className="text-xs uppercase tracking-[0.35em] text-accent">Please wait</p>
            <h2 className="font-display text-3xl font-semibold text-foreground">{title}</h2>
            <p className="max-w-xl text-sm text-ink-soft">{subtitle}</p>
          </div>
          <div className="hidden lg:block">
            <AuthRoleMotion role={role} />
          </div>
          <div className="flex justify-center lg:hidden">
            <div className="h-3 w-32 overflow-hidden rounded-full bg-[rgba(15,23,42,0.08)]">
              <div className="h-full w-1/2 rounded-full bg-[linear-gradient(90deg,#0f8b8d,#ff6b35)] animate-pulse" />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
