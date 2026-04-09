"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  { label: "Results", path: "/dashboard" },
  { label: "Reports", path: "/reports" },
  { label: "Performance trends", path: "/analytics" }
];

export default function DashboardTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-3">
      {tabs.map((tab) => {
        const isActive =
          tab.path === "/analytics"
            ? pathname === "/analytics" || pathname.startsWith("/analytics/")
            : pathname === tab.path || pathname.startsWith(`${tab.path}/`);

        return (
          <Link
            key={tab.path}
            href={tab.path}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-semibold transition",
              isActive
                ? "border-accent bg-accent text-white shadow-[0_12px_24px_rgba(255,107,53,0.18)]"
                : "border-border bg-white text-foreground hover:border-accent hover:text-accent"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
