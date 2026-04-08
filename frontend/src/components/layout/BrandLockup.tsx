"use client";

import Image from "next/image";
import Link from "next/link";

import { APP_NAME, APP_TAGLINE } from "@/lib/branding";

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
  const logoSize = size === "lg" ? 56 : 44;
  const titleClass = size === "lg" ? "text-xl" : "text-lg";

  return (
    <Link href={href} className={`mx-auto flex items-center gap-3 ${className}`}>
      <Image
        src="/logo.png"
        alt={`${APP_NAME} logo`}
        width={logoSize}
        height={logoSize}
        className="h-11 w-11 object-contain md:h-12 md:w-12"
        priority
      />
      <div className={textAlign === "left" ? "text-left" : "text-center"}>
        <p className={`font-display font-semibold text-foreground ${titleClass}`}>{APP_NAME}</p>
        <p className="hidden text-xs text-ink-soft sm:block">{APP_TAGLINE}</p>
      </div>
    </Link>
  );
}
