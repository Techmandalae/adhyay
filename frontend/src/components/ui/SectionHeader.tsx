"use client";

export function SectionHeader({
  eyebrow,
  title,
  subtitle
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      {eyebrow ? (
        <p className="text-xs uppercase tracking-[0.4em] text-accent">{eyebrow}</p>
      ) : null}
      <h2 className="mt-2 font-display text-2xl font-semibold">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-ink-soft">{subtitle}</p> : null}
    </div>
  );
}
