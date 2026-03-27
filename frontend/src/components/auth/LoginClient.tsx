"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { decodeJwt } from "@/lib/jwt";
import { login } from "@/lib/api";
import { getRoleRoute } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatusBlock } from "@/components/ui/StatusBlock";
import Link from "next/link";
import { APP_NAME } from "@/lib/branding";

export function LoginClient() {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const next = params.get("next") ?? "/";
  const isSuperAdminLogin = email.trim().toLowerCase().includes("superadmin");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim() || (!isSuperAdminLogin && !schoolId.trim())) {
      setError(
        isSuperAdminLogin
          ? "Email and password are required."
          : "Email, password, and school ID are required."
      );
      return;
    }

    try {
      setIsLoading(true);
      const response = await login({
        email: email.trim(),
        password: password.trim(),
        ...(schoolId.trim() ? { schoolId: schoolId.trim() } : {})
      });
      signIn(response.token);
      const decoded = decodeJwt(response.token);
      router.push(decoded?.role ? getRoleRoute(decoded.role) : next);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <Card className="bg-white/80">
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Secure entry</p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Use your school credentials to access {APP_NAME}. Your role dashboard will load
            automatically.
          </p>
          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            {!isSuperAdminLogin ? (
              <Input
                label="School ID"
                placeholder="school_123"
                value={schoolId}
                onChange={(event) => setSchoolId(event.target.value)}
              />
            ) : null}
            <Input
              label="Email"
              placeholder="you@school.edu"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <StatusBlock title="Login failed" description={error} tone="negative" /> : null}
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-accent transition hover:opacity-80"
              >
                Forgot Password?
              </Link>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Continue"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSchoolId("");
                  setEmail("");
                  setPassword("");
                }}
              >
                Clear
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
