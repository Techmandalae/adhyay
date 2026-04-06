import { Suspense } from "react";

import VerifyOTP from "./VerifyOTP";

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <div className="app-shell min-h-screen px-6 py-16">
          <div className="mx-auto max-w-xl rounded-[var(--radius)] bg-surface px-8 py-12 shadow-[var(--shadow)]">
            <p className="text-sm text-ink-soft">Loading...</p>
          </div>
        </div>
      }
    >
      <VerifyOTP />
    </Suspense>
  );
}
