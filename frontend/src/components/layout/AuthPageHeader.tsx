"use client";

import type { ReactNode } from "react";

import { Logo } from "@/components/ui/Logo";

export function AuthPageHeader({ action }: { action?: ReactNode }) {
  return (
    <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
      <div className="hidden md:block" />
      <div className="flex justify-center">
        <Logo variant="full" size="lg" />
      </div>
      <div className="flex justify-center md:justify-end">{action}</div>
    </div>
  );
}
