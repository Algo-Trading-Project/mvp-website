import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Cpu, Database, Info, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { monthlyIcSummary, fetchMetrics, sampleSignals } from "@/api/functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function HeroSection() {
  const [icir1d, setIcir1d] = React.useState(null);
  const [positiveShare, setPositiveShare] = React.useState(null);
  const [meanDailyIc, setMeanDailyIc] = React.useState(null);
  const [meanDailySpread, setMeanDailySpread] = React.useState(null);
  const [loadingMeans, setLoadingMeans] = React.useState(true);
  const [loadingMonthly, setLoadingMonthly] = React.useState(true);
  const [downloadingSample, setDownloadingSample] = React.useState(false);

  React.useEffect(() => {
    const loadMonthly = async () => {
      setLoadingMonthly(true);
      const data = await monthlyIcSummary({}).catch(() => null);
      if (data?.one_day) {
        setIcir1d(typeof data.one_day.icir_ann === 'number' ? data.one_day.icir_ann : null);
        setPositiveShare(typeof data.one_day.positive_share === 'number' ? data.one_day.positive_share : null);
      } else {
        setIcir1d(null);
        setPositiveShare(null);
      }
      setLoadingMonthly(false);
    };
    const loadDailyMeans = async () => {
      setLoadingMeans(true);
      const res = await fetchMetrics({ version: 2 }).catch(() => null);
      const gm = res?.global_means || {};
      if (typeof gm.mean_daily_ic_1d === 'number') setMeanDailyIc(gm.mean_daily_ic_1d);
      if (typeof gm.mean_daily_spread_1d === 'number') setMeanDailySpread(gm.mean_daily_spread_1d);
      // Fallback if global_means not present
      if ((gm?.mean_daily_ic_1d == null || gm?.mean_daily_spread_1d == null) && Array.isArray(res?.cross)) {
        const rows = res.cross;
        const nums = (arr) => arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
        const mean = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : null;
        if (gm?.mean_daily_ic_1d == null) setMeanDailyIc(mean(nums(rows.map((r) => r.cross_sectional_ic_1d))));
        if (gm?.mean_daily_spread_1d == null) setMeanDailySpread(mean(nums(rows.map((r) => r.cs_top_bottom_decile_spread))));
      }
      setLoadingMeans(false);
    };
    loadMonthly();
    loadDailyMeans();
  }, []);

  // Hoverable info tooltip (matches OOS dashboard behavior)
  const InfoTip = ({ title, description, ariaLabel = 'More info' }) => {
    const [open, setOpen] = React.useState(false);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="text-slate-300 hover:text-slate-200 focus:outline-none"
            aria-label={ariaLabel}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="bg-slate-900 border-slate-700 text-white p-3 max-w-xs text-left"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="text-xs font-semibold mb-1">{title}</div>
          <div className="text-[11px] text-slate-300 leading-relaxed">{description}</div>
        </PopoverContent>
      </Popover>
    );
  };

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
              <span>Data Lake Size: 160B+ rows</span>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Crypto signals you can verify — built on institutional‑grade data
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
            <button
              onClick={async () => {
                try {
                  setDownloadingSample(true);
                  const res = await sampleSignals({});
                  const text = typeof res === 'string' ? res : (res?.csv || res?.data || '');
                  const name = typeof res === 'object' && res?.filename ? res.filename : 'sample-signals.csv';
                  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = name;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  console.error('Failed to download sample CSV', e);
                } finally {
                  setDownloadingSample(false);
                }
              }}
              disabled={downloadingSample}
              aria-busy={downloadingSample ? 'true' : 'false'}
              className={`text-sm underline underline-offset-4 ${downloadingSample ? 'text-emerald-200/60 cursor-not-allowed' : 'text-emerald-300 hover:text-emerald-200'}`}
            >
              {downloadingSample ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Preparing sample…
                </span>
              ) : (
                "Download a subset of yesterday's predictions (10 tokens)"
              )}
            </button>
          </div>

          {/* Tooltip helper */}
          {(() => {
            const InfoTooltip = ({ title, description }) => (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="text-slate-400 hover:text-slate-300 focus:outline-none"
                    aria-label={`More info about ${title}`}
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="bg-slate-900 border-slate-700 text-white p-3 max-w-xs text-left">
                  <div className="text-xs font-semibold mb-1">{title}</div>
                  <div className="text-[11px] text-slate-300 leading-relaxed">{description}</div>
                </PopoverContent>
              </Popover>
            );

            const ValueSkeleton = () => (
              <div className="h-5 w-20 bg-slate-800 animate-pulse rounded" />
            );

            return null;
          })()}

          {/* Highlight Strip (compact badges) */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 max-w-3xl mx-auto mb-12">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-md text-center">
              <div className="text-xs text-slate-300 mb-1 flex items-center justify-center gap-1">
                <InfoTip
                  title="Mean Daily IC"
                  description="Average cross‑sectional Spearman rank correlation between predictions and next‑day returns."
                  ariaLabel="Mean Daily IC info"
                />
                <span className="whitespace-nowrap">Mean Daily IC (1‑day)</span>
              </div>
              <div className="text-xl font-bold text-emerald-400 min-h-[20px] flex items-center justify-center">
                {loadingMeans ? <div className="h-5 w-20 bg-slate-800 animate-pulse rounded" /> : (meanDailyIc != null ? meanDailyIc.toFixed(3) : "—")}
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-md text-center">
              <div className="text-xs text-slate-300 mb-1 flex items-center justify-center gap-1">
                <InfoTip
                  title="Average Daily Spread"
                  description="For each day, take the mean 1‑day return of assets in the top 10% by predicted return minus the mean for the bottom 10%, then average across days."
                  ariaLabel="Avg Daily Spread info"
                />
                <span className="whitespace-nowrap">Avg Daily Spread (1‑day)</span>
              </div>
              <div className="text-xl font-bold text-emerald-400 min-h-[20px] flex items-center justify-center">
                {loadingMeans ? <div className="h-5 w-24 bg-slate-800 animate-pulse rounded" /> : (meanDailySpread != null ? `${(meanDailySpread*100).toFixed(2)}%` : "—")}
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-md text-center">
              <div className="text-xs text-slate-300 mb-1 flex items-center justify-center gap-1">
                <InfoTip
                  title="Positive Months"
                  description="Fraction of months with a positive average daily IC (1‑day horizon)."
                  ariaLabel="Positive Months info"
                />
                <span className="whitespace-nowrap">Positive Months (1‑day)</span>
              </div>
              <div className="text-xl font-bold text-blue-400 min-h-[20px] flex items-center justify-center">
                {loadingMonthly ? <div className="h-5 w-16 bg-slate-800 animate-pulse rounded" /> : (positiveShare != null ? `${(positiveShare * 100).toFixed(1)}%` : "—")}
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-md text-center">
              <div className="text-xs text-slate-300 mb-1 flex items-center justify-center gap-1">
                <InfoTip
                  title="Data Lake Size"
                  description="Approximate row count of the data lake used for feature engineering and research that powers model training and OOS evaluation."
                  ariaLabel="Data Lake Size info"
                />
                <span className="whitespace-nowrap">Data Lake Size</span>
              </div>
              <div className="text-xl font-bold text-cyan-400 min-h-[20px] flex items-center justify-center">160B+ rows</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
