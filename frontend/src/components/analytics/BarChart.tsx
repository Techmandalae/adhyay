type BarDatum = {
  label: string;
  value: number;
  suffix?: string;
  tone?: "accent" | "cool" | "warm";
};

const toneMap: Record<NonNullable<BarDatum["tone"]>, string> = {
  accent: "bg-accent",
  cool: "bg-accent-cool",
  warm: "bg-accent-warm"
};

export function BarChart({ data, maxValue }: { data: BarDatum[]; maxValue?: number }) {
  const computedMax =
    maxValue ?? Math.max(1, ...data.map((item) => (Number.isFinite(item.value) ? item.value : 0)));

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const width = Math.max(0, Math.min(100, (item.value / computedMax) * 100));
        return (
          <div key={item.label} className="grid gap-2">
            <div className="flex items-center justify-between text-xs text-ink-soft">
              <span className="font-medium text-foreground">{item.label}</span>
              <span>
                {item.value}
                {item.suffix ? ` ${item.suffix}` : ""}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-muted">
              <div
                className={`h-2 rounded-full ${item.tone ? toneMap[item.tone] : "bg-accent"}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
