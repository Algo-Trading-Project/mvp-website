
import React, { useEffect, useState } from "react";
import { Download as DownloadIcon, FileText, Database, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingOverlay from "@/components/skeletons/LoadingOverlay";

export default function Downloads() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(t);
  }, []);

  const dailySignals = [
    {
      id: "1",
      signal_date: "2025-08-25",
      scores_file_url: "#",
      portfolio_file_url: "#",
      equity_curve_file_url: "#",
      daily_returns_file_url: "#"
    },
    {
      id: "2",
      signal_date: "2025-08-24",
      scores_file_url: "#",
      portfolio_file_url: "#",
      equity_curve_file_url: "#",
      daily_returns_file_url: "#"
    },
    {
      id: "3",
      signal_date: "2025-08-23",
      scores_file_url: "#",
      portfolio_file_url: "#",
      equity_curve_file_url: "#",
      daily_returns_file_url: "#"
    }
  ];

  const canAccessDate = () => true;
  const todaySignals = dailySignals[0];

  if (loading) {
    return <LoadingOverlay variant="downloads" />;
  }

  return (
    <div className="min-h-screen py-8 bg-slate-950">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Signal <span className="gradient-text">Downloads</span>
          </h1>
          <p className="text-slate-400">
            Preview mode • Daily files and historical examples
          </p>
          <div className="mt-2 text-xs text-slate-400 bg-slate-900 border border-slate-800 inline-block px-2 py-1 rounded">
            Token filter (Free Tier: 8 tokens) — a small, representative subset for evaluation. Reach out to the team for the full symbol dictionary.
          </div>
        </div>

        {todaySignals && (
          <div className="bg-slate-900 border border-slate-800 rounded-md mb-8">
            <div className="p-6 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center space-x-2 font-semibold">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  <span>Today's Signals</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 rounded-sm">Latest</Badge>
                </h3>
                <div className="text-slate-400 text-sm">
                  {new Date(todaySignals.signal_date).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { name: "scores.parquet", description: "Ranked predictions with percentiles", icon: Database, url: todaySignals.scores_file_url },
                  { name: "portfolio.csv", description: "Daily top-decile long basket", icon: FileText, url: todaySignals.portfolio_file_url },
                  { name: "equity_curve.csv", description: "Vol-targeted performance data", icon: FileText, url: todaySignals.equity_curve_file_url },
                  { name: "daily_returns.csv", description: "Strategy returns for analysis", icon: FileText, url: todaySignals.daily_returns_file_url }
                ].map((file, index) => (
                  <div key={index} className="p-4 rounded-md bg-slate-800/60 border border-slate-700/80">
                    <div className="flex items-center space-x-2 mb-2">
                      <file.icon className="w-4 h-4 text-blue-400" />
                      <span className="font-medium text-sm">{file.name}</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3 h-8">{file.description}</p>
                    <Button 
                      size="sm" 
                      className="w-full bg-blue-600 hover:bg-blue-700 rounded-md"
                      onClick={() => window.open(file.url, '_blank')}
                    >
                      <DownloadIcon className="w-3 h-3 mr-2" />
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-md">
          <div className="p-6 border-b border-slate-800">
            <h3 className="font-semibold">Download History</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {dailySignals.map((day, index) => {
                const canAccess = canAccessDate(day.signal_date);
                const isLatest = index === 0;
                return (
                  <div key={day.id} className={`flex items-center justify-between p-4 rounded-md border ${canAccess ? "bg-slate-800/50 border-slate-700/50" : "bg-slate-800/10 border-slate-700/30 opacity-50"}`}>
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">
                            {new Date(day.signal_date).toLocaleDateString()}
                          </span>
                          {isLatest && <Badge className="bg-emerald-500/20 text-emerald-400 rounded-sm">Latest</Badge>}
                        </div>
                        <div className="text-sm text-slate-400">
                          4 files available: scores, portfolio, equity curve, returns
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="rounded-md border-slate-300 bg-white text-slate-900 hover:bg-slate-100">
                      <DownloadIcon className="w-4 h-4 mr-2 text-slate-900" />
                      Download Pack
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
