import React from "react";
import { advByDecilePlot } from "@/api/functions";
import { getCachedFunctionResult } from "@/api/supabaseClient";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export default function MedianADVByDecile({ dateRange, horizon='1d' }) {
  const storageKey = React.useMemo(() => {
    if (!dateRange?.start || !dateRange?.end || typeof window === "undefined") return null;
    return `median-adv:${horizon}:${dateRange.start}:${dateRange.end}`;
  }, [dateRange?.start, dateRange?.end, horizon]);

  const initialCache = React.useMemo(() => {
    if (!dateRange?.start || !dateRange?.end) return null;
    return getCachedFunctionResult("adv-by-decile-plot", {
      start: dateRange.start,
      end: dateRange.end,
      horizon,
      start_date: dateRange.start,
      end_date: dateRange.end,
      window: 30,
      window_days: 30,
    });
  }, [dateRange?.start, dateRange?.end, horizon]);

  const readSession = () => {
    if (!storageKey || typeof window === "undefined") return null;
    try {
      const value = window.sessionStorage?.getItem(storageKey);
      return value || null;
    } catch (err) {
      console.warn("Failed to read cached ADV plot", err);
      return null;
    }
  };

  const initialHtml = storageKey ? (readSession() || initialCache?.html || null) : (initialCache?.html || null);

  const [html, setHtml] = React.useState(initialHtml);
  const [loading, setLoading] = React.useState(!initialHtml);
  const [error, setError] = React.useState(null);
  const [showSql, setShowSql] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const esc = (s) => String(s ?? '').replaceAll("'", "''");
  const sqlText = React.useMemo(() => {
    const predCol = horizon === '3d' ? 'predicted_returns_3' : 'predicted_returns_1';
    return `-- Resolved SQL used by Median ADV by Decile
with preds as (
  select
    date,
    symbol_id,
    ntile(10) over (
      partition by date
      order by ${predCol}
    ) as cs_decile
  from predictions
  where date between '${esc(dateRange?.start || '')}' and '${esc(dateRange?.end || '')}'
    and ${predCol} is not null
), vols as (
  select
    date,
    symbol_id,
    avg(volume) over (
      partition by symbol_id
      order by date rows between 29 preceding and current row
    ) as adv_30
  from ohlcv_1d
  where date between (date '${esc(dateRange?.start || '')}' - interval '29 days')::date and date '${esc(dateRange?.end || '')}'
), joined as (
  select p.cs_decile as decile, v.adv_30
  from preds p
  inner join vols v on p.date = v.date and p.symbol_id = v.symbol_id
)
select decile,
       percentile_cont(0.5) within group (order by adv_30) as median_adv_30
from joined
group by decile
order by decile;`;
  }, [dateRange?.start, dateRange?.end, horizon]);

  const highlightSql = (sql) => {
    if (!sql) return '';
    const escape = (t) => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let out = escape(sql);
    out = out.replace(/(^|\n)\s*--.*(?=\n|$)/g, (m) => `<span class=\"com\">${m}</span>`);
    out = out.replace(/'(?:''|[^'])*'/g, (m) => `<span class=\"str\">${m}</span>`);
    out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, `<span class=\"num\">$1</span>`);
    const kw = /\b(select|from|where|between|and|or|order|group|by)\b/gi;
    out = out.replace(kw, (m)=>`<span class=\"kw\">${m.toUpperCase()}</span>`);
    return out;
  };

  React.useEffect(() => {
    if (!dateRange?.start || !dateRange?.end) { setHtml(null); setLoading(false); return; }
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      setError(null);
      setLoading(true);
      try {
        const payload = {
          start: dateRange.start,
          end: dateRange.end,
          horizon,
          start_date: dateRange.start,
          end_date: dateRange.end,
          window: 30,
          window_days: 30,
          __cache: true,
        };
        const cached = getCachedFunctionResult("adv-by-decile-plot", payload);
        if (cached) {
          if (cancelled || controller.signal.aborted) return;
          setHtml(cached?.html || null);
          if (storageKey && cached?.html) {
            try { window.sessionStorage?.setItem(storageKey, cached.html); } catch (err) { console.warn("Failed to persist ADV cache", err); }
          }
        }
        const res = await advByDecilePlot(payload, { signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;
        setHtml(res?.html || null);
        if (storageKey && res?.html) {
          try { window.sessionStorage?.setItem(storageKey, res.html); } catch (err) { console.warn("Failed to persist ADV cache", err); }
        }
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
  }, [dateRange?.start, dateRange?.end, horizon]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <InfoTooltip title="Median ADV 30 by Decile" description="For each day, tokens are bucketed into prediction deciles. We compute 30‑day average dollar volume per token and show the median by decile — a simple capacity proxy." />
        <span className="font-semibold text-sm text-slate-200">Median ADV 30 by Cross‑Sectional Prediction Decile</span>
        <button className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700" onClick={()=>setShowSql(true)}>Show SQL</button>
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

      <Dialog open={showSql} onOpenChange={setShowSql}>
        <DialogContent className="bg-slate-950 border border-slate-800 text-white max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-white">SQL: Median ADV by Decile</DialogTitle>
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
              .sql-pre .kw { color: #93c5fd; font-weight: 600; }
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
