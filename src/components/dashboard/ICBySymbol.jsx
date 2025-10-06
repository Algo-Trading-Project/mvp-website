
import React from "react";
import { icBySymbolPlot } from "@/api/functions";
import { getCachedFunctionResult } from "@/api/base44Client";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { toast } from "sonner";

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

export default function ICBySymbol({ dateRange }) {
  const initialCache = React.useMemo(() => {
    if (!dateRange?.start || !dateRange?.end) return null;
    return getCachedFunctionResult("ic-by-symbol-plot", {
      start: dateRange.start,
      end: dateRange.end,
      minPoints: 10,
      topN: 20,
      width: 980,
      height: 420,
    });
  }, [dateRange?.start, dateRange?.end]);

  const [htmlTop, setHtmlTop] = React.useState(initialCache?.html_top || null);
  const [htmlBottom, setHtmlBottom] = React.useState(initialCache?.html_bottom || null);
  const [loading, setLoading] = React.useState(initialCache ? false : true);
  const [error, setError] = React.useState(null);

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
      const payload = {
        start: dateRange.start,
        end: dateRange.end,
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
        setLoading(false);
        return;
      }
      const shouldShowLoader = !htmlTop && !htmlBottom;
      if (shouldShowLoader) setLoading(true);
      try {
        const data = await icBySymbolPlot(payload, { signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;
        setHtmlTop(data?.html_top || null);
        setHtmlBottom(data?.html_bottom || null);
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
        if (shouldShowLoader) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dateRange]);

  const Plot = ({ html, title }) => {
    if (loading) return <ChartCardSkeleton height={420} />;
    if (html) {
      return (
        <iframe
          srcDoc={html}
          title={title}
          className="w-full rounded-md"
          style={{ height: 440, border: "none", background: "transparent" }}
        />
      );
    }
    return (
      <div className="text-slate-400 text-sm p-4 text-center">
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
            <div className="flex items-center mb-2 gap-2">
              <InfoTooltip title="Top 20 by IC" description="Tokens with highest Information Coefficient over the selected date range." />
              <span className="font-semibold text-sm text-emerald-300">Top 20 Tokens by IC</span>
            </div>
            <Plot html={htmlTop} title="Top 20 Tokens by IC" />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
            <div className="flex items-center mb-2 gap-2">
              <InfoTooltip title="Bottom 20 by IC" description="Tokens with lowest Information Coefficient over the selected date range." />
              <span className="font-semibold text-sm text-red-300">Bottom 20 Tokens by IC</span>
            </div>
            <Plot html={htmlBottom} title="Bottom 20 Tokens by IC" />
          </div>
        </div>
      )}
    </div>
  );
}
