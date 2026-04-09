"use client";

import Image from "next/image";

import { APP_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";

export type LogoProps = {
  variant?: "full" | "icon";
  size?: "sm" | "md" | "lg";
  theme?: "light" | "dark";
  className?: string;
};

const sizeMap = {
  sm: { width: 32, height: 32, className: "h-8 w-auto" },
  md: { width: 80, height: 32, className: "h-8 w-auto" },
  lg: { width: 140, height: 56, className: "h-14 w-auto" }
} as const;

export function Logo({
  variant = "full",
  size = "md",
  theme = "light",
  className
}: LogoProps) {
  const src =
    variant === "icon"
      ? "/logo-icon.svg"
      : theme === "dark"
        ? "/logo-dark.png"
        : "/logo.svg";

  const dimensions = sizeMap[size];
  const alt = variant === "icon" ? `${APP_NAME} icon` : `${APP_NAME} logo`;

  return (
    <Image
      src={src}
      alt={alt}
      width={dimensions.width}
      height={dimensions.height}
      priority
      className={cn("object-contain", dimensions.className, className)}
    />
  );
}
