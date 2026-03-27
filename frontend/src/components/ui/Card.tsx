"use client";

import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-border bg-surface p-6 shadow-[var(--shadow)]",
        className
      )}
      {...props}
    />
  );
}
