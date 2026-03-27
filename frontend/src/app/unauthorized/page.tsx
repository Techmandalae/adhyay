import { Suspense } from "react";

import { UnauthorizedClient } from "@/components/auth/UnauthorizedClient";

export default function UnauthorizedPage() {
  return (
    <Suspense
      fallback={
        <div className="app-shell min-h-screen px-6 py-16">
          <div className="mx-auto max-w-2xl rounded-[var(--radius)] bg-surface px-8 py-12 shadow-[var(--shadow)]">
            <p className="text-sm text-ink-soft">Loading…</p>
          </div>
        </div>
      }
    >
      <UnauthorizedClient />
    </Suspense>
  );
}
