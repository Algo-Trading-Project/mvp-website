import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Activity } from "lucide-react";

export default function MarketRegimeCards() {
  const marketData = {
    breadth_percent: 67.3,
    dispersion: 8.9,
    avg_correlation: 0.42,
    momentum_4w: 58.2,
    momentum_12w: 73.1
  };

  const getBreadthColor = (breadth) => {
    if (breadth > 70) return "text-emerald-400";
    if (breadth > 50) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md h-full">
      <div className="p-6 border-b border-slate-800">
        <h3 className="font-semibold">Market Regime & Breadth</h3>
      </div>
      <div className="p-6 space-y-6">
        <div className="p-4 bg-slate-800/60 rounded-md">
          <h4 className="flex items-center space-x-2 text-base font-medium mb-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>Market Breadth</span>
          </h4>
          <div className="text-center">
            <div className={`text-2xl font-bold ${getBreadthColor(marketData.breadth_percent)}`}>
              {marketData.breadth_percent.toFixed(1)}%
            </div>
            <p className="text-xs text-slate-400">Assets in uptrend</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-800/60 rounded-md">
            <h4 className="text-sm font-medium mb-2">Cross-Sectional Dispersion</h4>
          <div className="text-lg font-bold text-purple-400">
            {marketData.dispersion.toFixed(1)}%
          </div>
          <p className="text-xs text-slate-400">1-day return std</p>
        </div>

          <div className="p-4 bg-slate-800/60 rounded-md">
            <h4 className="text-sm font-medium mb-2">Avg Correlation</h4>
            <div className="text-lg font-bold text-blue-400">
              {marketData.avg_correlation.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400">Pairwise 30-day</p>
          </div>
        </div>

        <div className="p-4 bg-slate-800/60 rounded-md">
          <h4 className="flex items-center space-x-2 text-sm font-medium mb-3">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span>Momentum Breadth</span>
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-lg font-semibold text-amber-400">{marketData.momentum_4w.toFixed(1)}%</div>
              <div className="text-xs text-slate-400">4-week +</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-emerald-400">{marketData.momentum_12w.toFixed(1)}%</div>
              <div className="text-xs text-slate-400">12-week +</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}