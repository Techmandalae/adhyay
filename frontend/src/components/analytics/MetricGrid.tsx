type Metric = {
  label: string;
  value: string | number;
  tone?: "accent" | "cool" | "warm";
  helper?: string;
};

const toneMap: Record<NonNullable<Metric["tone"]>, string> = {
  accent: "text-accent",
  cool: "text-accent-cool",
  warm: "text-accent-warm"
};

export function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-2xl border border-border bg-white/70 p-4 shadow-[0_12px_30px_rgba(27,24,20,0.08)]"
        >
          <p className="text-xs uppercase tracking-[0.3em] text-ink-soft">{metric.label}</p>
          <p
            className={`mt-3 text-2xl font-semibold ${
              metric.tone ? toneMap[metric.tone] : "text-foreground"
            }`}
          >
            {metric.value}
          </p>
          {metric.helper ? <p className="mt-2 text-xs text-ink-soft">{metric.helper}</p> : null}
        </div>
      ))}
    </div>
  );
}
