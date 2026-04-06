"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { login, resendOtp, verifyOtp } from "@/lib/api";
import {
  clearPendingVerification,
  getPendingVerification
} from "@/lib/auth";

export default function VerifyOtpPage() {
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
        router.push("/dashboard");
        return;
      }

      clearPendingVerification();
      setStatus({
        state: "success",
        message: response.message
      });
      router.push(
        `/signin?verified=1&email=${encodeURIComponent(email)}&schoolId=${encodeURIComponent(
          schoolId
        )}`
      );
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
          <form className="grid gap-4" onSubmit={handleVerify}>
            <Input
              label="OTP"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder="Enter OTP"
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
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={status.state === "loading" || !email}>
                {status.state === "loading" ? "Verifying..." : "Verify"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleResend}
                disabled={status.state === "loading" || !email}
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
