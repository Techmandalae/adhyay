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

type SubjectVolumeDatum = {
  label: string;
  value: number;
};

export function SubjectVolumeChart({ data }: { data: SubjectVolumeDatum[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4d9cc" />
          <XAxis dataKey="label" stroke="#5c5347" tickLine={false} axisLine={false} />
          <YAxis stroke="#5c5347" tickLine={false} axisLine={false} />
          <Tooltip />
          <Bar
            dataKey="value"
            fill="#ff6b35"
            radius={[12, 12, 0, 0]}
            isAnimationActive
            animationDuration={700}
            animationEasing="ease-in-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
