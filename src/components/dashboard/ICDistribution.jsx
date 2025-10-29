
import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info } from "lucide-react";
import { icDistributionPlot } from "@/api/functions";
import { getCachedFunctionResult } from "@/api/supabaseClient";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { toast } from "sonner";
import useMinLoading from "@/hooks/useMinLoading";

const InfoTooltip = ({ title, description }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-slate-400 hover:text-slate-300 transition-colors focus:outline-none"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <Info className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="bg-slate-900 border-slate-700 text-white p-3 max-w-xs"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="font-semibold text-sm mb-1">{title}</div>
        <div className="text-xs text-slate-300">{description}</div>
      </PopoverContent>
    </Popover>
  );
};

export default function ICDistribution({ dateRange, horizon='1d' }) {
  const [html, setHtml] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary] = React.useState({ mean: 0, std: 0, pos: 0 });
  const [error, setError] = React.useState(null);
  const [showSql, setShowSql] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const esc = (s) => String(s ?? '').replaceAll("'", "''");
  const sqlText = React.useMemo(() => {
    const field = horizon === '3d' ? 'cs_spearman_ic_3d' : 'cs_spearman_ic_1d';
    return `select ${field}
from daily_dashboard_metrics
where date between '${esc(dateRange?.start || '')}' and '${esc(dateRange?.end || '')}';`;
  }, [dateRange?.start, dateRange?.end, horizon]);

  const highlightSql = (sql) => {
    if (!sql) return '';
    const escape = (t) => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let out = escape(sql);
    out = out.replace(/(^|\n)\s*--.*(?=\n|$)/g, (m) => `<span class=\"com\">${m}</span>`);
    out = out.replace(/'(?:''|[^'])*'/g, (m) => `<span class=\"str\">${m}</span>`);
    out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, `<span class=\"num\">$1</span>`);
    const kw = /\b(select|from|where|between|and|or|order|group|by|with|limit|offset)\b/gi;
    out = out.replace(kw, (m)=>`<span class=\"kw\">${m.toUpperCase()}</span>`);
    return out;
  };

  React.useEffect(() => {
    if (!dateRange || !dateRange.start || !dateRange.end) {
      setHtml(null);
      setSummary({ mean: 0, std: 0, pos: 0 });
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const run = async () => {
      const cached = getCachedFunctionResult("ic-distribution-plot", {
        start: dateRange.start,
        end: dateRange.end,
        horizon,
        bins: 50,
        width: 980,
        height: 360,
      });
      setLoading(!cached);
      if (cached) {
        setHtml(cached?.html || null);
        if (cached?.summary) setSummary(cached.summary);
      }
      setError(null);
      try {
        const data = await icDistributionPlot(
          {
            start: dateRange.start,
            end: dateRange.end,
            horizon,
            bins: 50,
            width: 980,
            height: 360,
          },
          { signal: controller.signal }
        );
        if (cancelled || controller.signal.aborted) return;
        setHtml(data?.html || null);
        if (data?.summary) {
          setSummary(data.summary);
        } else {
          setSummary({ mean: 0, std: 0, pos: 0 });
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        console.error("Failed to load IC distribution", err);
        const message = err?.message || "Unable to load IC distribution.";
        setError(message);
        setHtml(null);
        setSummary({ mean: 0, std: 0, pos: 0 });
        toast.error("IC distribution unavailable", {
          id: "ic-distribution-error",
          description: message,
        });
      } finally {
        if (cancelled || controller.signal.aborted) return;
        setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dateRange, horizon]);

  const loadingMin = useMinLoading(loading, 500);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="font-semibold text-sm flex items-center gap-2">
          <InfoTooltip
            title="IC Distribution"
            description="Histogram of daily Spearman rank correlations between predictions and realized returns across assets over the selected window. Red line at 0, blue line at mean."
          />
          Distribution of Daily Cross‑Sectional IC
        </span>
        <button className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700" onClick={()=>setShowSql(true)}>Show SQL</button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-slate-800/60 rounded p-2 text-center">
          <div className="text-[11px] text-slate-300 flex items-center justify-center gap-1">
            <InfoTooltip title="Mean IC" description="Average daily IC over the selected range. IC measures rank correlation between predictions and next‑day returns." />
            <span>Mean</span>
          </div>
          <div className="text-sm font-semibold">{summary.mean?.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800/60 rounded p-2 text-center">
          <div className="text-[11px] text-slate-300 flex items-center justify-center gap-1">
            <InfoTooltip title="IC Std Dev" description="Day‑to‑day variability of IC across the selected period (standard deviation)." />
            <span>Std</span>
          </div>
          <div className="text-sm font-semibold">{summary.std?.toFixed(3)}</div>
        </div>
        <div className="bg-slate-800/60 rounded p-2 text-center">
          <div className="text-[11px] text-slate-300 flex items-center justify-center gap-1">
            <InfoTooltip title="ICIR (Annualized)" description="Information Coefficient Information Ratio: mean IC divided by its std, scaled by √365 to express yearly ‘efficiency’." />
            <span>ICIR (Annualized)</span>
          </div>
          <div className="text-sm font-semibold">{(() => {
            const m = Number(summary.mean);
            const s = Number(summary.std);
            const icir = s ? (m / s) * Math.sqrt(365) : 0;
            return Number.isFinite(icir) ? icir.toFixed(2) : '—';
          })()}</div>
        </div>
      </div>

      {loadingMin ? (
        <ChartCardSkeleton height={360} />
      ) : error ? (
        <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">
          {error}
        </div>
      ) : html ? (
        <iframe
          srcDoc={html}
          title="IC Distribution"
          className="w-full rounded-md"
          style={{ height: 380, border: "none", background: "transparent" }}
        />
      ) : (
        <div className="text-slate-400 text-sm p-4 text-center">No data available.</div>
      )}

      <Dialog open={showSql} onOpenChange={setShowSql}>
        <DialogContent className="bg-slate-950 border border-slate-800 text-white max-w-7xl w-[96vw] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-white">IC Distribution</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            <button
              className={`text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 ${copied ? 'opacity-80' : ''}`}
              onClick={async ()=>{ await navigator.clipboard.writeText(sqlText); setCopied(true); setTimeout(()=>setCopied(false), 2000); }}
            >{copied ? 'Copied' : 'Copy SQL'}</button>
          </div>
          <div className="overflow-auto max-h-[70vh] rounded border border-slate-800 bg-slate-900">
            <style dangerouslySetInnerHTML={{ __html: `
              .sql-pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace; color: #e5e7eb; }
              .sql-pre .kw { color: #93c5fd; }
              .sql-pre .str { color: #fca5a5; }
              .sql-pre .num { color: #fdba74; }
              .sql-pre .com { color: #94a3b8; font-style: italic; }
            ` }} />
            <pre className="sql-pre p-3 text-xs whitespace-pre leading-5" dangerouslySetInnerHTML={{ __html: highlightSql(sqlText) }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
