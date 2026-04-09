"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { requestPasswordReset } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [status, setStatus] = useState<{
    type: "idle" | "success" | "error" | "loading";
    message?: string;
  }>({ type: "idle" });

  const isSuperAdmin = email.trim().toLowerCase().includes("superadmin");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ type: "loading" });

    try {
      const response = await requestPasswordReset({
        email: email.trim(),
        ...(isSuperAdmin ? {} : { schoolId: schoolId.trim() })
      });
      setStatus({ type: "success", message: response.message });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to send reset link"
      });
    }
  };

  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <AuthPageHeader />
        <Card className="bg-white/80">
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Password recovery</p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Forgot password</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Enter your account email and school ID. Super admin accounts can reset without a
            school ID.
          </p>
          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            {!isSuperAdmin ? (
              <Input
                label="School ID"
                value={schoolId}
                onChange={(event) => setSchoolId(event.target.value)}
                required={!isSuperAdmin}
              />
            ) : null}
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            {status.type === "success" ? (
              <StatusBlock
                tone="positive"
                title="Reset link sent"
                description={status.message ?? ""}
              />
            ) : null}
            {status.type === "error" ? (
              <StatusBlock
                tone="negative"
                title="Reset request failed"
                description={status.message ?? ""}
              />
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={status.type === "loading"}>
                {status.type === "loading" ? "Sending..." : "Send reset link"}
              </Button>
              <Link
                href="/signin"
                className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
