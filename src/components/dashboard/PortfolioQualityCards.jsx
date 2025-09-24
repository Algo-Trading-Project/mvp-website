import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, DollarSign, PieChart } from "lucide-react";

export default function PortfolioQualityCards() {
  const portfolioData = {
    median_volume_24h: 1200000000, 
    p25_volume_24h: 450000000,
    concentration_hhi: 0.08,
    funding_avg: 0.0012,
    illiquid_count: 2
  };

  const formatVolume = (volume) => {
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(1)}B`;
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(0)}M`;
    return `$${(volume / 1e3).toFixed(0)}K`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md h-full">
      <div className="p-6 border-b border-slate-800">
        <h3 className="font-semibold">Portfolio Quality</h3>
      </div>
      <div className="p-6 space-y-6">
        <div className="p-4 bg-slate-800/60 rounded-md">
          <h4 className="flex items-center space-x-2 text-base font-medium mb-3">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Liquidity Profile</span>
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-lg font-semibold text-emerald-400">
                {formatVolume(portfolioData.median_volume_24h)}
              </div>
              <div className="text-xs text-slate-400">Median 24h Volume</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-400">
                {formatVolume(portfolioData.p25_volume_24h)}
              </div>
              <div className="text-xs text-slate-400">25th Percentile</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-800/60 rounded-md">
            <h4 className="flex items-center space-x-2 text-sm font-medium mb-2">
              <PieChart className="w-4 h-4 text-purple-400" />
              <span>Concentration</span>
            </h4>
            <div className="text-lg font-bold text-purple-400">
              {portfolioData.concentration_hhi.toFixed(3)}
            </div>
            <p className="text-xs text-slate-400 mb-2">Herfindahl Index</p>
            <Badge className="bg-emerald-800 text-emerald-300 text-xs rounded-sm">
              Well Diversified
            </Badge>
          </div>

          <div className="p-4 bg-slate-800/60 rounded-md">
            <h4 className="flex items-center space-x-2 text-sm font-medium mb-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <span>Funding Cost</span>
            </h4>
            <div className="text-lg font-bold text-amber-400">
              {(portfolioData.funding_avg * 100).toFixed(3)}%
            </div>
            <p className="text-xs text-slate-400 mb-2">Avg daily funding</p>
            {portfolioData.illiquid_count > 0 && (
              <Badge className="bg-red-900 text-red-300 text-xs rounded-sm">
                {portfolioData.illiquid_count} Illiquid Assets
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}