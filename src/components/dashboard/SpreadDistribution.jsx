import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { spreadDistributionPlot } from "@/api/functions";
import { cross_sectional_metrics_1d } from "@/api/entities";
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

export default function SpreadDistribution({ dateRange }) {
  const [html, setHtml] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary] = React.useState({ mean: 0, std: 0, sharpe_ann: 0 });
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!dateRange?.start || !dateRange?.end) { setHtml(null); setLoading(false); return; }
    const controller = new AbortController();
    let cancelled = false;
    const toHtml = (values, bins = 20) => {
      const mean = values.reduce((a,b)=>a+b,0)/values.length;
      const variance = values.reduce((s,x)=> s + (x-mean)*(x-mean), 0) / values.length;
      const std = Math.sqrt(variance);
      const sharpe_ann = std ? (mean / std) * Math.sqrt(365) : 0;
      const html = `<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><script src=\"https://cdn.plot.ly/plotly-2.27.0.min.js\"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head><body><div id=\"chart\"></div><script>const x=${JSON.stringify(values)};const data=[{type:'histogram',x,nbinsx:${20},marker:{color:'#f59e0b',line:{color:'#000',width:1}},hovertemplate:'Spread: %{x:.4f}<br>Count: %{y}<extra></extra>'}];const layout={paper_bgcolor:'#0b1220',plot_bgcolor:'#0b1220',margin:{l:48,r:20,t:10,b:30},xaxis:{tickfont:{color:'#94a3b8'},gridcolor:'#334155'},yaxis:{tickfont:{color:'#94a3b8'},gridcolor:'#334155'},shapes:[{type:'line',x0:${mean},x1:${mean},y0:0,y1:1,yref:'paper',line:{color:'#3b82f6',width:2,dash:'dash'}}],dragmode:'pan'};const config={responsive:true,displayModeBar:false,scrollZoom:false};Plotly.newPlot('chart',data,layout,config);</script></body></html>`;
      return { html, summary: { mean, std, sharpe_ann } };
    };
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const res = await spreadDistributionPlot({ start: dateRange.start, end: dateRange.end, bins: 20, width: 980, height: 360 }, { signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;
        setHtml(res?.html || null);
        setSummary(res?.summary || { mean: 0, std: 0, sharpe_ann: 0 });
      } catch (e) {
        // Fallback: compute in-browser from table if edge function is unavailable
        try {
          const rows = await cross_sectional_metrics_1d.filter({}, 'date', 10000);
          if (cancelled || controller.signal.aborted) return;
          const start = dateRange.start; const end = dateRange.end;
          const values = (rows||[])
            .filter(r => r.date >= start && r.date <= end)
            .map(r => Number(r.cs_top_bottom_decile_spread))
            .filter(v => Number.isFinite(v));
          if (values.length) {
            const local = toHtml(values, 20);
            setHtml(local.html);
            setSummary(local.summary);
            setError(null);
          } else {
            setError('No data available for the selected range.');
            setHtml(null);
            setSummary({ mean: 0, std: 0, sharpe_ann: 0 });
          }
        } catch (e2) {
          if (cancelled || controller.signal.aborted) return;
          setError(e?.message || 'Unable to load spread distribution.');
          setHtml(null);
          setSummary({ mean: 0, std: 0, sharpe_ann: 0 });
        }
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
        <InfoTooltip title="Distribution of Daily Cross‑Sectional Decile Spread" description="Histogram of the daily top‑minus‑bottom decile spread across assets within the selected range." />
        <div className="font-semibold text-sm">Distribution of Daily Cross‑Sectional Decile Spread</div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-slate-800/60 rounded p-2 text-center">
          <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <InfoTooltip title="Mean Spread" description="Average daily top‑minus‑bottom decile spread across tokens in the selected period." />
            <span>Mean</span>
          </div>
          <div className="text-sm font-semibold">{Number.isFinite(summary.mean) ? summary.mean.toFixed(3) : '—'}</div>
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
