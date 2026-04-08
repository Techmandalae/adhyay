"use client";

import type { ReactNode } from "react";

import { BrandLockup } from "@/components/layout/BrandLockup";

export function AuthPageHeader({ action }: { action?: ReactNode }) {
  return (
    <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
      <div className="hidden md:block" />
      <BrandLockup href="/" size="lg" className="justify-center" />
      <div className="flex justify-center md:justify-end">{action}</div>
    </div>
  );
}
