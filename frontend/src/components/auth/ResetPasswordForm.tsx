"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { resetPassword } from "@/lib/api";
import { APP_NAME } from "@/lib/branding";

export function ResetPasswordForm({ token }: { token?: string | null }) {
  const router = useRouter();
  const { signIn } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{
    type: "idle" | "success" | "error" | "loading";
    message?: string;
  }>({ type: "idle" });

  const resolvedToken = token?.trim() ?? "";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!resolvedToken) {
      setStatus({ type: "error", message: "Reset token is missing." });
      return;
    }

    if (newPassword.trim().length < 6) {
      setStatus({ type: "error", message: "Password must be at least 6 characters." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }

    setStatus({ type: "loading" });

    try {
      const response = await resetPassword({
        token: resolvedToken,
        newPassword: newPassword.trim()
      });
      setStatus({ type: "success", message: response.message });
      if (response.token) {
        signIn(response.token);
        window.setTimeout(() => router.push("/dashboard"), 1200);
        return;
      }
      window.setTimeout(() => router.push("/signin"), 1500);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Password reset failed"
      });
    }
  };

  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <AuthPageHeader />
        <Card className="bg-white/80">
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Password recovery</p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Set password</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Create a new password for your {APP_NAME} account.
          </p>
          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            {!resolvedToken ? (
              <StatusBlock
                tone="negative"
                title="Invalid link"
                description="This password setup link is missing the required token."
              />
            ) : null}
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={!resolvedToken}
              required
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={!resolvedToken}
              required
            />
            {status.type === "success" ? (
              <StatusBlock tone="positive" title="Password updated" description={status.message ?? ""} />
            ) : null}
            {status.type === "error" ? (
              <StatusBlock tone="negative" title="Reset failed" description={status.message ?? ""} />
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={status.type === "loading" || !resolvedToken}>
                {status.type === "loading" ? "Updating..." : "Update password"}
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
