import React from "react";
import { advByDecilePlot } from "@/api/functions";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";

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

export default function MedianADVByDecile({ dateRange }) {
  const [html, setHtml] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!dateRange?.start || !dateRange?.end) { setHtml(null); setLoading(false); return; }
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const res = await advByDecilePlot({ start: dateRange.start, end: dateRange.end, window: 30 }, { signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;
        setHtml(res?.html || null);
      } catch (e) {
        if (cancelled || controller.signal.aborted) return;
        setError(e?.message || 'Unable to load median ADV by decile.');
        setHtml(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; controller.abort(); };
  }, [dateRange?.start, dateRange?.end]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
      <div className="flex items-center mb-2 gap-2">
        <InfoTooltip title="Median ADV 30 by Decile" description="For each day, tokens are bucketed into prediction deciles. We compute 30‑day average dollar volume per token and show the median by decile — a simple capacity proxy." />
        <span className="font-semibold text-sm text-slate-200">Median ADV 30 by Cross‑Sectional Prediction Decile</span>
      </div>
      {loading ? (
        <ChartCardSkeleton height={360} />
      ) : error ? (
        <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{error}</div>
      ) : html ? (
        <iframe srcDoc={html} title="Median ADV by Decile" className="w-full rounded-md" style={{ height: 380, border: 'none', background: 'transparent' }} />
      ) : (
        <div className="text-slate-400 text-sm p-4 text-center">No data available.</div>
      )}
    </div>
  );
}

