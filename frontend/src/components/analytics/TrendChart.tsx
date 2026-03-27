"use client";

import { useId } from "react";

type TrendPoint = {
  label: string;
  value: number;
};

function buildPoints(values: number[], width: number, height: number) {
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  return values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const gradientId = useId();
  const width = 240;
  const height = 80;
  const values = data.map((item) => item.value);
  const points = values.length > 1 ? buildPoints(values, width, height).join(" ") : "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>Trend</span>
        <span>{data.length > 0 ? data[data.length - 1].label : "-"}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ff6b35" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points ? (
          <>
            <polyline
              points={points}
              fill="none"
              stroke="#ff6b35"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polygon
              points={`0,${height} ${points} ${width},${height}`}
              fill={`url(#${gradientId})`}
            />
          </>
        ) : (
          <line
            x1="0"
            y1={height / 2}
            x2={width}
            y2={height / 2}
            stroke="#e4d9cc"
            strokeWidth="2"
          />
        )}
      </svg>
      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em] text-ink-soft">
        {data.slice(-4).map((item) => (
          <span key={item.label}>{item.label}</span>
        ))}
      </div>
    </div>
  );
}
