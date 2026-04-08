"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthSecondaryAction } from "@/components/auth/AuthSecondaryAction";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { login, resendOtp, verifyOtp } from "@/lib/api";
import { clearPendingVerification, getPendingVerification } from "@/lib/auth";

export default function VerifyOTP() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });

  const email = searchParams.get("email") ?? "";
  const schoolId = searchParams.get("schoolId") ?? "";
  const pendingVerification = useMemo(() => getPendingVerification(), []);
  const isLoading = status.state === "loading";

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/signin");
  }, [router]);

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ state: "loading" });

    try {
      const response = await verifyOtp({
        email,
        otp: otp.trim(),
        ...(schoolId ? { schoolId } : {})
      });

      const hasSavedCredentials =
        pendingVerification?.email === email &&
        pendingVerification?.password &&
        (pendingVerification.schoolId ?? "") === schoolId;

      if (hasSavedCredentials) {
        const session = await login({
          email,
          password: pendingVerification.password as string,
          ...(schoolId ? { schoolId } : {})
        });
        signIn(session.token);
        clearPendingVerification();
        startTransition(() => {
          router.replace("/dashboard");
        });
        return;
      }

      clearPendingVerification();
      setStatus({
        state: "success",
        message: response.message
      });
      startTransition(() => {
        router.replace(
          `/signin?verified=1&email=${encodeURIComponent(email)}&schoolId=${encodeURIComponent(
            schoolId
          )}`
        );
      });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "OTP verification failed."
      });
    }
  };

  const handleResend = async () => {
    setStatus({ state: "loading" });
    try {
      const response = await resendOtp({
        email,
        ...(schoolId ? { schoolId } : {})
      });
      setStatus({
        state: "success",
        message: response.message
      });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Failed to resend OTP."
      });
    }
  };

  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-xl space-y-8">
        <AuthPageHeader action={<AuthSecondaryAction />} />
        <SectionHeader
          eyebrow="Email verification"
          title="Verify OTP"
          subtitle={
            email
              ? `Enter the 6-digit OTP sent to ${email}.`
              : "Enter the 6-digit OTP sent to your email."
          }
        />
        <Card className="space-y-6">
          {!email ? (
            <StatusBlock
              title="Missing verification details"
              description="Open this page from the registration flow so the email and school details are available."
              tone="negative"
            />
          ) : null}
          <form className="grid gap-4" onSubmit={handleVerify}>
            <Input
              label="OTP"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder="Enter OTP"
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={isLoading || !email}
              required
            />
            {status.state === "error" ? (
              <StatusBlock
                tone="negative"
                title="Verification failed"
                description={status.message ?? ""}
              />
            ) : null}
            {status.state === "success" ? (
              <StatusBlock tone="positive" title="OTP status" description={status.message ?? ""} />
            ) : null}
            {schoolId ? (
              <StatusBlock
                title="School ID"
                description={schoolId}
              />
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isLoading || !email}>
                {isLoading ? "Verifying..." : "Verify"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleResend}
                disabled={isLoading || !email}
              >
                Resend OTP
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
