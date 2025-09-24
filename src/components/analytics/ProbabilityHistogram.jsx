
import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid
} from "recharts";

export default function ProbabilityHistogram({ data }) {
  const hist = data?.length
    ? data
    : Array.from({ length: 10 }).map((_, i) => ({
        bucket: `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`,
        count: Math.round(10 + Math.random() * 40),
      }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={hist} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
        <XAxis dataKey="bucket" tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
        <RechartsTooltip
          contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }}
        />
        <Bar dataKey="count" fill="#60a5fa" />
      </BarChart>
    </ResponsiveContainer>
  );
}
