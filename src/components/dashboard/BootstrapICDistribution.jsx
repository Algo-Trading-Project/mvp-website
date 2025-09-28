import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { bootstrapIcDistributionPlot } from "@/api/functions";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { toast } from "sonner";

const InfoTooltip = ({ title, description }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-slate-400 hover:text-slate-300 transition-colors focus:outline-none" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
          <Info className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="bg-slate-900 border-slate-700 text-white p-3 max-w-xs" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <div className="font-semibold text-sm mb-1">{title}</div>
        <div className="text-xs text-slate-300">{description}</div>
      </PopoverContent>
    </Popover>
  );
};

export default function BootstrapICDistribution({ horizon = "1d", dateRange }) {
  const [html, setHtml] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary] = React.useState({ mean: 0, ci_lower: 0, ci_upper: 0 });
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!dateRange || !dateRange.start || !dateRange.end) {
      setHtml(null);
      setSummary({ mean: 0, ci_lower: 0, ci_upper: 0 });
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await bootstrapIcDistributionPlot(
          {
            horizon,
            start: dateRange.start,
            end: dateRange.end,
            samples: 10000,
            bins: 20,
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
          setSummary({ mean: 0, ci_lower: 0, ci_upper: 0 });
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        console.error("Failed to load bootstrap IC distribution", err);
        const message = err?.message || "Unable to load bootstrap IC distribution.";
        setError(message);
        setHtml(null);
        setSummary({ mean: 0, ci_lower: 0, ci_upper: 0 });
        toast.error("Bootstrap IC distribution unavailable", {
          id: "bootstrap-ic-distribution-error",
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
  }, [horizon, dateRange]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-sm">Bootstrapped Distribution of Mean Daily IC</div>
        <InfoTooltip
          title="Bootstrapped Mean IC Distribution"
          description="Histogram of 10,000 mean ICs, each calculated from a resampled (with replacement) daily IC series. This shows the variability of the mean IC statistic."
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-800/60 rounded p-2 text-center">
            <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">Mean <InfoTooltip title="Mean of Bootstrapped Means" description="The average of the 10,000 bootstrapped sample means, providing a stable estimate of the true mean daily IC." /></div>
            <div className="text-sm font-semibold">{summary.mean?.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800/60 rounded p-2 text-center">
            <div className="text-[11px] text-slate-400 flex items-center justify-center gap-1">99% CI <InfoTooltip title="99% Confidence Interval" description="The range in which we are 99% confident the true mean daily IC lies, based on the bootstrapped distribution." /></div>
            <div className="text-sm font-semibold">[{summary.ci_lower?.toFixed(4)}, {summary.ci_upper?.toFixed(4)}]</div>
        </div>
      </div>

      {loading ? (
        <ChartCardSkeleton height={360} />
      ) : error ? (
        <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">
          {error}
        </div>
      ) : html ? (
        <iframe
          srcDoc={html}
          title="Bootstrapped IC Distribution"
          className="w-full rounded-md"
          style={{ height: 380, border: "none", background: "transparent" }}
        />
      ) : (
        <div className="text-slate-400 text-sm p-4 text-center">No data available.</div>
      )}
    </div>
  );
}
