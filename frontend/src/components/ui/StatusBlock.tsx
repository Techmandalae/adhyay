"use client";

export function StatusBlock({
  title,
  description,
  tone = "neutral"
}: {
  title: string;
  description: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "negative"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-border bg-surface-muted text-ink-soft";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-xs">{description}</p>
    </div>
  );
}
