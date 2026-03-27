"use client";

import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
};

export function Input({ className, label, helperText, ...props }: InputProps) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      {label ? <span className="font-medium text-foreground">{label}</span> : null}
      <input
        className={cn(
          "rounded-2xl border border-border bg-surface px-4 py-2 text-sm outline-none transition focus:border-accent",
          className
        )}
        {...props}
      />
      {helperText ? <span className="text-xs text-ink-soft">{helperText}</span> : null}
    </label>
  );
}
