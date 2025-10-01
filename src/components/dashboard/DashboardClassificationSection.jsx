import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Section from "./Section";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Info, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  cross_sectional_metrics_1d,
  monthly_performance_metrics,
} from "@/api/entities";
import {
  rollingExpectancyPlot,
  expectancyDistributionPlot,
  bootstrapExpectancyDistributionPlot,
  getTokenPerformanceCharts,
  predictionsCoverage,
} from "@/api/functions";

const DEFAULT_LOOKBACK_DAYS = 30;

const HORIZON_OPTIONS = [
  { id: "1d", label: "1-Day" },
  { id: "7d", label: "7-Day" },
];

const DIRECTION_OPTIONS = [
  { id: "long", label: "Long" },
  { id: "short", label: "Short" },
];

const EXPECTANCY_KEYS = {
  "1d": {
    long: "cs_1d_long_expectancy",
    short: "cs_1d_short_expectancy",
  },
  "7d": {
    long: "cs_7d_long_expectancy",
    short: "cs_7d_short_expectancy",
  },
};

const ROLLING_KEYS = {
  "1d": {
    long: "rolling_avg_1d_long_expectancy",
    short: "rolling_avg_1d_short_expectancy",
  },
  "7d": {
    long: "rolling_avg_7d_long_expectancy",
    short: "rolling_avg_7d_short_expectancy",
  },
};

const MONTHLY_EXPECTANCY_KEYS = {
  "1d": {
    long: "expectancy_1d_long",
    short: "expectancy_1d_short",
  },
  "7d": {
    long: "expectancy_7d_long",
    short: "expectancy_7d_short",
  },
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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
            aria-label={title}
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

const PlotFrame = ({ html, loading, emptyMessage = "No data" }) => {
  if (loading) return <ChartCardSkeleton height={360} />;
  if (!html) {
    return (
      <div className="text-slate-400 text-sm p-4 text-center border border-slate-800 bg-slate-900 rounded-md">
        {emptyMessage}
      </div>
    );
  }
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts"
      className="w-full rounded-md"
      style={{ height: 380, border: "none", background: "transparent" }}
      title="classification-plot"
    />
  );
};

const getDeltas = (data, key) => {
  const lastIdx = (() => {
    for (let i = data.length - 1; i >= 0; i--) {
      const val = data[i]?.[key];
      if (typeof val === "number" && !Number.isNaN(val)) return i;
    }
    return -1;
  })();
  if (lastIdx < 0) return { cur: null, d1: null, d7: null, d30: null };
  const cur = data[lastIdx][key];
  const grab = (offset) => {
    const j = lastIdx - offset;
    if (j >= 0 && typeof data[j]?.[key] === "number" && !Number.isNaN(data[j][key])) {
      return cur - data[j][key];
    }
    return null;
  };
  return { cur, d1: grab(1), d7: grab(7), d30: grab(30) };
};

