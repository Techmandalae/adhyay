"use client";

import Image from "next/image";
import Link from "next/link";

import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { cn } from "@/lib/utils";

export function BrandLockup({
  href,
  size = "md",
  className = "",
  textAlign = "center"
}: {
  href: string;
  size?: "md" | "lg";
  className?: string;
  textAlign?: "center" | "left";
}) {
  const iconSize = size === "lg" ? 44 : 32;
  const mobileTitleClass = size === "lg" ? "text-lg" : "text-base";
  const fullLogoDimensions =
    size === "lg"
      ? { width: 220, height: 72, className: "h-16 w-auto" }
      : { width: 180, height: 56, className: "h-12 w-auto" };

  return (
    <Link href={href} className={cn("mx-auto flex items-center gap-3", className)}>
      <div className="flex items-center gap-3 md:hidden">
        <Image
          src="/logo-icon.png"
          alt={`${APP_NAME} icon`}
          width={iconSize}
          height={iconSize}
          className={cn(size === "lg" ? "h-11 w-11" : "h-8 w-8", "object-contain")}
          priority
        />
        <div className={textAlign === "left" ? "text-left" : "text-center"}>
          <p className={cn("font-display font-semibold text-foreground", mobileTitleClass)}>
            {APP_NAME}
          </p>
          <p className="text-[11px] text-ink-soft">{APP_TAGLINE}</p>
        </div>
      </div>
      <div className={cn("hidden md:block", textAlign === "left" ? "text-left" : "text-center")}>
        <Image
          src="/logo-full.png"
          alt={`${APP_NAME} logo`}
          width={fullLogoDimensions.width}
          height={fullLogoDimensions.height}
          className={cn("object-contain", fullLogoDimensions.className)}
          priority
        />
      </div>
    </Link>
  );
}
