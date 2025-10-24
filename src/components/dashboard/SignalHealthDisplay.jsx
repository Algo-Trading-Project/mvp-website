import React from "react";
import { TrendingUp, Activity, Target } from "lucide-react";

export default function SignalHealthDisplay({ title, data }) {
  const formatNumber = (value, formatter) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "—";
    return formatter(value);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md h-full">
      <div className="p-6 border-b border-slate-800">
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="p-6">
        <div className="grid md:grid-cols-3 gap-6">
          {/* Rolling IC - 4 decimal places */}
          <div>
            <h4 className="flex items-center justify-center space-x-2 text-base font-medium mb-4 text-center">
              <Activity className="w-4 h-4 text-blue-400" />
              <span>Rolling Information Coefficient (30‑day)</span>
            </h4>
            <div className="text-center p-3 bg-slate-800/60 rounded-md">
              <div className="text-lg font-semibold text-blue-400">
                {formatNumber(data.rolling_ic_30d, (val) => val.toFixed(4))}
              </div>
            </div>
          </div>

          {/* Rolling Hit Rate - 2 decimal places for percentage */}
          <div>
            <h4 className="flex items-center justify-center space-x-2 text-base font-medium mb-4 text-center">
              <Target className="w-4 h-4 text-amber-400" />
              <span>Rolling Hit Rate (30‑day)</span>
            </h4>
            <div className="text-center p-3 bg-slate-800/60 rounded-md">
              <div className="text-lg font-semibold text-amber-400">
                {formatNumber(data.hit_rate_30d, (val) => `${(val * 100).toFixed(2)}%`)}
              </div>
            </div>
          </div>

          {/* Average Top-Bottom Decile Spread - 2 decimal places for percentage */}
          <div>
            <h4 className="flex items-center justify-center space-x-2 text-base font-medium mb-4 text-center">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Avg. Top‑Bottom Decile Spread (30‑day)</span>
            </h4>
            <div className="text-center p-3 bg-slate-800/60 rounded-md">
              <div className="text-lg font-semibold text-emerald-300">
                {formatNumber(data.top_bottom_spread_30d, (val) => `${(val * 100).toFixed(2)}%`)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
