"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [status, setStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });

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
        password: trimmedPassword
      });
      setName("");
      setEmail("");
      setPassword("");
      setSchoolId("");
      router.push(
        `/verify-otp?email=${encodeURIComponent(trimmedEmail)}&schoolId=${encodeURIComponent(
          response.schoolId
        )}`
      );
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Registration failed."
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
            <Button type="submit" disabled={status.state === "loading"}>
              {status.state === "loading" ? "Submitting..." : "Register teacher"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
