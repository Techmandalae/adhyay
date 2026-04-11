"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin", label: "User Management" },
  { href: "/analytics/class", label: "Analytics" }
];

export function AdminWorkspaceTabs() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return null;
  }

  return (
    <nav className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-border bg-white/80 p-2 shadow-[var(--shadow)]">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              isActive
                ? "bg-accent text-white shadow-[0_12px_24px_rgba(255,107,53,0.2)]"
                : "text-foreground hover:bg-surface-muted"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
