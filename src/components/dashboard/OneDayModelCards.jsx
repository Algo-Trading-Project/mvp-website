import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, TrendingUp, Target } from "lucide-react";

export default function OneDayModelCards() {
  const modelData = {
    ic_30d: 0.127,
    ic_90d: 0.134,
    hit_rate_30d: 0.618,
    hit_rate_90d: 0.612,
    top_bottom_spread_30d: 0.048,
    top_bottom_spread_90d: 0.052,
    sharpe_30d: 1.89,
    predictions_today: 127
  };

  const getICColor = (ic) => {
    if (ic > 0.12) return "text-emerald-400";
    if (ic > 0.08) return "text-amber-400";
    return "text-red-400";
  };

  const getHitRateColor = (hr) => {
    if (hr > 0.6) return "text-emerald-400";
    if (hr > 0.55) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md h-full">
      <div className="p-6 border-b border-slate-800">
        <h3 className="font-semibold">1-Day Model Performance</h3>
        <p className="text-xs text-slate-400 mt-1">Tactical signals with daily rebalancing</p>
      </div>
      <div className="p-6 space-y-6">
        <div className="p-4 bg-slate-800/60 rounded-md">
          <h4 className="flex items-center space-x-2 text-base font-medium mb-3">
            <Zap className="w-4 h-4 text-blue-400" />
            <span>Information Coefficient</span>
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className={`text-lg font-semibold ${getICColor(modelData.ic_30d)}`}>
                {modelData.ic_30d.toFixed(3)}
              </div>
              <div className="text-xs text-slate-400">30-day rolling</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-semibold ${getICColor(modelData.ic_90d)}`}>
                {modelData.ic_90d.toFixed(3)}
              </div>
              <div className="text-xs text-slate-400">90-day rolling</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-800/60 rounded-md">
            <h4 className="flex items-center space-x-2 text-sm font-medium mb-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <span>Hit Rate</span>
            </h4>
            <div className={`text-lg font-bold ${getHitRateColor(modelData.hit_rate_30d)}`}>
              {(modelData.hit_rate_30d * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-slate-400 mb-2">30-day accuracy</p>
            <Badge className="bg-emerald-800 text-emerald-300 text-xs rounded-sm">
              Outperforming
            </Badge>
          </div>

          <div className="p-4 bg-slate-800/60 rounded-md">
            <h4 className="flex items-center space-x-2 text-sm font-medium mb-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <span>Top-Bottom Spread</span>
            </h4>
            <div className="text-lg font-bold text-purple-400">
              {(modelData.top_bottom_spread_30d * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-slate-400 mb-2">30-day avg (net fees)</p>
            <Badge className="bg-purple-800 text-purple-300 text-xs rounded-sm">
              {modelData.predictions_today} signals today
            </Badge>
          </div>
        </div>

        <div className="p-4 bg-slate-800/60 rounded-md">
          <h4 className="text-sm font-medium mb-3">Model Health Summary</h4>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-lg font-semibold text-blue-400">{modelData.sharpe_30d.toFixed(2)}</div>
              <div className="text-xs text-slate-400">30d IC Sharpe</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-emerald-400">
                {(modelData.top_bottom_spread_90d * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-slate-400">90d avg spread</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}