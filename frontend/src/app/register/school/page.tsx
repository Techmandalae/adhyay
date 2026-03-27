"use client";

import { useState } from "react";

import { registerSchool } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";

export default function RegisterSchoolPage() {
  const [schoolName, setSchoolName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState("");
  const [adminContactNumber, setAdminContactNumber] = useState("");
  const [status, setStatus] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ state: "loading" });
    try {
      await registerSchool({
        schoolName: schoolName.trim(),
        adminName: adminName.trim(),
        email: email.trim(),
        password: password.trim(),
        location: location.trim(),
        adminContactNumber: adminContactNumber.trim()
      });
      setStatus({
        state: "success",
        message: "Registration successful. Awaiting platform approval."
      });
      setSchoolName("");
      setAdminName("");
      setEmail("");
      setPassword("");
      setLocation("");
      setAdminContactNumber("");
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
          eyebrow="School registration"
          title="Register your institution"
          subtitle="Create the school and principal account in one step."
        />
        <Card className="space-y-6">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <Input
              label="School Name"
              value={schoolName}
              onChange={(event) => setSchoolName(event.target.value)}
              required
            />
            <Input
              label="Admin Name"
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
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
              label="Location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              required
            />
            <Input
              label="Admin Contact Number"
              value={adminContactNumber}
              onChange={(event) => setAdminContactNumber(event.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {status.state === "error" ? (
              <StatusBlock tone="negative" title="Registration failed" description={status.message ?? ""} />
            ) : null}
            {status.state === "success" ? (
              <StatusBlock tone="positive" title="Request received" description={status.message ?? ""} />
            ) : null}
            <Button type="submit" disabled={status.state === "loading"}>
              {status.state === "loading" ? "Submitting..." : "Register school"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
