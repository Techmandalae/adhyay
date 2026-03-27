"use client";

import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
};

export function Select({ className, label, children, ...props }: SelectProps) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      {label ? <span className="font-medium text-foreground">{label}</span> : null}
      <select
        className={cn(
          "rounded-2xl border border-border bg-surface px-4 py-2 text-sm outline-none transition focus:border-accent",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
