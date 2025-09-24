
import React from "react";
import { icBySymbolPlot } from "@/api/functions";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";

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

export default function ICBySymbol({ horizon = "1d", dateRange }) {
  const [htmlTop, setHtmlTop] = React.useState(null);
  const [htmlBottom, setHtmlBottom] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!dateRange || !dateRange.start || !dateRange.end) {
      return;
    }
    const load = async () => {
      setLoading(true);
      const { data } = await icBySymbolPlot({ 
          horizon, 
          start: dateRange.start, 
          end: dateRange.end, 
          minPoints: 10, 
          topN: 20, 
          width: 980, 
          height: 420 
      });
      setHtmlTop(data?.html_top || null);
      setHtmlBottom(data?.html_bottom || null);
      setLoading(false);
    };
    load();
  }, [horizon, dateRange]);

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
    return <div className="text-slate-400 text-sm p-4 text-center">No data available for this date range.</div>;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-sm">Information Coefficient (IC) by Token</div>
        <InfoTooltip
          title="IC by Token"
          description="Spearman rank correlation between model predictions and forward returns for each token over the selected date range. Calculated from the 'predictions' table."
        />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Plot html={htmlTop} title="Top 20 Tokens by IC" />
        <Plot html={htmlBottom} title="Bottom 20 Tokens by IC" />
      </div>
    </div>
  );
}
