"use client";

import { useState } from "react";

import { registerTeacher } from "@/lib/api";
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
  const [status, setStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      await registerTeacher({
        schoolId: schoolId.trim() || undefined,
        email: email.trim(),
        password: password.trim(),
        name: name.trim()
      });
      setStatus({
        state: "success",
        message: schoolId.trim()
          ? "Teacher account created and linked to the school."
          : "Independent teacher account created. Publishing to students will remain disabled."
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
      </div>
    </div>
  );
}
