import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip
} from "recharts";

export default function PrecisionRecallCurve({ data }) {
  // If data provided, use it; otherwise create a synthetic, reasonable PR shape
  const curve = data?.length
    ? data
    : Array.from({ length: 21 }).map((_, i) => {
        const recall = i / 20; // 0 -> 1
        // precision decays as recall increases (synthetic but smooth)
        const precision = Math.min(
          1,
          Math.max(
            0,
            0.9 - 0.6 * Math.pow(recall, 0.8) + (Math.random() - 0.5) * 0.02
          )
        );
        return { recall: Number(recall.toFixed(2)), precision: Number(precision.toFixed(3)) };
      });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={curve} margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
        <XAxis
          dataKey="recall"
          domain={[0, 1]}
          type="number"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          stroke="#334155"
          label={{ value: "Recall", position: "insideBottomRight", offset: -5, fill: "#64748b", fontSize: 11 }}
        />
        <YAxis
          domain={[0, 1]}
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          stroke="#334155"
          label={{ value: "Precision", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }}
        />
        <RechartsTooltip
          contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }}
          formatter={(v, n) => [typeof v === "number" ? v.toFixed(3) : v, n]}
          labelFormatter={(l) => `Recall: ${l.toFixed ? l.toFixed(2) : l}`}
        />
        <Line type="monotone" dataKey="precision" name="Precision" stroke="#60a5fa" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}