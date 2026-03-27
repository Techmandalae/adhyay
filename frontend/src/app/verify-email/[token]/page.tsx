"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { API_BASE } from "@/lib/api";

export default function VerifyEmailPage() {
  const params = useParams<{ token: string }>();
  const verificationUrl = `${API_BASE}/auth/verify-email/${params.token}`;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.location.href = verificationUrl;
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [verificationUrl]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-6 py-16">
      <Card className="w-full space-y-6">
        <SectionHeader
          eyebrow="Verify email"
          title="Confirming your email address"
          subtitle="You will be redirected automatically. If nothing happens, continue manually."
        />
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => (window.location.href = verificationUrl)}>
            Verify email
          </Button>
          <Link href="/signin">
            <Button variant="outline">Back to sign in</Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
