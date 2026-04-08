"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";

export function AuthSecondaryAction({
  href = "/login",
  label = "Sign In"
}: {
  href?: string;
  label?: string;
}) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      className="px-3 py-1.5 text-xs"
      onClick={() => router.push(href)}
    >
      {label}
    </Button>
  );
}
