"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";

type DonutDatum = {
  label: string;
  value: number;
  suffix?: string;
  color: string;
};

export function DonutBreakdownChart({ data }: { data: DonutDatum[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={68}
            outerRadius={102}
            paddingAngle={4}
            stroke="none"
            isAnimationActive
            animationDuration={700}
            animationEasing="ease-in-out"
          >
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, item) => {
              const payload = item.payload as DonutDatum;
              return `${Number(value ?? 0)}${payload.suffix ?? ""}`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid gap-2 sm:grid-cols-3">
        {data.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-white/70 px-4 py-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-soft">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
            </div>
            <p className="mt-2 text-xl font-semibold text-foreground">
              {item.value}
              {item.suffix ?? ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
