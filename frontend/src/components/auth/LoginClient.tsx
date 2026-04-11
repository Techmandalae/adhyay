"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatusBlock } from "@/components/ui/StatusBlock";
import { getRoleRoute } from "@/lib/auth";
import { login } from "@/lib/api";
import { APP_NAME } from "@/lib/branding";
import { decodeJwt } from "@/lib/jwt";
import type { AuthUser } from "@/types/auth";

export function LoginClient() {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [schoolId, setSchoolId] = useState(params.get("schoolId") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const next = params.get("next") ?? "/";
  const verified = params.get("verified") === "1";

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/change-password");
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    try {
      setIsLoading(true);
      const response = await login({
        email: email.trim(),
        password: password.trim(),
        ...(schoolId.trim() ? { schoolId: schoolId.trim() } : {})
      });
      const sessionUser = response.user ?? decodeJwt(response.token);
      signIn(response.token, sessionUser);
      const resolvedUser = sessionUser as AuthUser | null;
      startTransition(() => {
        router.replace(
          resolvedUser?.mustChangePassword
            ? "/change-password"
            : resolvedUser?.role
              ? getRoleRoute(resolvedUser.role)
              : next
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <AuthPageHeader />
        <Card className="bg-white/80">
          <p className="text-xs uppercase tracking-[0.35em] text-accent">Secure entry</p>
          <h1 className="mt-3 font-display text-3xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Use your school credentials to access {APP_NAME}. Your role dashboard will load
            automatically.
          </p>
          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            <Input
              label="School ID (optional)"
              placeholder="school_123"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
              autoComplete="organization"
              disabled={isLoading}
            />
            <Input
              label="Email"
              placeholder="you@school.edu"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={isLoading}
            />
            <div className="grid gap-2">
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="........"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={isLoading}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm font-medium text-accent transition hover:opacity-80"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </div>
            </div>
            {verified ? (
              <StatusBlock
                title="Email verified"
                description="Your account is verified. Sign in to open your dashboard."
                tone="positive"
              />
            ) : null}
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
                  setShowPassword(false);
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
