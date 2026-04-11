"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";

export function AppBackButton() {
  const router = useRouter();

  return (
    <div className="mb-6">
      <Button type="button" variant="outline" onClick={() => router.back()}>
        Back
      </Button>
    </div>
  );
}
