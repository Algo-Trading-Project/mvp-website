import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getValueSelector(metric, horizon, direction) {
  // metric: "ic" | "expectancy"
  if (metric === "ic") {
    return horizon === "1d" ? "information_coefficient_1d" : "information_coefficient_7d";
  }
  // expectancy
  if (direction === "long") return horizon === "1d" ? "expectancy_1d_long" : "expectancy_7d_long";
  if (direction === "short") return horizon === "1d" ? "expectancy_1d_short" : "expectancy_7d_short";
  return horizon === "1d" ? "combined_expectancy_1d" : "combined_expectancy_7d";
}

// Map value to color classes; symmetric scale around 0
function valueToClasses(v, min = -0.05, max = 0.05) {
  if (v == null) return "bg-slate-800 border-slate-700 text-slate-400";
  const clamped = Math.max(min, Math.min(max, v));
  const t = (clamped - min) / (max - min); // 0..1
  // interpolate from red (low) -> gray (mid) -> green (high)
  if (t < 0.25) return "bg-red-900/40 border-red-700 text-red-200";
  if (t < 0.45) return "bg-red-800/30 border-red-600 text-red-200/90";
  if (t < 0.55) return "bg-slate-800 border-slate-700 text-slate-200";
  if (t < 0.75) return "bg-emerald-800/30 border-emerald-600 text-emerald-200";
  return "bg-emerald-900/40 border-emerald-700 text-emerald-200";
}

const InfoTooltip = ({ title, description }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-slate-400 hover:text-slate-300 transition-colors focus:outline-none"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <Info className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="bg-slate-900 border-slate-700 text-white p-3 max-w-xs"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="font-semibold text-sm mb-1">{title}</div>
        <div className="text-xs text-slate-300">{description}</div>
      </PopoverContent>
    </Popover>
  );
};

export default function MonthlyHeatmap({
  title,
  subtitle,
  monthlyRows = [],
  metric = "ic", // "ic" or "expectancy"
  horizon = "1d",
  direction = "combined"
}) {
  // Organize data by year -> month
  const key = getValueSelector(metric, horizon, direction);
  const years = Array.from(new Set(monthlyRows.map(r => r.year))).sort((a,b)=>a-b);
  const grid = years.map(y => {
    const row = Array(12).fill(null);
    monthlyRows.filter(r => r.year === y).forEach(r => {
      const idx = (r.month || 1) - 1;
      row[idx] = typeof r[key] === "number" ? r[key] : null;
    });
    return { year: y, values: row };
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold text-sm">{title}</div>
          {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
        </div>
        <InfoTooltip
          title={metric === "ic" ? "Monthly IC Heatmap" : "Monthly Expectancy Heatmap"}
          description={
            metric === "ic"
              ? "Each cell shows the average of daily cross‑sectional Information Coefficients in that month. Values are not pooled before aggregation."
              : "Each cell shows the average of daily cross‑sectional expectancies in that month. Values are not pooled before aggregation."
          }
        />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-13 gap-1 items-center">
            <div />
            {MONTHS.map((m) => (
              <div key={m} className="text-xs text-slate-400 text-center">{m}</div>
            ))}
          </div>
          <div className="mt-1 space-y-1">
            {grid.map((row) => (
              <div key={row.year} className="grid grid-cols-13 gap-1 items-center">
                <div className="text-xs text-slate-400 w-14">{row.year}</div>
                {row.values.map((v, i) => (
                  <div
                    key={i}
                    className={`h-8 rounded border text-[10px] flex items-center justify-center ${valueToClasses(v)}`}
                    title={`${row.year} ${MONTHS[i]}: ${v != null ? v.toFixed(3) : "—"}`}
                  >
                    {v != null ? v.toFixed(2) : "—"}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 mt-2">Higher is better. Colors scale symmetrically around zero.</div>
        </div>
      </div>
    </div>
  );
}