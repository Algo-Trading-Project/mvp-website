import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, BarChart3, Crown } from "lucide-react";

export default function SevenDayModelCards() {
  const modelData = {
    ic_30d: 0.089,
    ic_90d: 0.097,
    hit_rate_30d: 0.634,
    hit_rate_90d: 0.627,
    top_bottom_spread_30d: 0.142,
    top_bottom_spread_90d: 0.151,
    ic_sharpe_annualized: 2.255,
    predictions_today: 127,
    model_confidence: 0.87
  };

  const getICColor = (ic) => {
    if (ic > 0.09) return "text-emerald-400";
    if (ic > 0.06) return "text-amber-400";
    return "text-red-400";
  };

  const getConfidenceColor = (conf) => {
    if (conf > 0.8) return "text-emerald-400";
    if (conf > 0.7) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md h-full">
      <div className="p-6 border-b border-slate-800">
        <h3 className="font-semibold">7-Day Model Performance</h3>
        <p className="text-xs text-slate-400 mt-1">Strategic signals with weekly horizons</p>
      </div>
      <div className="p-6 space-y-6">
        <div className="p-4 bg-slate-800/60 rounded-md">
          <h4 className="flex items-center space-x-2 text-base font-medium mb-3">
            <Crown className="w-4 h-4 text-amber-400" />
            <span>Flagship Model Metrics</span>
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-lg font-semibold text-amber-400">
                {modelData.ic_sharpe_annualized.toFixed(3)}
              </div>
              <div className="text-xs text-slate-400">Annualized IC Sharpe</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-semibold ${getConfidenceColor(modelData.model_confidence)}`}>
                {(modelData.model_confidence * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-slate-400">Model confidence</div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-800/60 rounded-md">
          <h4 className="flex items-center space-x-2 text-base font-medium mb-3">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>Recent Performance</span>
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className={`text-lg font-semibold ${getICColor(modelData.ic_30d)}`}>
                {modelData.ic_30d.toFixed(3)}
              </div>
              <div className="text-xs text-slate-400">30-day IC</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-emerald-400">
                {(modelData.hit_rate_30d * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-slate-400">30-day hit rate</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-800/60 rounded-md">
            <h4 className="text-sm font-medium mb-2">Top-Bottom Spread</h4>
            <div className="text-lg font-bold text-blue-400">
              {(modelData.top_bottom_spread_30d * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-slate-400 mb-2">30-day avg (net fees)</p>
            <Badge className="bg-blue-800 text-blue-300 text-xs rounded-sm">
              Strong Alpha
            </Badge>
          </div>

          <div className="p-4 bg-slate-800/60 rounded-md">
            <h4 className="text-sm font-medium mb-2">Coverage</h4>
            <div className="text-lg font-bold text-purple-400">
              {modelData.predictions_today}
            </div>
            <p className="text-xs text-slate-400 mb-2">Assets ranked today</p>
            <Badge className="bg-purple-800 text-purple-300 text-xs rounded-sm">
              Full Universe
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}