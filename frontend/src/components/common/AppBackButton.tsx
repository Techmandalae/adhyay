"use client";

import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";

export function AppBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const hiddenRoutes = new Set(["/", "/dashboard", "/admin", "/teacher", "/student", "/parent", "/platform"]);

  if (hiddenRoutes.has(pathname)) {
    return null;
  }

  return (
    <div className="mb-6">
      <Button type="button" variant="outline" onClick={() => router.back()}>
        Back
      </Button>
    </div>
  );
}
