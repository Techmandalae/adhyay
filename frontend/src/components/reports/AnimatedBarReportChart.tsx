"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type ChartDatum = {
  label: string;
  score: number;
};

export function AnimatedBarReportChart({ data }: { data: ChartDatum[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4d9cc" />
          <XAxis dataKey="label" stroke="#5c5347" tickLine={false} axisLine={false} />
          <YAxis stroke="#5c5347" tickLine={false} axisLine={false} />
          <Tooltip />
          <Bar dataKey="score" fill="#ff6b35" radius={[10, 10, 0, 0]} isAnimationActive />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
