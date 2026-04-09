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
import { changePassword } from "@/lib/api";
import { APP_NAME } from "@/lib/branding";

export function ChangePasswordForm() {
  const router = useRouter();
  const { token, signIn, signOut } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!token) {
      setStatus({ type: "error", message: "Your session has expired. Please sign in again." });
      return;
    }

    if (oldPassword.trim().length < 6) {
      setStatus({ type: "error", message: "Current password is required." });
      return;
    }

    if (newPassword.trim().length < 6) {
      setStatus({ type: "error", message: "New password must be at least 6 characters." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }

    if (oldPassword === newPassword) {
      setStatus({
        type: "error",
        message: "New password must be different from your temporary password."
      });
      return;
    }

    setStatus({ type: "loading" });

    try {
      const response = await changePassword(token, {
        oldPassword: oldPassword.trim(),
        newPassword: newPassword.trim()
      });

      if (response.token) {
        signIn(response.token);
      }

      setStatus({
        type: "success",
        message: response.message || "Password updated successfully."
      });

      window.setTimeout(() => {
        router.replace("/dashboard");
      }, 1000);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Password update failed"
      });
    }
  };

  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <AuthPageHeader />
        <Card className="bg-white/80">
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Security update</p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Change your password</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Use your temporary password once, then set a new password to continue into {APP_NAME}.
          </p>
          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            <Input
              label="Temporary password"
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              autoComplete="current-password"
              disabled={status.type === "loading"}
              required
            />
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              disabled={status.type === "loading"}
              required
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              disabled={status.type === "loading"}
              required
            />
            {status.type === "success" ? (
              <StatusBlock
                tone="positive"
                title="Password updated"
                description={status.message ?? ""}
              />
            ) : null}
            {status.type === "error" ? (
              <StatusBlock
                tone="negative"
                title="Password update failed"
                description={status.message ?? ""}
              />
            ) : null}
            {!token ? (
              <StatusBlock
                tone="negative"
                title="Sign in required"
                description="Your session is missing. Sign in with the temporary password from your email."
              />
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={status.type === "loading" || !token}>
                {status.type === "loading" ? "Updating..." : "Update password"}
              </Button>
              <Link
                href="/signin"
                className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent"
              >
                Back to sign in
              </Link>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  signOut();
                  router.replace("/signin");
                }}
              >
                Sign out
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
