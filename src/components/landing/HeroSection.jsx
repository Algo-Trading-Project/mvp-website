import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Cpu, Database } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { monthly_performance_metrics } from "@/api/entities";

export default function HeroSection() {
  const [icir1d, setIcir1d] = React.useState(null);
  const [positiveShare, setPositiveShare] = React.useState(null);

  React.useEffect(() => {
    const loadMonthly = async () => {
      const rows = await monthly_performance_metrics.filter({}, "year", 10000); // Fetching all records up to 10000 years
      const toNumber = (value) => {
        if (typeof value === "number") return Number.isNaN(value) ? null : value;
        if (typeof value === "string" && value.trim() !== "") {
          const num = Number(value);
          return Number.isNaN(num) ? null : num;
        }
        return null;
      };

      const vals1d = rows.map(r => toNumber(r.information_coefficient_1d)).filter(v => v !== null);

      const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
      const std = (arr) => {
        if (arr.length < 2) return 0;
        const m = mean(arr);
        const variance = arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / (arr.length - 1);
        return Math.sqrt(variance);
      };

      const icStd = std(vals1d);
      const icMean = mean(vals1d);
      const icir = icStd > 0 ? (icMean / icStd) * Math.sqrt(12) : null;
      const positives = vals1d.filter(v => v > 0).length;
      const share = vals1d.length ? positives / vals1d.length : null;

      setIcir1d(icir);
      setPositiveShare(share);
    };
    loadMonthly();
  }, []);

  return (
    <div className="relative overflow-hidden bg-slate-950">
      {/* Background Grid */}
      <div
        className="absolute top-0 left-0 right-0 h-[700px] [mask-image:linear-gradient(to_bottom,white_10%,transparent_90%)]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke-width='1.5' stroke='rgb(30 41 59)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e\")",
        }}
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            <div className="inline-flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-md px-4 py-2 text-sm font-medium text-blue-400">
              <Cpu className="w-4 h-4" />
              <span>Daily ML Signals + Public OOS</span>
            </div>
            <div className="inline-flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-md px-4 py-2 text-sm font-medium text-cyan-300">
              <Database className="w-4 h-4" />
              <span>Data Moat: 160B+ rows</span>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Crypto signals you can verify — built on institutional data
          </h1>

          {/* Above-the-fold clarity copy */}
          <p className="text-xl md:text-2xl text-white mb-8 max-w-3xl mx-auto leading-relaxed">
            Daily machine‑learning crypto signals with public, out‑of‑sample performance.
            Download yesterday’s predictions. Connect by API.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-4">
            <Link to={createPageUrl("GetStarted")}>
              <Button
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white px-8 py-6 text-lg font-semibold rounded-md shadow-lg hover:shadow-xl transition-all duration-300 group"
              >
                Start Free
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
              </Button>
            </Link>
            <Link to={createPageUrl("Dashboard?tab=regression")}>
              <Button
                size="lg"
                className="bg-white text-slate-900 hover:bg-slate-100 border border-slate-200 px-8 py-6 text-lg font-semibold rounded-md"
              >
                View Performance
              </Button>
            </Link>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-10">
            <a
              href="/sample-signals.csv"
              className="text-sm text-emerald-300 hover:text-emerald-200 underline underline-offset-4"
            >
              Download yesterday’s free sample CSV
            </a>
          </div>

          {/* ICIR Highlight Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto mb-16">
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-md">
              <div className="text-xs text-slate-400 mb-1">Annualized ICIR (1‑day)</div>
              <div className="text-2xl font-bold text-emerald-400">{icir1d != null ? icir1d.toFixed(3) : "—"}</div>
            </div>
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-md">
              <div className="text-xs text-slate-400 mb-1">Positive Months (1‑day)</div>
              <div className="text-2xl font-bold text-blue-400">{positiveShare != null ? `${(positiveShare * 100).toFixed(1)}%` : "—"}</div>
            </div>
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-md">
              <div className="text-xs text-slate-400 mb-1">Data Moat</div>
              <div className="text-2xl font-bold text-cyan-400">160B+ rows</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
