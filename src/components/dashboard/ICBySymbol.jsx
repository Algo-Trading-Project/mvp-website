
import React from "react";
import { icBySymbolPlot } from "@/api/functions";
import { getCachedFunctionResult } from "@/api/supabaseClient";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info } from "lucide-react";
import { toast } from "sonner";
import useMinLoading from "@/hooks/useMinLoading";

const InfoTooltip = ({ title, description }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-white/80 hover:text-white transition-colors focus:outline-none"
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
        <div className="text-xs text-white">{description}</div>
      </PopoverContent>
    </Popover>
  );
};

export default function ICBySymbol({ dateRange, horizon = '1d' }) {
  const storageBaseKey = React.useMemo(() => {
    if (!dateRange?.start || !dateRange?.end || typeof window === "undefined") return null;
    const cacheKey = `ic-by-symbol:${horizon}:${dateRange.start}:${dateRange.end}`;
    return cacheKey;
  }, [dateRange?.start, dateRange?.end, horizon]);

  const initialCache = React.useMemo(() => {
    if (!dateRange?.start || !dateRange?.end) return null;
    return getCachedFunctionResult("ic-by-symbol-plot", {
      start: dateRange.start,
      end: dateRange.end,
      horizon,
      minPoints: 10,
      topN: 20,
      width: 980,
      height: 420,
    });
  }, [dateRange?.start, dateRange?.end, horizon]);

  const readSessionHtml = (key) => {
    if (!key || typeof window === "undefined") return null;
    try {
      const value = window.sessionStorage?.getItem(key);
      return value || null;
    } catch (err) {
      console.warn("Failed to read cached IC plot", err);
      return null;
    }
  };

  const initialTopHtml = storageBaseKey ? (readSessionHtml(`${storageBaseKey}:top`) || initialCache?.html_top || null) : (initialCache?.html_top || null);
  const initialBottomHtml = storageBaseKey ? (readSessionHtml(`${storageBaseKey}:bottom`) || initialCache?.html_bottom || null) : (initialCache?.html_bottom || null);

  const [htmlTop, setHtmlTop] = React.useState(initialTopHtml);
  const [htmlBottom, setHtmlBottom] = React.useState(initialBottomHtml);
  const [loading, setLoading] = React.useState(!(initialTopHtml && initialBottomHtml));
  const [error, setError] = React.useState(null);
  const [showSqlTop, setShowSqlTop] = React.useState(false);
  const [showSqlBottom, setShowSqlBottom] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const esc = (s) => String(s ?? '').replaceAll("'", "''");
  const sqlCall = React.useMemo(() => {
    const pred = horizon === '3d' ? 'predicted_returns_3' : 'predicted_returns_1';
    const fwd  = horizon === '3d' ? 'forward_returns_3'   : 'forward_returns_1';
    return `-- Historical predictions data can be obtained via REST API
with base as (
  select split_part(symbol_id, '_', 1) as symbol,
         ${pred} as pred,
         ${fwd}  as ret
  from predictions
  where date between '${esc(dateRange?.start || '')}' and '${esc(dateRange?.end || '')}'
    and ${pred} is not null
    and ${fwd}  is not null
), r as (
  select symbol,
         rank() over (partition by symbol order by pred) as r_pred,
         rank() over (partition by symbol order by ret)  as r_ret
  from base
)
select symbol,
       corr(r_pred, r_ret) as spearman_ic,
       count(*)            as observation_count
from r
group by symbol
having count(*) >= 30
order by spearman_ic desc;`;
  }, [dateRange?.start, dateRange?.end, horizon]);

  const highlightSql = (sql) => {
    if (!sql) return '';
    const escape = (t) => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let out = escape(sql);
    out = out.replace(/(^|\n)\s*--.*(?=\n|$)/g, (m) => `<span class=\"com\">${m}</span>`);
    out = out.replace(/'(?:''|[^'])*'/g, (m) => `<span class=\"str\">${m}</span>`);
    out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, `<span class=\"num\">$1</span>`);
    const kw = /\b(select|from|where|between|and|or|order|group|by|with|limit|offset|having|join|inner|left|right|on|case|when|then|else|end)\b/gi;
    out = out.replace(kw, (m)=>`<span class=\"kw\">${m.toUpperCase()}</span>`);
    return out;
  };

  React.useEffect(() => {
    if (!dateRange || !dateRange.start || !dateRange.end) {
      setHtmlTop(null);
      setHtmlBottom(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      setError(null);
      setLoading(true);
      const payload = {
        start: dateRange.start,
        end: dateRange.end,
        horizon,
        minPoints: 10,
        topN: 20,
        width: 980,
        height: 420,
        __cache: true,
      };
      const cached = getCachedFunctionResult("ic-by-symbol-plot", payload);
      if (cached) {
        if (cancelled || controller.signal.aborted) return;
        setHtmlTop(cached?.html_top || null);
        setHtmlBottom(cached?.html_bottom || null);
        if (storageBaseKey && cached?.html_top) {
          try { window.sessionStorage?.setItem(`${storageBaseKey}:top`, cached.html_top); } catch (err) { console.warn("Failed to persist IC top cache", err); }
        }
        if (storageBaseKey && cached?.html_bottom) {
          try { window.sessionStorage?.setItem(`${storageBaseKey}:bottom`, cached.html_bottom); } catch (err) { console.warn("Failed to persist IC bottom cache", err); }
        }
      }
      try {
        const data = await icBySymbolPlot(payload, { signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;
        setHtmlTop(data?.html_top || null);
        setHtmlBottom(data?.html_bottom || null);
        if (storageBaseKey && data?.html_top) {
          try { window.sessionStorage?.setItem(`${storageBaseKey}:top`, data.html_top); } catch (err) { console.warn("Failed to persist IC top cache", err); }
        }
        if (storageBaseKey && data?.html_bottom) {
          try { window.sessionStorage?.setItem(`${storageBaseKey}:bottom`, data.html_bottom); } catch (err) { console.warn("Failed to persist IC bottom cache", err); }
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        console.error("Failed to load IC by symbol", err);
        const message = err?.message || "Unable to load IC by token.";
        setError(message);
        setHtmlTop(null);
        setHtmlBottom(null);
        toast.error("IC by token unavailable", {
          id: "ic-by-symbol-error",
          description: message,
        });
      } finally {
        if (cancelled || controller.signal.aborted) return;
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dateRange, horizon]);

  const delayedLoading = useMinLoading(loading, 500);

  const Plot = ({ html, title }) => {
    if (delayedLoading) return <ChartCardSkeleton height={420} />;
    if (html) {
      return (
        <iframe
          srcDoc={html}
          title={title}
          className="w-full rounded-md"
          style={{ height: 440, border: "none", background: "transparent", opacity: 0, transition: 'opacity 180ms ease-out' }}
          onLoad={(e) => { try { e.currentTarget.style.opacity = '1'; } catch {} }}
        />
      );
    }
    return (
      <div className="text-white text-sm p-4 text-center">
        No data available for this date range.
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <InfoTooltip
          title="IC by Token"
          description="Spearman rank correlation between model predictions and forward returns for each token over the selected date range. Calculated from the 'predictions' table."
        />
        <div className="font-semibold text-sm text-slate-200">Information Coefficient (IC) by Token</div>
      </div>
      {error ? (
        <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">
          {error}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="font-semibold text-sm text-white flex items-center gap-2">
                <InfoTooltip title="Top 20 by IC" description="Tokens with highest Information Coefficient over the selected date range." />
                Top 20 Tokens by IC
              </span>
              <button className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700" onClick={()=>setShowSqlTop(true)}>Show SQL</button>
            </div>
            <Plot html={htmlTop} title="Top 20 Tokens by IC" />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="font-semibold text-sm text-white flex items-center gap-2">
                <InfoTooltip title="Bottom 20 by IC" description="Tokens with lowest Information Coefficient over the selected date range." />
                Bottom 20 Tokens by IC
              </span>
              <button className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700" onClick={()=>setShowSqlBottom(true)}>Show SQL</button>
            </div>
            <Plot html={htmlBottom} title="Bottom 20 Tokens by IC" />
          </div>
        </div>
      )}

      <Dialog open={showSqlTop || showSqlBottom} onOpenChange={(open)=>{ if (!open) { setShowSqlTop(false); setShowSqlBottom(false); } }}>
        <DialogContent className="bg-slate-950 border border-slate-800 text-white max-w-7xl w-[96vw] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-white">IC by Token</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            <button
              className={`text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 ${copied ? 'opacity-80' : ''}`}
              onClick={async ()=>{ await navigator.clipboard.writeText(sqlCall); setCopied(true); setTimeout(()=>setCopied(false), 2000); }}
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
            <pre className="sql-pre p-3 text-xs whitespace-pre leading-5" dangerouslySetInnerHTML={{ __html: highlightSql(sqlCall) }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