const formatDelta = (value, { asPct = false, decimals = 4 } = {}) => {
  if (value === null || typeof value !== "number" || Number.isNaN(value)) return "—";
  return asPct
    ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(decimals)}%`
    : `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}`;
};

const deltaClass = (value) => {
  if (value === null || typeof value !== "number" || Number.isNaN(value)) return "text-slate-400";
  return value >= 0 ? "text-emerald-400" : "text-red-400";
};

export default function DashboardClassificationSection() {
  const [horizon, setHorizon] = useState("1d");
  const [direction, setDirection] = useState("long");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [availableRange, setAvailableRange] = useState({ start: "", end: "" });

  const [crossRows, setCrossRows] = useState([]);
  const [monthlyRows, setMonthlyRows] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [tokenPerformance, setTokenPerformance] = useState({ html_top: null, html_bottom: null, count: 0 });
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState(null);

  const [rollingHtml, setRollingHtml] = useState(null);
  const [rollingLoading, setRollingLoading] = useState(true);
  const [rollingError, setRollingError] = useState(null);

  const [expectancyDistHtml, setExpectancyDistHtml] = useState(null);
  const [expectancyDistSummary, setExpectancyDistSummary] = useState({ mean: 0, std: 0, pos: 0 });
  const [expectancyDistLoading, setExpectancyDistLoading] = useState(true);

  const [bootstrapHtml, setBootstrapHtml] = useState(null);
  const [bootstrapSummary, setBootstrapSummary] = useState({ mean: 0, ci_lower: 0, ci_upper: 0 });
  const [bootstrapLoading, setBootstrapLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setDataLoading(true);
      try {
        const [rawCross, rawMonthly, coverageInfo] = await Promise.all([
          cross_sectional_metrics_1d.filter({}, "date", 20000),
          monthly_performance_metrics.filter({}, "year", 10000),
          predictionsCoverage({ monthsBack: 240 }).catch((error) => {
            console.error("Failed to load predictions coverage", error);
            return null;
          }),
        ]);
        if (cancelled) return;

        const normalisedCross = rawCross
          .map((row) => ({
            ...row,
            rolling_30d_ema_ic_1d: toNumber(row.rolling_30d_ema_ic_1d),
            rolling_30d_ema_ic_7d: toNumber(row.rolling_30d_ema_ic_7d),
            rolling_30d_ema_top_bottom_decile_spread_1d: toNumber(row.rolling_30d_ema_top_bottom_decile_spread_1d),
            rolling_30d_ema_top_bottom_decile_spread_7d: toNumber(row.rolling_30d_ema_top_bottom_decile_spread_7d),
            rolling_avg_1d_expectancy: toNumber(row.rolling_avg_1d_expectancy),
            rolling_avg_1d_long_expectancy: toNumber(row.rolling_avg_1d_long_expectancy),
            rolling_avg_1d_short_expectancy: toNumber(row.rolling_avg_1d_short_expectancy),
            rolling_avg_7d_expectancy: toNumber(row.rolling_avg_7d_expectancy),
            rolling_avg_7d_long_expectancy: toNumber(row.rolling_avg_7d_long_expectancy),
            rolling_avg_7d_short_expectancy: toNumber(row.rolling_avg_7d_short_expectancy),
            cs_1d_expectancy: toNumber(row.cs_1d_expectancy),
            cs_1d_long_expectancy: toNumber(row.cs_1d_long_expectancy),
            cs_1d_short_expectancy: toNumber(row.cs_1d_short_expectancy),
            cs_7d_expectancy: toNumber(row.cs_7d_expectancy),
            cs_7d_long_expectancy: toNumber(row.cs_7d_long_expectancy),
            cs_7d_short_expectancy: toNumber(row.cs_7d_short_expectancy),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        setCrossRows(normalisedCross);
        const crossStart = normalisedCross[0]?.date || "";
        const crossEnd = normalisedCross[normalisedCross.length - 1]?.date || "";

        const coverageStart = coverageInfo?.min_date || crossStart || '2019-01-01';
        const coverageEnd = coverageInfo?.max_date || crossEnd || coverageStart;

        const defaultEnd = coverageEnd;
        const defaultStartTarget = defaultEnd && defaultEnd >= '2025-01-01' ? '2025-01-01' : coverageStart;
        const clampedStart = defaultStartTarget && coverageStart
          ? (defaultStartTarget < coverageStart ? coverageStart : defaultStartTarget)
          : coverageStart;
        const safeStart = clampedStart > defaultEnd ? coverageStart : clampedStart;

        setAvailableRange({
          start: coverageStart,
          end: coverageEnd,
        });

        setDateRange((prev) => ({
          start: prev.start || safeStart,
          end: prev.end || defaultEnd,
        }));

        const normalisedMonthly = rawMonthly.map((row) => ({
          ...row,
          expectancy_1d_long: toNumber(row.expectancy_1d_long),
          expectancy_1d_short: toNumber(row.expectancy_1d_short),
          combined_expectancy_1d: toNumber(row.combined_expectancy_1d),
          expectancy_7d_long: toNumber(row.expectancy_7d_long),
          expectancy_7d_short: toNumber(row.expectancy_7d_short),
          combined_expectancy_7d: toNumber(row.combined_expectancy_7d),
        }));
        setMonthlyRows(normalisedMonthly);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load expectancy metrics", error);
          toast.error("Unable to load expectancy metrics");
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return [];
    return crossRows.filter((row) => row.date >= dateRange.start && row.date <= dateRange.end);
  }, [crossRows, dateRange.start, dateRange.end]);

  const horizonLabel = horizon === "1d" ? "1-Day" : "7-Day";
  const directionLabel = DIRECTION_OPTIONS.find((opt) => opt.id === direction)?.label || "Long";

  const expectancyKey = EXPECTANCY_KEYS[horizon][direction];
  const rollingKey = ROLLING_KEYS[horizon][direction];

  const rollingSeries = useMemo(
    () =>
      crossRows.map((row) => ({
        date: row.date,
        value: toNumber(row[rollingKey]),
      })),
    [crossRows, rollingKey]
  );

  const rollingSeriesFiltered = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return [];
    return rollingSeries.filter((row) => row.date >= dateRange.start && row.date <= dateRange.end);
  }, [rollingSeries, dateRange.start, dateRange.end]);

  const rollingDeltas = useMemo(() => getDeltas(rollingSeriesFiltered, "value"), [rollingSeriesFiltered]);

  const rollingBadge = (
    <div className="text-center">
      <h4 className="text-lg font-semibold text-white mb-2 flex items-center justify-center gap-2">
        <InfoTooltip
          title="Rolling Expectancy (30d avg)"
          description="30-day moving average of daily cross-sectional expectancies for the selected horizon and direction."
        />
        <span>Rolling 30-Day Expectancy</span>
      </h4>
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-center gap-4">
          <div className="min-w-[88px]">
            <div className="text-2xl font-bold text-white">
              {rollingDeltas.cur != null ? `${(rollingDeltas.cur * 100).toFixed(2)}%` : "—"}
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <div className={`flex items-center gap-1 ${deltaClass(rollingDeltas.d1)}`}>
              <span>1d:</span>
              <span>{formatDelta(rollingDeltas.d1, { asPct: true, decimals: 2 })}</span>
            </div>
            <div className={`flex items-center gap-1 ${deltaClass(rollingDeltas.d7)}`}>
              <span>7d:</span>
              <span>{formatDelta(rollingDeltas.d7, { asPct: true, decimals: 2 })}</span>
            </div>
            <div className={`flex items-center gap-1 ${deltaClass(rollingDeltas.d30)}`}>
              <span>30d:</span>
              <span>{formatDelta(rollingDeltas.d30, { asPct: true, decimals: 2 })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const monthlyStats = useMemo(() => {
    const monthlyKey = MONTHLY_EXPECTANCY_KEYS[horizon][direction];
    const values = monthlyRows
      .map((row) => toNumber(row[monthlyKey]))
      .filter((val) => typeof val === "number" && !Number.isNaN(val));
    if (!values.length) {
      return { mean: null, std: null, positiveRatio: null, latest: null };
    }
    const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
    const std = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / Math.max(values.length - 1, 1)
    );
    const positiveRatio = values.filter((val) => val > 0).length / values.length;
    const latestRow = [...monthlyRows]
      .filter((row) => typeof row[monthlyKey] === "number")
      .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))
      .pop();
    const latest = latestRow ? toNumber(latestRow[monthlyKey]) : null;
    return { mean, std, positiveRatio, latest };
  }, [monthlyRows, horizon, direction]);

  const expectancyStats = useMemo(() => {
    const values = filteredRows
      .map((row) => toNumber(row[expectancyKey]))
      .filter((val) => typeof val === "number" && !Number.isNaN(val));
    if (!values.length) return { mean: null, std: null, posPct: null };
    const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
    const std = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / Math.max(values.length - 1, 1)
    );
    const posPct = values.filter((val) => val > 0).length / values.length;
    return { mean, std, posPct };
  }, [filteredRows, expectancyKey]);

  useEffect(() => {
    if (!dateRange.start || !dateRange.end) return;
    const controller = new AbortController();
    const load = async () => {
      setTokenLoading(true);
      setTokenError(null);
      try {
        const data = await getTokenPerformanceCharts({
          horizon,
          direction,
          start: dateRange.start,
          end: dateRange.end,
          topN: 20,
          windowDays: DEFAULT_LOOKBACK_DAYS,
        }, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setTokenPerformance(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error?.message || "Unable to load token expectancy charts";
          setTokenError(message);
          setTokenPerformance({ html_top: null, html_bottom: null, count: 0 });
          toast.error(message);
        }
      } finally {
        if (!controller.signal.aborted) setTokenLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [horizon, direction, dateRange.start, dateRange.end]);

  useEffect(() => {
    if (!dateRange.start || !dateRange.end) return;
    const controller = new AbortController();
    const load = async () => {
      setRollingLoading(true);
      setRollingError(null);
      try {
        const data = await rollingExpectancyPlot(
          {
            horizon,
            direction,
            start: dateRange.start,
            end: dateRange.end,
          },
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          setRollingHtml(data?.html || null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error?.message || "Unable to load rolling expectancy";
          setRollingError(message);
          setRollingHtml(null);
        }
      } finally {
        if (!controller.signal.aborted) setRollingLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [horizon, direction, dateRange.start, dateRange.end]);

  useEffect(() => {
    if (!dateRange.start || !dateRange.end) return;
    const controller = new AbortController();
    const load = async () => {
      setExpectancyDistLoading(true);
      try {
        const data = await expectancyDistributionPlot(
          {
            horizon,
            direction,
            start: dateRange.start,
            end: dateRange.end,
            bins: 20,
          },
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          setExpectancyDistHtml(data?.html || null);
          if (data?.summary) setExpectancyDistSummary(data.summary);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setExpectancyDistHtml(null);
          setExpectancyDistSummary({ mean: 0, std: 0, pos: 0 });
        }
      } finally {
        if (!controller.signal.aborted) setExpectancyDistLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [horizon, direction, dateRange.start, dateRange.end]);

  useEffect(() => {
    if (!dateRange.start || !dateRange.end) return;
    const controller = new AbortController();
    const load = async () => {
      setBootstrapLoading(true);
      try {
        const data = await bootstrapExpectancyDistributionPlot(
          {
            horizon,
            direction,
            start: dateRange.start,
            end: dateRange.end,
            samples: 10000,
            bins: 20,
          },
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          setBootstrapHtml(data?.html || null);
          if (data?.summary) setBootstrapSummary(data.summary);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setBootstrapHtml(null);
          setBootstrapSummary({ mean: 0, ci_lower: 0, ci_upper: 0 });
        }
      } finally {
        if (!controller.signal.aborted) setBootstrapLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [horizon, direction, dateRange.start, dateRange.end]);

  const topExpectancyTitle = `Top 20 Tokens by Expectancy (${horizonLabel} • ${directionLabel})`;
  const bottomExpectancyTitle = `Bottom 20 Tokens by Expectancy (${horizonLabel} • ${directionLabel})`;

  if (dataLoading && !dateRange.start) {
    return <ChartCardSkeleton height={480} />;
  }

  return (
    <Section
      title="Classification Model Performance"
      rightSlot={(
        <Button asChild variant="outline" size="sm" className="border-slate-700 text-slate-200">
          <Link to={createPageUrl("Signals")}>
            <span className="flex items-center">
              <Download className="w-4 h-4 mr-2" />
              Download this view
            </span>
          </Link>
        </Button>
      )}
    >
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
              min={availableRange.start || '2019-01-01'}
              max={availableRange.end || dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
              className="bg-slate-800 border border-slate-700 px-2 py-1 rounded h-9 text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">To</span>
            <input
              type="date"
              value={dateRange.end}
              min={availableRange.start || '2019-01-01'}
              max={availableRange.end || dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
              className="bg-slate-800 border border-slate-700 px-2 py-1 rounded h-9 text-white"
            />
          </div>
        </div>

        <div className="text-center">
          <h3 className="text-2xl font-semibold text-white mb-4">
            Monthly Expectancy ({horizonLabel} {directionLabel})
          </h3>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
                Mean <InfoTooltip title="Average Expectancy" description="Average monthly expectancy for the selected model and direction." />
              </div>
              <div className="text-xl font-bold text-white mt-1">
                {monthlyStats.mean != null ? `${(monthlyStats.mean * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
                Std Dev <InfoTooltip title="Volatility" description="Standard deviation of monthly expectancies." />
              </div>
              <div className="text-xl font-bold text-white mt-1">
                {monthlyStats.std != null ? `${(monthlyStats.std * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
                Positive Months % <InfoTooltip title="Hit Rate" description="Share of months with positive expectancy." />
              </div>
              <div className="text-xl font-bold text-white mt-1">
                {monthlyStats.positiveRatio != null ? `${(monthlyStats.positiveRatio * 100).toFixed(1)}%` : "—"}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
              <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
                Latest Month <InfoTooltip title="Most Recent" description="Most recent month’s expectancy." />
              </div>
              <div className="text-xl font-bold text-white mt-1">
                {monthlyStats.latest != null ? `${(monthlyStats.latest * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {rollingBadge}
          <Section
            title={`Rolling 30-Day Expectancy (${horizonLabel} ${directionLabel})`}
            subtitle="30-day moving average of daily cross-sectional expectancies for the selected horizon and direction"
          >
            {rollingLoading ? (
              <ChartCardSkeleton height={360} />
            ) : rollingHtml ? (
              <iframe
                srcDoc={rollingHtml}
                sandbox="allow-scripts"
                title="Rolling Expectancy"
                className="w-full rounded-md"
                style={{ height: 380, border: "none", background: "transparent" }}
              />
            ) : (
              <div className="text-slate-400 text-sm p-4 text-center">
                {rollingError || "No rolling expectancy data for this range."}
              </div>
            )}
          </Section>
        </div>

        {tokenError ? (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {tokenError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4 min-h-[360px]">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h3 className="text-md font-semibold text-white">{topExpectancyTitle}</h3>
              <InfoTooltip
                title="Top Tokens Expectancy"
                description="Displays the average expectancy for the symbols with the strongest signals over the selected window."
              />
            </div>
            <PlotFrame html={tokenPerformance.html_top} loading={tokenLoading} emptyMessage="No expectancy data available." />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4 min-h-[360px]">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h3 className="text-md font-semibold text-white">{bottomExpectancyTitle}</h3>
              <InfoTooltip
                title="Bottom Tokens Expectancy"
                description="Highlights the symbols with the weakest expectancy so you can identify short candidates."
              />
            </div>
            <PlotFrame html={tokenPerformance.html_bottom} loading={tokenLoading} emptyMessage="No expectancy data available." />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm text-white">Distribution of Daily Cross-Sectional Expectancy</div>
              <InfoTooltip
                title="Daily Expectancy Distribution"
                description="Histogram of daily cross-sectional expectancies across the selected window." />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-slate-800/60 rounded p-2 text-center">
                <div className="text-[11px] text-slate-400">Mean</div>
                <div className="text-sm font-semibold">{(((expectancyDistSummary.mean ?? 0)) * 100).toFixed(2)}%</div>
              </div>
              <div className="bg-slate-800/60 rounded p-2 text-center">
                <div className="text-[11px] text-slate-400">Std Dev</div>
                <div className="text-sm font-semibold">{(((expectancyDistSummary.std ?? 0)) * 100).toFixed(2)}%</div>
              </div>
              <div className="bg-slate-800/60 rounded p-2 text-center">
                <div className="text-[11px] text-slate-400">Positive Days %</div>
                <div className="text-sm font-semibold">{(((expectancyDistSummary.pos ?? 0)) * 100).toFixed(1)}%</div>
              </div>
            </div>
            <PlotFrame html={expectancyDistHtml} loading={expectancyDistLoading} emptyMessage="No expectancy distribution data." />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm text-white">Bootstrapped Distribution of Mean Expectancy</div>
              <InfoTooltip
                title="Bootstrapped Mean Expectancy"
                description="Histogram of bootstrapped sample means (10,000 resamples) of daily expectancies." />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-slate-800/60 rounded p-2 text-center">
                <div className="text-[11px] text-slate-400">Mean</div>
                <div className="text-sm font-semibold">{(((bootstrapSummary.mean ?? 0)) * 100).toFixed(2)}%</div>
              </div>
              <div className="bg-slate-800/60 rounded p-2 text-center">
                <div className="text-[11px] text-slate-400">99% CI</div>
                <div className="text-sm font-semibold">
                  [{(((bootstrapSummary.ci_lower ?? 0)) * 100).toFixed(2)}%, {(((bootstrapSummary.ci_upper ?? 0)) * 100).toFixed(2)}%]
                </div>
              </div>
            </div>
            <PlotFrame html={bootstrapHtml} loading={bootstrapLoading} emptyMessage="No bootstrap data available." />
          </div>
        </div>
      </div>
    </Section>
  );
}
