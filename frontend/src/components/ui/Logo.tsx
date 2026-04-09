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
  sm: { width: 40, height: 40, className: "h-10 w-auto" },
  md: { width: 120, height: 48, className: "h-12 w-auto" },
  lg: { width: 200, height: 80, className: "h-20 w-auto" }
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
