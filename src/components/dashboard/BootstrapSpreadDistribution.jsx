import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { bootstrapSpreadDistributionPlot } from "@/api/functions";
import { getCachedFunctionResult } from "@/api/supabaseClient";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";

const InfoTooltip = ({ title, description }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-white/80 hover:text-white transition-colors focus:outline-none" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
          <Info className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="bg-slate-900 border-slate-700 text-white p-3 max-w-xs" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
        <div className="font-semibold text-sm mb-1">{title}</div>
        <div className="text-xs text-white">{description}</div>
      </PopoverContent>
    </Popover>
  );
};

export default function BootstrapSpreadDistribution({ dateRange, horizon='1d', topPct = 0.1 }) {
  const [html, setHtml] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary] = React.useState({ mean: 0, ci_lower: 0, ci_upper: 0 });
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!dateRange?.start || !dateRange?.end) { setHtml(null); setLoading(false); return; }
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      const cached = getCachedFunctionResult("bootstrap-spread-distribution-plot", { start: dateRange.start, end: dateRange.end, horizon, top_pct: topPct, samples: 10000, bins: 50 });
      setLoading(!cached); setError(null);
      if (cached) {
        setHtml(cached?.html || null);
        setSummary(cached?.summary || { mean: 0, ci_lower: 0, ci_upper: 0 });
      }
      try {
        const res = await bootstrapSpreadDistributionPlot({ start: dateRange.start, end: dateRange.end, horizon, top_pct: topPct, samples: 10000, bins: 50 }, { signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;
        setHtml(res?.html || null);
        setSummary(res?.summary || { mean: 0, ci_lower: 0, ci_upper: 0 });
      } catch (e) {
        if (cancelled || controller.signal.aborted) return;
        setError(e?.message || 'Unable to load bootstrapped spread distribution.');
        setHtml(null);
        setSummary({ mean: 0, ci_lower: 0, ci_upper: 0 });
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
        <InfoTooltip title="Bootstrapped Distribution of Mean Daily Spread" description="Histogram of 10,000 mean spreads from resampled daily spread series using the selected percentile (10% or 5%)." />
        <div className="font-semibold text-sm">{`Bootstrapped Distribution of Mean Daily Spread (${topPct === 0.05 ? '5%' : '10%'})`}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-800/60 rounded p-2 text-center">
          <div className="text-[11px] text-white flex items-center justify-center gap-1">
            <InfoTooltip title="Bootstrapped Mean" description="Average of the 10k bootstrapped mean spreads; what a ‘typical’ mean could look like." />
            <span>Mean</span>
          </div>
          <div className="text-sm font-semibold">{Number.isFinite(summary.mean) ? summary.mean.toFixed(4) : '—'}</div>
        </div>
        <div className="bg-slate-800/60 rounded p-2 text-center">
          <div className="text-[11px] text-white flex items-center justify-center gap-1">
            <InfoTooltip title="99% Confidence Interval" description="Range that contains 99% of the bootstrapped mean spreads (0.5% to 99.5%)." />
            <span>99% CI</span>
          </div>
          <div className="text-sm font-semibold">[{Number.isFinite(summary.ci_lower) ? summary.ci_lower.toFixed(4) : '—'}, {Number.isFinite(summary.ci_upper) ? summary.ci_upper.toFixed(4) : '—'}]</div>
        </div>
      </div>

      {loading ? (
        <ChartCardSkeleton height={360} />
      ) : error ? (
        <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{error}</div>
      ) : html ? (
        <iframe srcDoc={html} title="Bootstrapped Mean Spread" className="w-full rounded-md" style={{ height: 380, border: 'none', background: 'transparent' }} />
      ) : (
        <div className="text-white text-sm p-4 text-center">No data available.</div>
      )}
    </div>
  );
}
