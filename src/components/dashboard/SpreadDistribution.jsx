import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { spreadDistributionPlot } from "@/api/functions";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";

const InfoTooltip = ({ title, description }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-slate-400 hover:text-slate-300 transition-colors focus:outline-none" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
          <Info className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="bg-slate-900 border-slate-700 text-white p-3 max-w-xs" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
        <div className="font-semibold text-sm mb-1">{title}</div>
        <div className="text-xs text-slate-300">{description}</div>
      </PopoverContent>
    </Popover>
  );
};

export default function SpreadDistribution({ dateRange, horizon='1d', topPct = 0.1 }) {
  const [html, setHtml] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary] = React.useState({ mean: 0, std: 0, sharpe_ann: 0 });
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!dateRange?.start || !dateRange?.end) { setHtml(null); setLoading(false); return; }
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const res = await spreadDistributionPlot({ start: dateRange.start, end: dateRange.end, horizon, top_pct: topPct, bins: 20, width: 980, height: 360 }, { signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;
        setHtml(res?.html || null);
        setSummary(res?.summary || { mean: 0, std: 0, sharpe_ann: 0 });
      } catch (e) {
        if (cancelled || controller.signal.aborted) return;
        setError(e?.message || 'Unable to load spread distribution.');
        setHtml(null);
        setSummary({ mean: 0, std: 0, sharpe_ann: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; controller.abort(); };
  }, [dateRange?.start, dateRange?.end, horizon, topPct]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
      <div className="flex items-center mb-2 gap-2">
        <InfoTooltip title="Distribution of Daily Top–Bottom Spread" description="Histogram of daily top‑minus‑bottom spread across assets for the selected percentile (10% or 5%)." />
        <div className="font-semibold text-sm">{`Distribution of Daily Cross‑Sectional Spread (${topPct === 0.05 ? '5%' : '10%'})`}</div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-slate-800/60 rounded p-2 text-center">
          <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <InfoTooltip title="Mean Spread" description="Average daily top‑minus‑bottom spread across tokens in the selected period (using the selected percentile)." />
            <span>Mean</span>
          </div>
          <div className="text-sm font-semibold">{Number.isFinite(summary.mean) ? summary.mean.toFixed(4) : '—'}</div>
        </div>
        <div className="bg-slate-800/60 rounded p-2 text-center">
          <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <InfoTooltip title="Spread Std Dev" description="Day‑to‑day variability of the daily decile spread (standard deviation)." />
            <span>Std</span>
          </div>
          <div className="text-sm font-semibold">{Number.isFinite(summary.std) ? summary.std.toFixed(3) : '—'}</div>
        </div>
        <div className="bg-slate-800/60 rounded p-2 text-center">
          <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <InfoTooltip title="Sharpe (Annualized)" description="Mean spread divided by its std, scaled by √365 — a simple risk‑adjusted return proxy." />
            <span>Sharpe (Annualized)</span>
          </div>
          <div className="text-sm font-semibold">{Number.isFinite(summary.sharpe_ann) ? summary.sharpe_ann.toFixed(2) : '—'}</div>
        </div>
      </div>

      {loading ? (
        <ChartCardSkeleton height={360} />
      ) : error ? (
        <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{error}</div>
      ) : html ? (
        <iframe srcDoc={html} title="Spread Distribution" className="w-full rounded-md" style={{ height: 380, border: 'none', background: 'transparent' }} />
      ) : (
        <div className="text-slate-400 text-sm p-4 text-center">No data available.</div>
      )}
    </div>
  );
}
