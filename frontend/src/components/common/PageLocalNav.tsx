"use client";

import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";

type NavItem = {
  label: string;
  href: string;
};

type PageLocalNavProps = {
  items: NavItem[];
};

export function PageLocalNav({ items }: PageLocalNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <Button
          key={item.href}
          type="button"
          variant={pathname === item.href ? "primary" : "outline"}
          onClick={() => router.push(item.href)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
