"use client";

import { useState } from "react";

import { registerTeacher, resendOtp, verifyOtp } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";

export default function RegisterTeacherPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [otp, setOtp] = useState("");
  const [verification, setVerification] = useState<{
    email: string;
    schoolId?: string;
  } | null>(null);
  const [status, setStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });
  const [otpStatus, setOtpStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ state: "loading" });
    setOtpStatus({ state: "idle" });
    try {
      const response = await registerTeacher({
        schoolId: schoolId.trim() || undefined,
        email: email.trim(),
        password: password.trim(),
        name: name.trim()
      });
      setVerification({
        email: email.trim(),
        schoolId: response.schoolId
      });
      setStatus({
        state: "success",
        message: schoolId.trim()
          ? "Teacher account created and linked to the school. Enter the OTP sent to your email."
          : "Independent teacher account created. Enter the OTP sent to your email to verify the account."
      });
      setName("");
      setEmail("");
      setPassword("");
      setSchoolId("");
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Registration failed."
      });
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!verification) {
      return;
    }
    setOtpStatus({ state: "loading" });
    try {
      const response = await verifyOtp({
        email: verification.email,
        schoolId: verification.schoolId,
        otp: otp.trim()
      });
      setOtpStatus({ state: "success", message: response.message });
      setOtp("");
    } catch (error) {
      setOtpStatus({
        state: "error",
        message: error instanceof Error ? error.message : "OTP verification failed."
      });
    }
  };

  const handleResendOtp = async () => {
    if (!verification) {
      return;
    }
    setOtpStatus({ state: "loading" });
    try {
      const response = await resendOtp({
        email: verification.email,
        schoolId: verification.schoolId
      });
      setOtpStatus({ state: "success", message: response.message });
    } catch (error) {
      setOtpStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Failed to resend OTP."
      });
    }
  };

  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-8">
        <SectionHeader
          eyebrow="Teacher registration"
          title="Register as a teacher"
          subtitle="Use a school ID to join a school or leave it blank to work independently."
        />
        <Card className="space-y-6">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <Input
              label="Full Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Input
              label="School ID"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
              helperText="Optional. Leave blank to create an independent teacher workspace."
            />
            {status.state === "error" ? (
              <StatusBlock tone="negative" title="Registration failed" description={status.message ?? ""} />
            ) : null}
            {status.state === "success" ? (
              <StatusBlock tone="positive" title="Request received" description={status.message ?? ""} />
            ) : null}
            <Button type="submit" disabled={status.state === "loading"}>
              {status.state === "loading" ? "Submitting..." : "Register teacher"}
            </Button>
          </form>
        </Card>
        {verification ? (
          <Card className="space-y-6">
            <SectionHeader
              eyebrow="Email verification"
              title="Verify OTP"
              subtitle={`Enter the OTP sent to ${verification.email}.`}
            />
            <form className="grid gap-4" onSubmit={handleVerifyOtp}>
              <Input
                label="OTP"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="123456"
                required
              />
              {otpStatus.state === "error" ? (
                <StatusBlock tone="negative" title="OTP verification failed" description={otpStatus.message ?? ""} />
              ) : null}
              {otpStatus.state === "success" ? (
                <StatusBlock tone="positive" title="OTP status" description={otpStatus.message ?? ""} />
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={otpStatus.state === "loading"}>
                  {otpStatus.state === "loading" ? "Verifying..." : "Verify OTP"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResendOtp}
                  disabled={otpStatus.state === "loading"}
                >
                  Resend OTP
                </Button>
              </div>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
