"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/Button";

export function UnauthorizedClient() {
  const params = useSearchParams();
  const from = params.get("from");

  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl rounded-[var(--radius)] bg-surface px-8 py-12 shadow-[var(--shadow)]">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">Access denied</p>
        <h1 className="mt-4 font-display text-3xl font-semibold">
          This space belongs to another role.
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          Your account doesn’t have permission to view this page.
          {from ? ` Attempted path: ${from}` : ""}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/signin">
            <Button>Switch account</Button>
          </Link>
          <Link href="/">
            <Button variant="ghost">Back to home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
