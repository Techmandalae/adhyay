"use client";

import { AnimatePresence } from "framer-motion";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthActionOverlay } from "@/components/auth/AuthActionOverlay";
import { AuthSecondaryAction } from "@/components/auth/AuthSecondaryAction";
import { UsernameField } from "@/components/auth/UsernameField";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { registerTeacher } from "@/lib/api";
import { setPendingVerification } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";

export default function RegisterTeacherPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [status, setStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });

  useEffect(() => {
    router.prefetch("/verify-otp");
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      const requestedSchoolId = schoolId.trim() || undefined;
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      const response = await registerTeacher({
        schoolId: requestedSchoolId,
        email: trimmedEmail,
        password: trimmedPassword,
        name: name.trim()
      });
      setPendingVerification({
        email: trimmedEmail,
        schoolId: response.schoolId,
        password: trimmedPassword,
        username
      });
      setName("");
      setEmail("");
      setPassword("");
      setSchoolId("");
      startTransition(() => {
        router.replace(
          `/verify-otp?email=${encodeURIComponent(trimmedEmail)}&schoolId=${encodeURIComponent(
            response.schoolId
          )}`
        );
      });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Registration failed."
      });
    }
  };

  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <AnimatePresence>
        {status.state === "loading" ? (
          <AuthActionOverlay
            role="teacher"
            title="Setting up your account..."
            subtitle="Preparing your teaching workspace and opening the exam generation flow."
          />
        ) : null}
      </AnimatePresence>
      <div className="mx-auto max-w-3xl space-y-8">
        <AuthPageHeader action={<AuthSecondaryAction />} />
        <SectionHeader
          eyebrow="Teacher registration"
          title="Register as a teacher"
          subtitle="Use a school ID to join a school or leave it blank to work independently."
        />
        <Card className="space-y-6">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Input
              label="Full Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              disabled={status.state === "loading"}
              required
            />
            <UsernameField
              sourceName={name}
              disabled={status.state === "loading"}
              onValueChange={setUsername}
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={status.state === "loading"}
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              disabled={status.state === "loading"}
              required
            />
            <Input
              label="School ID"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
              helperText="Optional. Leave blank to create an independent teacher workspace."
              autoComplete="organization"
              disabled={status.state === "loading"}
            />
            {status.state === "error" ? (
              <div className="md:col-span-2">
                <StatusBlock tone="negative" title="Registration failed" description={status.message ?? ""} />
              </div>
            ) : null}
            <div className="md:col-span-2">
              <Button type="submit" disabled={status.state === "loading"}>
                {status.state === "loading" ? "Submitting..." : "Register teacher"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
