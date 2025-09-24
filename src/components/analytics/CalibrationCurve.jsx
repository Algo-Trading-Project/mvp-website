
import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine
} from "recharts";

export default function CalibrationCurve({ data }) {
  const points = data?.length
    ? data
    : Array.from({ length: 10 }).map((_, i) => {
        const p = (i + 0.5) / 10;
        const obs = Math.min(1, Math.max(0, p * 0.9 + (Math.random() - 0.5) * 0.05));
        return { prob: Number(p.toFixed(2)), observed: Number(obs.toFixed(3)) };
      });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
        <XAxis dataKey="prob" tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
        <YAxis domain={[0, 1]} tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
        <RechartsTooltip
          contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }}
          formatter={(v, n) => [typeof v === "number" ? v.toFixed(3) : v, n]}
        />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#475569" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="observed" name="Observed" stroke="#34d399" dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
