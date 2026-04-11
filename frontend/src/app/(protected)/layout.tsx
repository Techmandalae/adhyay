"use client";

import type { ReactNode } from "react";

import { RequireRole } from "@/components/auth/RequireRole";
import { AppBackButton } from "@/components/common/AppBackButton";
import { TopNav } from "@/components/layout/TopNav";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole>
      <div className="app-shell min-h-screen">
        <TopNav />
        <main className="px-6 py-10">
          <AppBackButton />
          {children}
        </main>
      </div>
    </RequireRole>
  );
}
