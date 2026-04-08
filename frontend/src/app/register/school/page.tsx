"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthSecondaryAction } from "@/components/auth/AuthSecondaryAction";
import { UsernameField } from "@/components/auth/UsernameField";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { registerSchool } from "@/lib/api";
import { setPendingVerification } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBlock } from "@/components/ui/StatusBlock";

export default function RegisterSchoolPage() {
  const router = useRouter();
  const [schoolName, setSchoolName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState("");
  const [adminContactNumber, setAdminContactNumber] = useState("");
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
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      const response = await registerSchool({
        schoolName: schoolName.trim(),
        adminName: adminName.trim(),
        email: trimmedEmail,
        password: trimmedPassword,
        location: location.trim(),
        adminContactNumber: adminContactNumber.trim()
      });
      setPendingVerification({
        email: trimmedEmail,
        schoolId: response.schoolId,
        password: trimmedPassword,
        username
      });
      setSchoolName("");
      setAdminName("");
      setEmail("");
      setPassword("");
      setLocation("");
      setAdminContactNumber("");
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
      <div className="mx-auto max-w-3xl space-y-8">
        <AuthPageHeader action={<AuthSecondaryAction />} />
        <SectionHeader
          eyebrow="School registration"
          title="Register your institution"
          subtitle="Create the school and principal account in one step."
        />
        <Card className="space-y-6">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Input
              label="School Name"
              value={schoolName}
              onChange={(event) => setSchoolName(event.target.value)}
              autoComplete="organization"
              disabled={status.state === "loading"}
              required
            />
            <Input
              label="Admin Name"
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
              autoComplete="name"
              disabled={status.state === "loading"}
              required
            />
            <UsernameField
              sourceName={adminName}
              label="Admin username"
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
              label="Location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              autoComplete="address-level2"
              disabled={status.state === "loading"}
              required
            />
            <Input
              label="Admin Contact Number"
              value={adminContactNumber}
              onChange={(event) => setAdminContactNumber(event.target.value)}
              autoComplete="tel"
              inputMode="tel"
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
            {status.state === "error" ? (
              <div className="md:col-span-2">
                <StatusBlock tone="negative" title="Registration failed" description={status.message ?? ""} />
              </div>
            ) : null}
            <div className="md:col-span-2">
              <Button type="submit" disabled={status.state === "loading"}>
                {status.state === "loading" ? "Submitting..." : "Register school"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
