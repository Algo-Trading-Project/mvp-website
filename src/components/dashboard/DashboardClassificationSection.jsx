import React, { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import Section from "./Section";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { monthly_performance_metrics } from "@/api/entities";
import { getTokenPerformanceCharts, getDecilePerformanceChart } from "@/api/functions";

const DEFAULT_LOOKBACK_DAYS = 30;

const HORIZON_OPTIONS = [
  { id: "1d", label: "1-Day" },
  { id: "7d", label: "7-Day" },
];

const DIRECTION_OPTIONS = [
  { id: "long", label: "Long" },
  { id: "short", label: "Short" },
  { id: "combined", label: "Combined" },
];

const EXPECTANCY_KEYS = {
  "1d": {
    long: "expectancy_1d_long",
    short: "expectancy_1d_short",
    combined: "combined_expectancy_1d",
  },
  "7d": {
    long: "expectancy_7d_long",
    short: "expectancy_7d_short",
    combined: "combined_expectancy_7d",
  },
};

const InfoTooltip = ({ title, description }) => {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            className="text-slate-400 hover:text-slate-300 transition-colors focus:outline-none"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            <Info className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-slate-700 text-white max-w-xs">
          <div className="font-semibold text-sm mb-1">{title}</div>
          <div className="text-xs text-slate-300">{description}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const Plot = ({ html, loading }) => {
  if (loading) return <ChartCardSkeleton />;
  if (!html) {
    return <div className="h-full flex items-center justify-center text-slate-500">No data</div>;
  }
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts"
      className="w-full h-full border-0 rounded-md"
      title="classification-plot"
    />
  );
};

export default function DashboardClassificationSection() {
  const [horizon, setHorizon] = useState("1d");
  const [direction, setDirection] = useState("combined");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [monthlyRows, setMonthlyRows] = useState([]);

  const [tokenPerformance, setTokenPerformance] = useState({ html_top: null, html_bottom: null, count: 0 });
  const [decilePerformance, setDecilePerformance] = useState({ html: null, n: 0 });
  const [tokenLoading, setTokenLoading] = useState(true);
  const [decileLoading, setDecileLoading] = useState(true);
  const [chartError, setChartError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const rows = await monthly_performance_metrics.filter({}, "year", 10000);
        if (!cancelled) setMonthlyRows(rows);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load monthly expectancy metrics", error);
          toast.error("Unable to load monthly expectancy metrics");
        }
      }
      if (!cancelled && (!dateRange.start || !dateRange.end)) {
        const today = new Date();
        const start = new Date();
        start.setDate(start.getDate() - (DEFAULT_LOOKBACK_DAYS - 1));
        setDateRange({
          start: start.toISOString().slice(0, 10),
          end: today.toISOString().slice(0, 10),
        });
      }
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadCharts = async () => {
      const hasRange = Boolean(dateRange.start && dateRange.end && dateRange.start <= dateRange.end);
      const baseParams = {
        horizon,
        direction,
        topN: 20,
        windowDays: DEFAULT_LOOKBACK_DAYS,
      };

      const requestParams = hasRange
        ? { ...baseParams, start: dateRange.start, end: dateRange.end }
        : baseParams;

      setChartError(null);
      setTokenLoading(true);

      let resolvedStart = requestParams.start;
      let resolvedEnd = requestParams.end;

      try {
        const { data } = await getTokenPerformanceCharts(requestParams);
        setTokenPerformance(data);
        if (data?.range_start) resolvedStart = data.range_start;
        if (data?.range_end) resolvedEnd = data.range_end;
        if (!hasRange && data?.range_start && data?.range_end) {
          setDateRange((prev) =>
            prev.start && prev.end ? prev : { start: data.range_start, end: data.range_end }
          );
        }
      } catch (error) {
        const message = error?.message || "Error loading token performance charts";
        console.error(message, error);
        toast.error(message);
        setChartError(message);
        setTokenPerformance({ html_top: null, html_bottom: null, count: 0 });
      } finally {
        setTokenLoading(false);
      }

      setDecileLoading(true);
      try {
        const { data } = await getDecilePerformanceChart({
          horizon,
          direction,
          start: resolvedStart,
          end: resolvedEnd,
          windowDays: DEFAULT_LOOKBACK_DAYS,
        });
        setDecilePerformance(data);
        if (!hasRange && data?.range_start && data?.range_end) {
          setDateRange((prev) =>
            prev.start && prev.end ? prev : { start: data.range_start, end: data.range_end }
          );
        }
      } catch (error) {
        const message = error?.message || "Error loading decile performance";
        console.error(message, error);
        toast.error(message);
        setChartError((prev) => prev || message);
        setDecilePerformance({ html: null, n: 0 });
      } finally {
        setDecileLoading(false);
      }
    };

    loadCharts();
  }, [horizon, direction, dateRange.start, dateRange.end]);

  const expectancyKey = EXPECTANCY_KEYS[horizon][direction] || EXPECTANCY_KEYS[horizon].combined;

  const monthlyStats = useMemo(() => {
    const values = monthlyRows
      .map((row) => (typeof row[expectancyKey] === "number" ? row[expectancyKey] : null))
      .filter((val) => typeof val === "number" && !Number.isNaN(val));
    if (!values.length) {
      return { mean: null, std: null, positiveRatio: null, latest: null };
    }
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    const std = Math.sqrt(
      values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / Math.max(values.length - 1, 1)
    );
    const positiveRatio = values.filter((v) => v > 0).length / values.length;
    const latestRow = [...monthlyRows]
      .filter((row) => typeof row[expectancyKey] === "number" && !Number.isNaN(row[expectancyKey]))
      .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))
      .pop();
    const latest = latestRow ? Number(latestRow[expectancyKey]) : null;
    return { mean, std, positiveRatio, latest };
  }, [monthlyRows, expectancyKey]);

  const horizonLabel = horizon === "1d" ? "1-Day" : "7-Day";
  const directionLabel = DIRECTION_OPTIONS.find((opt) => opt.id === direction)?.label || "Combined";

  const handleDateChange = (field) => (event) => {
    const value = event.target.value;
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  const topExpectancyTitle = `Top 20 Tokens by Expectancy (${horizonLabel}${
    direction === "combined" ? "" : ` • ${directionLabel}`
  })`;
  const bottomExpectancyTitle = `Bottom 20 Tokens by Expectancy (${horizonLabel}${
    direction === "combined" ? "" : ` • ${directionLabel}`
  })`;

  return (
    <Section title="Classification Model Performance">
      <div className="space-y-8">
        <div className="flex flex-wrap gap-4 items-center justify-between bg-slate-900 border border-slate-800 rounded-md p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Model</span>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700 h-9 text-white">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-white">
                {HORIZON_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id} className="text-white hover:bg-slate-800">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Direction</span>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="w-[160px] bg-slate-800 border-slate-700 h-9 text-white">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 text-white">
                {DIRECTION_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id} className="text-white hover:bg-slate-800">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">From</span>
            <input
              type="date"
              value={dateRange.start}
              onChange={handleDateChange("start")}
              className="bg-slate-800 border border-slate-700 px-2 py-1 rounded h-9 text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">To</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={handleDateChange("end")}
              className="bg-slate-800 border border-slate-700 px-2 py-1 rounded h-9 text-white"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-200">
              Monthly Expectancy ({horizonLabel}
              {direction === "combined" ? "" : ` • ${directionLabel}`})
            </h3>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
                Mean
                <InfoTooltip
                  title="Average Expectancy"
                  description="Average of monthly average expectancies for the selected model and direction."
                />
              </div>
              <div className="text-xl font-bold text-white mt-1">
                {monthlyStats.mean != null ? `${(monthlyStats.mean * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
                Std Dev
                <InfoTooltip title="Volatility" description="Standard deviation of monthly expectancies." />
              </div>
              <div className="text-xl font-bold text-white mt-1">
                {monthlyStats.std != null ? `${(monthlyStats.std * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
                Positive Months %
                <InfoTooltip
                  title="Hit Rate"
                  description="Share of months with positive average expectancy."
                />
              </div>
              <div className="text-xl font-bold text-white mt-1">
                {monthlyStats.positiveRatio != null
                  ? `${(monthlyStats.positiveRatio * 100).toFixed(1)}%`
                  : "—"}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
                Latest Month
                <InfoTooltip
                  title="Most Recent Month"
                  description="Most recent monthly expectancy available."
                />
              </div>
              <div className="text-xl font-bold text-white mt-1">
                {monthlyStats.latest != null ? `${(monthlyStats.latest * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>
        </div>

        {chartError ? (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {chartError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4 min-h-[380px]">
            <h3 className="text-md font-semibold text-white mb-2">Decile-wise Performance</h3>
            <Plot html={decilePerformance.html} loading={decileLoading} />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4 min-h-[380px]">
            <h3 className="text-md font-semibold text-white mb-2">{topExpectancyTitle}</h3>
            <Plot html={tokenPerformance.html_top} loading={tokenLoading} />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4 min-h-[380px] xl:col-span-2">
            <h3 className="text-md font-semibold text-white mb-2">{bottomExpectancyTitle}</h3>
            <Plot html={tokenPerformance.html_bottom} loading={tokenLoading} />
          </div>
        </div>
      </div>
    </Section>
  );
}
