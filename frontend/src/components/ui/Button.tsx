"use client";

import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold transition",
        variant === "primary" &&
          "bg-accent text-white shadow-[0_12px_24px_rgba(255,107,53,0.3)] hover:bg-accent-dark",
        variant === "ghost" && "text-foreground hover:bg-surface-muted",
        variant === "outline" &&
          "border border-border bg-transparent text-foreground hover:bg-surface-muted",
        className
      )}
      {...props}
    />
  );
}
