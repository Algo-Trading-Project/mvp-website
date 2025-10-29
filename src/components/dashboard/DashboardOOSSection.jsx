
import React, { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDownRight, Info } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
  Tooltip,
  ReferenceLine
} from "recharts";
import PerformancePublicSkeleton from "@/components/skeletons/PerformancePublicSkeleton";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rawDaily, rangeSummary } from "@/api/functions";
import { getSupabaseClient } from "@/api/supabaseClient";
import { fetchMetrics, rollingIcPlot, rollingSpreadPlot, predictionsCoverage, quintileReturnsPlot, rollingHitRatePlot } from "@/api/functions";
import ICBySymbol from "@/components/dashboard/ICBySymbol";
import ICDistribution from "@/components/dashboard/ICDistribution";
import SpreadDistribution from "@/components/dashboard/SpreadDistribution";
// functions imported above
import { getCachedFunctionResult } from "@/api/supabaseClient";
import MedianADVByDecile from "@/components/dashboard/MedianADVByDecile";
import BootstrapICDistribution from "@/components/dashboard/BootstrapICDistribution";
import BootstrapSpreadDistribution from "@/components/dashboard/BootstrapSpreadDistribution";
import useMinLoading from "@/hooks/useMinLoading";
// removed Section + Export button + routing imports for compact headers

const MIN_OOS_DATE = "2020-01-01";

export default function DashboardOOSSection() {
  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const storedDefaultRange = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage?.getItem("dashboard-default-range");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.start && parsed?.end) {
        const start = parsed.start < MIN_OOS_DATE ? MIN_OOS_DATE : parsed.start;
        return { start, end: parsed.end };
      }
    } catch (err) {
      console.warn("Failed to read dashboard default range cache", err);
    }
    return null;
  }, []);

  // Removed monthly IC summary fetch (no longer used)

  const cloneSummary = (summary) => ({
    last: summary?.last ?? null,
    last_date: summary?.last_date ?? null,
    deltas: {
      d1: summary?.deltas?.d1 ?? null,
      d7: summary?.deltas?.d7 ?? null,
      d30: summary?.deltas?.d30 ?? null,
    },
  });

  const initialIcCache = React.useMemo(() => {
    if (!storedDefaultRange) return null;
    return getCachedFunctionResult("rolling-ic-plot", {
      start: storedDefaultRange.start,
      end: storedDefaultRange.end,
    });
  }, [storedDefaultRange]);

  const initialSpreadCache = React.useMemo(() => {
    if (!storedDefaultRange) return null;
    return getCachedFunctionResult("rolling-spread-plot", {
      start: storedDefaultRange.start,
      end: storedDefaultRange.end,
    });
  }, [storedDefaultRange]);

  const initialQuintileCache = React.useMemo(() => {
    if (!storedDefaultRange) return null;
    return getCachedFunctionResult("quintile-returns-plot", {
      start: storedDefaultRange.start,
      end: storedDefaultRange.end,
    });
  }, [storedDefaultRange]);

  const initialHitCache = React.useMemo(() => {
    if (!storedDefaultRange) return null;
    return getCachedFunctionResult("rolling-hit-rate-plot", {
      start: storedDefaultRange.start,
      end: storedDefaultRange.end,
      window: 30,
    });
  }, [storedDefaultRange]);

  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(storedDefaultRange ? false : true);
  const [dateRange, setDateRange] = useState(() => storedDefaultRange ? { ...storedDefaultRange } : { start: "", end: "" });
  const [horizon, setHorizon] = useState('1d');
  const [availableRange, setAvailableRange] = useState(() => storedDefaultRange ? { ...storedDefaultRange } : { start: "", end: "" });
  const [topPct, setTopPct] = useState(0.1);
  // Removed monthly rows/summary state (deprecated)

  const [icSvg, setIcSvg] = React.useState(initialIcCache?.html || null);
  const [icSvgLoading, setIcSvgLoading] = React.useState(initialIcCache ? false : true);
  const [icError, setIcError] = React.useState(null);
  const [icSeries, setIcSeries] = React.useState(Array.isArray(initialIcCache?.data) ? initialIcCache.data : []);
  const [icSummary, setIcSummary] = React.useState(cloneSummary(initialIcCache?.summary));

  const [spreadHtml, setSpreadHtml] = React.useState(initialSpreadCache?.html || null);
  const [spreadLoading, setSpreadLoading] = React.useState(initialSpreadCache ? false : true);
  const [spreadError, setSpreadError] = React.useState(null);
  const [spreadSeries, setSpreadSeries] = React.useState(Array.isArray(initialSpreadCache?.data) ? initialSpreadCache.data : []);
  const [spreadSummary, setSpreadSummary] = React.useState(cloneSummary(initialSpreadCache?.summary));

  const [quintileHtml, setQuintileHtml] = React.useState(initialQuintileCache?.html || null);
  const [quintileLoading, setQuintileLoading] = React.useState(initialQuintileCache ? false : true);
  const [quintileError, setQuintileError] = React.useState(null);

  const [hitHtml, setHitHtml] = React.useState(initialHitCache?.html || null);
  const [hitLoading, setHitLoading] = React.useState(initialHitCache ? false : true);
  const [hitError, setHitError] = React.useState(null);
  const [hitSummary, setHitSummary] = React.useState(cloneSummary(initialHitCache?.summary));
  const [rawDailyRows, setRawDailyRows] = React.useState([]);
  const [rawDailyLoading, setRawDailyLoading] = React.useState(false);
  const [rawDailyPage, setRawDailyPage] = React.useState(1);
  const rawDailyLoadedPagesRef = React.useRef(new Set());
  const RAW_PAGE_SIZE = 200;
  // Range-aware summary stats (computed from daily_dashboard_metrics for selected window)
  const [rangeIcStats, setRangeIcStats] = React.useState(null); // { mean, std, positive, icirAnn }
  const [rangeSpreadStats, setRangeSpreadStats] = React.useState(null); // { mean, std, sharpe, positive }
  const [summaryLoading, setSummaryLoading] = React.useState(false);
  // Which table to show SQL for: 'daily' | 'monthly' | null
  const [sqlTable, setSqlTable] = React.useState(null);
  // Schema dialog state
  const [schemaTable, setSchemaTable] = React.useState(null); // 'daily' | 'monthly' | null
  // Chart SQL dialog state
  const [chartSqlOpen, setChartSqlOpen] = React.useState(false);
  const [chartSqlTitle, setChartSqlTitle] = React.useState('');
  const [chartSqlText, setChartSqlText] = React.useState('');

  // Enforce a minimum skeleton duration to prevent flicker on fast responses
  const icSvgLoadingMin = useMinLoading(icSvgLoading, 500);
  const spreadLoadingMin = useMinLoading(spreadLoading, 500);
  const hitLoadingMin = useMinLoading(hitLoading, 500);
  const quintileLoadingMin = useMinLoading(quintileLoading, 500);
  const summaryLoadingMin = useMinLoading(summaryLoading, 500);


  React.useEffect(() => {
    const load = async () => {
      const [metrics, coverageInfo] = await Promise.all([
        // Add a version tag to avoid stale cached monthly stats
        fetchMetrics({ version: 2 }).catch((e) => { console.error("Failed to fetch metrics", e); return { cross: [], monthly: [] }; }),
        predictionsCoverage({ monthsBack: 240 }).catch((error) => {
          console.error("Failed to load predictions coverage", error);
          return null;
        }),
      ]);
      const toNumber = (value) => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') {
          const t = value.trim();
          if (t === '') return null; // treat empty strings as missing
          const n = Number(t);
          return Number.isFinite(n) ? n : null;
        }
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };

      const rows = (metrics?.cross || [])
        .map((row) => ({
          ...row,
          cross_sectional_ic_1d: toNumber(row.cross_sectional_ic_1d),
          rolling_30d_avg_ic: toNumber(row.rolling_30d_avg_ic),
          cs_top_bottom_decile_spread: toNumber(row.cs_top_bottom_decile_spread),
          rolling_30d_avg_top_bottom_decile_spread: toNumber(row.rolling_30d_avg_top_bottom_decile_spread),
          rolling_30d_hit_rate: toNumber(row.rolling_30d_hit_rate),
        }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      setAllRows(rows);

      const earliestDate = rows.length ? rows[0].date : "";
      const latestDate = rows.length ? rows[rows.length - 1].date : "";

      const rawCoverageStart = coverageInfo?.min_date || earliestDate || MIN_OOS_DATE;
      const coverageStart = rawCoverageStart < MIN_OOS_DATE ? MIN_OOS_DATE : rawCoverageStart;
      const rawCoverageEnd = coverageInfo?.max_date || latestDate || coverageStart;
      const coverageEnd = rawCoverageEnd < MIN_OOS_DATE ? MIN_OOS_DATE : rawCoverageEnd;

      // Default full coverage: 2020-01-01 -> latest predictions date
      const defaultEnd = coverageInfo?.latest_date || coverageEnd;
      const defaultStartTarget = MIN_OOS_DATE;
      const clampedStart = coverageStart
        ? (defaultStartTarget < coverageStart ? coverageStart : defaultStartTarget)
        : defaultStartTarget;
      const safeStart = clampedStart > defaultEnd ? coverageStart : clampedStart;

      setAvailableRange({
        start: coverageStart,
        end: coverageEnd,
      });

      setDateRange({ start: safeStart, end: defaultEnd });

      if (typeof window !== "undefined") {
        try {
          window.sessionStorage?.setItem("dashboard-default-range", JSON.stringify({ start: safeStart, end: defaultEnd }));
        } catch (err) {
          console.warn("Failed to cache dashboard default range", err);
        }
      }

      // monthly metrics deprecated

      setLoading(false);
    };
    load();
  }, []);

  // New useEffect for loading the Plotly HTML for IC
  React.useEffect(() => {
    const load = async () => {
      setIcError(null);
      const endDate = dateRange.end || (allRows.length ? allRows[allRows.length - 1].date : null);
      if (!endDate) {
        setIcSvg(null);
        setIcError(null);
        setIcSvgLoading(false);
        return;
      }
      const fallbackStart = dateRange.start || (allRows.length ? allRows[0].date : undefined);
      // Prefer instant cached render when available
      const cached = getCachedFunctionResult("rolling-ic-plot", { start: fallbackStart, end: endDate, horizon });
      setIcSvgLoading(!cached);
      if (cached) {
        setIcSvg(cached?.html || null);
        setIcSeries(Array.isArray(cached?.data) ? cached.data : []);
        if (cached?.summary) setIcSummary(cached.summary);
      }
      try {
        const data = await rollingIcPlot({ start: fallbackStart, end: endDate, horizon });
        setIcSvg(data?.html || null);
        setIcSeries(Array.isArray(data?.data) ? data.data : []);
        if (data?.summary) setIcSummary(data.summary);
      } catch (error) {
        console.error("Failed to load rolling IC plot", error);
        const message = error?.message || "Unable to load rolling IC plot.";
        setIcError(message);
        setIcSvg(null);
        setIcSeries([]);
        setIcSummary({ last: null, last_date: null, deltas: { d1: null, d7: null, d30: null } });
      } finally {
        setIcSvgLoading(false);
      }
    };
    if ((dateRange.start && dateRange.end) || (dateRange.start && allRows.length)) {
      load();
    }
  }, [dateRange.start, dateRange.end, allRows, horizon]);

  // Load Plotly HTML for Decile Spread
  React.useEffect(() => {
    const load = async () => {
      setSpreadError(null);
      const endDate = dateRange.end || (allRows.length ? allRows[allRows.length - 1].date : null);
      if (!endDate) {
        setSpreadHtml(null);
        setSpreadError(null);
        setSpreadLoading(false);
        return;
      }
      const fallbackStart = dateRange.start || (allRows.length ? allRows[0].date : undefined);
      const cached = getCachedFunctionResult("rolling-spread-plot", { start: fallbackStart, end: endDate, horizon, top_pct: topPct });
      setSpreadLoading(!cached);
      if (cached) {
        setSpreadHtml(cached?.html || null);
        setSpreadSeries(Array.isArray(cached?.data) ? cached.data : []);
        if (cached?.summary) setSpreadSummary(cached.summary);
      }
      try {
        const data = await rollingSpreadPlot({ start: fallbackStart, end: endDate, horizon, top_pct: topPct });
        setSpreadHtml(data?.html || null);
        setSpreadSeries(Array.isArray(data?.data) ? data.data : []);
        if (data?.summary) setSpreadSummary(data.summary);
      } catch (error) {
        console.error("Failed to load rolling spread plot", error);
        const message = error?.message || "Unable to load rolling spread plot.";
        setSpreadError(message);
        setSpreadHtml(null);
        setSpreadSeries([]);
        setSpreadSummary({ last: null, last_date: null, deltas: { d1: null, d7: null, d30: null } });
      } finally {
        setSpreadLoading(false);
      }
    };
    if ((dateRange.start && dateRange.end) || (dateRange.start && allRows.length)) {
      load();
    }
  }, [dateRange.start, dateRange.end, allRows, horizon, topPct]);

  // Load Quintile Returns plot
  React.useEffect(() => {
    const load = async () => {
      setQuintileError(null);
      if (!dateRange.start || !dateRange.end) { setQuintileHtml(null); setQuintileLoading(false); return; }
      const payload = { start: dateRange.start, end: dateRange.end, horizon };
      const cached = getCachedFunctionResult("quintile-returns-plot", payload);
      setQuintileLoading(!cached);
      if (cached) setQuintileHtml(cached?.html || null);
      try {
        const data = await quintileReturnsPlot(payload);
        setQuintileHtml(data?.html || null);
      } catch (e) {
        setQuintileHtml(null);
        setQuintileError(e?.message || 'Unable to load quintile returns plot');
      } finally {
        setQuintileLoading(false);
      }
    };
    load();
  }, [dateRange.start, dateRange.end, horizon]);

  // Load Raw Data (daily + monthly)
  React.useEffect(() => {
    const load = async () => {
      if (!dateRange.start || !dateRange.end) return;
      const isNewPage = !rawDailyLoadedPagesRef.current.has(rawDailyPage);
      setRawDailyLoading(isNewPage);
      try {
        const dailyRes = await rawDaily({ start: dateRange.start, end: dateRange.end, page: rawDailyPage, page_size: RAW_PAGE_SIZE });
        setRawDailyRows(Array.isArray(dailyRes?.rows) ? dailyRes.rows : []);
        rawDailyLoadedPagesRef.current.add(rawDailyPage);
      } catch (_e) {
        setRawDailyRows([]);
      } finally {
        setRawDailyLoading(false);
      }
    };
    load();
  }, [dateRange.start, dateRange.end, rawDailyPage]);

  // Reset daily raw table to first page whenever the date range changes
  React.useEffect(() => {
    setRawDailyPage(1);
    rawDailyLoadedPagesRef.current = new Set();
  }, [dateRange.start, dateRange.end]);

  // Compute range-aware IC and Spread summaries from daily_dashboard_metrics via RPC
  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!dateRange.start || !dateRange.end) return;
      setSummaryLoading(true);
      try {
        const res = await rangeSummary({
          start: dateRange.start,
          end: dateRange.end,
          horizon,
          use_p05: topPct === 0.05,
        });
        if (!cancelled && res) {
          setRangeIcStats({
            mean: res.ic_mean ?? null,
            std: res.ic_std ?? null,
            positive: res.ic_positive ?? null,
            icirAnn: res.ic_icir_ann ?? null,
          });
          setRangeSpreadStats({
            mean: res.spread_mean ?? null,
            std: res.spread_std ?? null,
            sharpe: res.spread_sharpe_ann ?? null,
            positive: res.spread_positive ?? null,
          });
        }
      } catch (err) {
        console.warn('range_summary RPC failed', err);
        if (!cancelled) { setRangeIcStats(null); setRangeSpreadStats(null); }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [dateRange.start, dateRange.end, horizon, topPct]);

  const dailySql = `-- Historical predictions data can be obtained via REST API
with
  dates as (
    select distinct
      date
    from
      predictions
  ),
  cs_pred_rankings_1d as (
    select
      date,
      symbol_id,
      forward_returns_1,
      predicted_returns_1,
      RANK() over (partition by date order by predicted_returns_1) as cs_pred_rank_1d,
      RANK() over (partition by date order by forward_returns_1) as cs_forward_return_rank_1d,
      PERCENT_RANK() over (partition by date order by predicted_returns_1) as cs_pred_percentile_1d
    from predictions
    where predicted_returns_1 is not null and forward_returns_1 is not null
  ),
  cs_metrics_1d as (
    select
      date,
      CORR(cs_pred_rank_1d, cs_forward_return_rank_1d) as cs_spearman_ic_1d,
      AVG(forward_returns_1) filter (where cs_pred_percentile_1d >= 0.9)
        - AVG(forward_returns_1) filter (where cs_pred_percentile_1d <= 0.1) as cs_top_bottom_decile_spread_1d,
      AVG(forward_returns_1) filter (where cs_pred_percentile_1d >= 0.95)
        - AVG(forward_returns_1) filter (where cs_pred_percentile_1d <= 0.05) as cs_top_bottom_p05_spread_1d,
      SUM(case when SIGN(predicted_returns_1) = SIGN(forward_returns_1) then 1 else 0 end) as cs_hit_count_1d,
      COUNT(forward_returns_1) as total_count_1d
    from cs_pred_rankings_1d group by date
  ),
  cs_pred_rankings_3d as (
    select
      date,
      symbol_id,
      forward_returns_3,
      predicted_returns_3,
      RANK() over (partition by date order by predicted_returns_3) as cs_pred_rank_3d,
      RANK() over (partition by date order by forward_returns_3) as cs_forward_return_rank_3d,
      PERCENT_RANK() over (partition by date order by predicted_returns_3) as cs_pred_percentile_3d
    from predictions
    where predicted_returns_3 is not null and forward_returns_3 is not null
  ),
  cs_metrics_3d as (
    select
      date,
      CORR(cs_pred_rank_3d, cs_forward_return_rank_3d) as cs_spearman_ic_3d,
      AVG(forward_returns_3) filter (where cs_pred_percentile_3d >= 0.9)
        - AVG(forward_returns_3) filter (where cs_pred_percentile_3d <= 0.1) as cs_top_bottom_decile_spread_3d,
      AVG(forward_returns_3) filter (where cs_pred_percentile_3d >= 0.95)
        - AVG(forward_returns_3) filter (where cs_pred_percentile_3d <= 0.05) as cs_top_bottom_p05_spread_3d,
      SUM(case when SIGN(predicted_returns_3) = SIGN(forward_returns_3) then 1 else 0 end) as cs_hit_count_3d,
      COUNT(forward_returns_3) as total_count_3d
    from cs_pred_rankings_3d group by date
  ),
  cs_metrics_joined as (
    select d.date,
      m1d.cs_spearman_ic_1d,
      m1d.cs_top_bottom_decile_spread_1d,
      m1d.cs_top_bottom_p05_spread_1d,
      m1d.cs_hit_count_1d,
      m1d.total_count_1d,
      m3d.cs_spearman_ic_3d,
      m3d.cs_top_bottom_decile_spread_3d,
      m3d.cs_top_bottom_p05_spread_3d,
      m3d.cs_hit_count_3d,
      m3d.total_count_3d
    from dates d
    left join cs_metrics_1d m1d on d.date = m1d.date
    left join cs_metrics_3d m3d on d.date = m3d.date
  )
select * from cs_metrics_joined;`;

  // Removed monthlySql (deprecated)

  // Column schema descriptions for the Raw Data tables
  const tableSchemas = React.useMemo(() => ({
    daily: [
      { name: 'date', type: 'date', desc: 'Trading date for which the cross‑sectional metrics were computed.' },
      { name: 'cs_spearman_ic_1d', type: 'float', desc: 'Daily Spearman rank correlation between predicted ranks and next‑day returns (1‑day horizon).' },
      { name: 'cs_top_bottom_decile_spread_1d', type: 'float', desc: 'Average return of top 10% predicted minus bottom 10% predicted (1‑day horizon).' },
      { name: 'cs_top_bottom_p05_spread_1d', type: 'float', desc: 'Average return of top 5% predicted minus bottom 5% predicted (1‑day horizon).' },
      { name: 'cs_hit_count_1d', type: 'integer', desc: 'Count of assets where sign(prediction) matches sign(realized next‑day return).' },
      { name: 'total_count_1d', type: 'integer', desc: 'Total number of assets considered that day for the 1‑day horizon.' },
      { name: 'cs_spearman_ic_3d', type: 'float', desc: 'Daily Spearman rank correlation between predicted ranks and 3‑day forward returns (3‑day horizon).' },
      { name: 'cs_top_bottom_decile_spread_3d', type: 'float', desc: 'Average return of top 10% predicted minus bottom 10% predicted (3‑day horizon).' },
      { name: 'cs_top_bottom_p05_spread_3d', type: 'float', desc: 'Average return of top 5% predicted minus bottom 5% predicted (3‑day horizon).' },
      { name: 'cs_hit_count_3d', type: 'integer', desc: 'Count of assets where sign(prediction) matches sign(realized 3‑day return).' },
      { name: 'total_count_3d', type: 'integer', desc: 'Total number of assets considered that day for the 3‑day horizon.' },
    ],
    monthly: [
      { name: 'avg_cs_spearman_ic_1d', type: 'float', desc: 'Average of daily 1‑day IC across the full sample.' },
      { name: 'std_cs_spearman_ic_1d', type: 'float', desc: 'Standard deviation of daily 1‑day IC.' },
      { name: 'annualized_icir_1d', type: 'float', desc: 'Annualized ICIR for 1‑day horizon: mean/std × √365.' },
      { name: 'pct_days_cs_ic_1d_above_0', type: 'float', desc: 'Fraction of days where the 1‑day IC > 0.' },
      { name: 'avg_cs_decile_spread_1d', type: 'float', desc: 'Average daily 1‑day top‑bottom decile spread.' },
      { name: 'std_cs_decile_spread_1d', type: 'float', desc: 'Standard deviation of daily 1‑day top‑bottom decile spread.' },
      { name: 'annualized_cs_decile_spread_sharpe_1d', type: 'float', desc: 'Annualized Sharpe proxy for 1‑day decile spread: mean/std × √365.' },
      { name: 'pct_days_cs_decile_spread_above_0_1d', type: 'float', desc: 'Fraction of days where 1‑day decile spread > 0.' },
      { name: 'avg_cs_p05_spread_1d', type: 'float', desc: 'Average daily 1‑day top‑bottom 5% spread.' },
      { name: 'std_cs_p05_spread_1d', type: 'float', desc: 'Standard deviation of daily 1‑day top‑bottom 5% spread.' },
      { name: 'annualized_cs_p05_spread_sharpe_1d', type: 'float', desc: 'Annualized Sharpe proxy for 1‑day 5% spread: mean/std × √365.' },
      { name: 'pct_days_cs_p05_spread_above_0_1d', type: 'float', desc: 'Fraction of days where 1‑day 5% spread > 0.' },
      { name: 'avg_cs_spearman_ic_3d', type: 'float', desc: 'Average of daily 3‑day IC across the full sample.' },
      { name: 'std_cs_spearman_ic_3d', type: 'float', desc: 'Standard deviation of daily 3‑day IC.' },
      { name: 'annualized_icir_3d', type: 'float', desc: 'Annualized ICIR for 3‑day horizon: mean/std × √365.' },
      { name: 'pct_days_cs_ic_3d_above_0', type: 'float', desc: 'Fraction of days where the 3‑day IC > 0.' },
      { name: 'avg_cs_decile_spread_3d', type: 'float', desc: 'Average daily 3‑day top‑bottom decile spread.' },
      { name: 'std_cs_decile_spread_3d', type: 'float', desc: 'Standard deviation of daily 3‑day top‑bottom decile spread.' },
      { name: 'annualized_cs_decile_spread_sharpe_3d', type: 'float', desc: 'Annualized Sharpe proxy for 3‑day decile spread: mean/std × √365.' },
      { name: 'pct_days_cs_decile_spread_above_0_3d', type: 'float', desc: 'Fraction of days where 3‑day decile spread > 0.' },
      { name: 'avg_cs_p05_spread_3d', type: 'float', desc: 'Average daily 3‑day top‑bottom 5% spread.' },
      { name: 'std_cs_p05_spread_3d', type: 'float', desc: 'Standard deviation of daily 3‑day top‑bottom 5% spread.' },
      { name: 'annualized_cs_p05_spread_sharpe_3d', type: 'float', desc: 'Annualized Sharpe proxy for 3‑day 5% spread: mean/std × √365.' },
      { name: 'pct_days_cs_p05_spread_above_0_3d', type: 'float', desc: 'Fraction of days where 3‑day 5% spread > 0.' },
    ],
  }), []);

  const SchemaView = ({ table }) => {
    const isMonthly = table === 'monthly';
    const items = isMonthly ? tableSchemas.monthly : tableSchemas.daily;
    // Disable inner scroll for monthly; keep for daily
    const containerClass = isMonthly ? 'overflow-visible' : 'overflow-auto max-h-[92vh]';
    const wrapperClass = isMonthly ? 'border border-slate-800 rounded-md' : 'min-w-[1400px] border border-slate-800 rounded-md';
    // Monthly: slightly smaller to avoid any overflow
    const nameCellClass = isMonthly
      ? 'px-2 py-1 font-mono text-[10px] leading-4 text-slate-100 pr-4 whitespace-normal break-words'
      : 'px-3 py-2 font-mono text-[12px] text-slate-100 whitespace-nowrap pr-8';
    const typeCellClass = isMonthly
      ? 'px-2 py-1 text-[10px] leading-4 text-sky-300 whitespace-nowrap pr-4'
      : 'px-3 py-2 text-[12px] text-sky-300 whitespace-nowrap pr-6';
    const descCellClass = isMonthly
      ? 'px-2 py-1 text-[10px] leading-4 text-white'
      : 'px-3 py-2 text-sm text-white leading-5';
    return (
      <div className={`${containerClass}`}>
        <div className={`${wrapperClass}`}>
          <table className={`w-full ${isMonthly ? 'table-fixed' : ''}`}>
            {isMonthly && (
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '48%' }} />
              </colgroup>
            )}
            <thead className="bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
              <tr className={isMonthly ? 'text-[10px] uppercase tracking-wide text-white' : 'text-[11px] uppercase tracking-wide text-white'}>
                <th className={isMonthly ? 'text-left px-2 py-1' : 'text-left px-3 py-2'}>Column</th>
                <th className={isMonthly ? 'text-left px-2 py-1' : 'text-left px-3 py-2'}>Type</th>
                <th className={isMonthly ? 'text-left px-2 py-1' : 'text-left px-3 py-2'}>Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((col, i) => (
                <tr key={col.name} className={i % 2 ? 'bg-slate-900/30' : 'bg-slate-900/10'}>
                  <td className={nameCellClass}>{col.name}</td>
                  <td className={typeCellClass}>{col.type}</td>
                  <td className={descCellClass}>{col.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Load Rolling Hit Rate plot
  React.useEffect(() => {
    const load = async () => {
      setHitError(null);
      if (!dateRange.start || !dateRange.end) { setHitHtml(null); setHitLoading(false); return; }
      const payload = { start: dateRange.start, end: dateRange.end, window: 30, horizon };
      const cached = getCachedFunctionResult("rolling-hit-rate-plot", payload);
      setHitLoading(!cached);
      if (cached) {
        setHitHtml(cached?.html || null);
        if (cached?.summary) setHitSummary(cached.summary);
      }
      try {
        const data = await rollingHitRatePlot(payload);
        setHitHtml(data?.html || null);
        if (data?.summary) setHitSummary(data.summary);
      } catch (e) {
        setHitHtml(null);
        setHitError(e?.message || 'Unable to load rolling hit rate plot');
        setHitSummary({ last: null, last_date: null, deltas: { d1: null, d7: null, d30: null } });
      } finally {
        setHitLoading(false);
      }
    };
    load();
  }, [dateRange.start, dateRange.end, horizon]);


  // Summaries from backend functions (already computed within filtered range)
  const icDeltas = React.useMemo(() => ({
    cur: typeof icSummary?.last === 'number' ? Number(icSummary.last) : null,
    d1: typeof icSummary?.deltas?.d1 === 'number' ? Number(icSummary.deltas.d1) : null,
    d7: typeof icSummary?.deltas?.d7 === 'number' ? Number(icSummary.deltas.d7) : null,
    d30: typeof icSummary?.deltas?.d30 === 'number' ? Number(icSummary.deltas.d30) : null,
  }), [icSummary]);
  const spreadDeltas = React.useMemo(() => ({
    cur: typeof spreadSummary?.last === 'number' ? Number(spreadSummary.last) : null,
    d1: typeof spreadSummary?.deltas?.d1 === 'number' ? Number(spreadSummary.deltas.d1) : null,
    d7: typeof spreadSummary?.deltas?.d7 === 'number' ? Number(spreadSummary.deltas.d7) : null,
    d30: typeof spreadSummary?.deltas?.d30 === 'number' ? Number(spreadSummary.deltas.d30) : null,
  }), [spreadSummary]);

  const formatDelta = (val, { asPct = false, decimals = 4 }) => {
    if (val === null || typeof val !== "number" || Number.isNaN(val)) return "—";
    return asPct ? `${val >= 0 ? "+" : ""}${(val * 100).toFixed(decimals)}%` : `${val >= 0 ? "+" : ""}${val.toFixed(decimals)}`;
  };

  const deltaClass = (val) => {
    if (val === null || typeof val !== "number" || Number.isNaN(val)) return "text-white";
    return val >= 0 ? "text-emerald-400" : "text-red-400";
  };

  // Lightweight SQL syntax highlighter for the Show SQL dialog
  const highlightSql = (sql) => {
    if (!sql) return "";
    const escape = (s) => s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    let out = escape(sql);
    // Comments -- ...
    out = out.replace(/(^|\n)\s*--.*(?=\n|$)/g, (m) => `<span class=\"com\">${m}</span>`);
    // Strings '...'
    out = out.replace(/'(?:''|[^'])*'/g, (m) => `<span class=\"str\">${m}</span>`);
    // Numbers
    out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, `<span class=\"num\">$1</span>`);
    // Functions (identifier followed by parenthesis)
    out = out.replace(/\b([a-z_][a-z0-9_]*)\s*(?=\()/gi, `<span class=\"fn\">$1</span>`);
    // Keywords
    const KW = [
      'select','from','where','group','by','order','join','left','right','inner','outer','on','as','with','create','materialized','view','case','when','then','else','end','avg','stddev','sum','count','rank','percent_rank','over','partition','union','all','distinct','and','or','not','between','like','desc','asc','limit','offset','window'
    ];
    const kwRe = new RegExp(`\\b(${KW.join('|')})\\b`, 'gi');
    out = out.replace(kwRe, (m) => `<span class=\"kw\">${m.toUpperCase()}</span>`);
    return out;
  };
  const renderSql = (sql) => (
    <div className="overflow-auto max-h-[70vh] rounded border border-slate-800 bg-slate-900">
      <style dangerouslySetInnerHTML={{ __html: `
        .sql-pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \'Liberation Mono\', \'Courier New\', monospace; color: #e5e7eb; }
        .sql-pre .kw { color: #93c5fd; }
        .sql-pre .fn { color: #a78bfa; }
        .sql-pre .str { color: #fca5a5; }
        .sql-pre .num { color: #fdba74; }
        .sql-pre .com { color: #94a3b8; font-style: italic; }
      ` }} />
      <pre className="sql-pre p-3 text-xs whitespace-pre leading-5" dangerouslySetInnerHTML={{ __html: highlightSql(sql) }} />
    </div>
  );

  const CopyButton = ({ text }) => {
    const [copied, setCopied] = React.useState(false);
    return (
      <button
        className={`text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 ${copied ? 'opacity-80' : ''}`}
        onClick={async () => { await copyToClipboard(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      >{copied ? 'Copied' : 'Copy SQL'}</button>
    );
  };

  const esc = (s) => String(s ?? '').replaceAll("'", "''");
  const buildRollingIcSql = () => {
    const field = horizon === '3d' ? 'cs_spearman_ic_3d' : 'cs_spearman_ic_1d';
    return `select d.date,
       avg(d.${field}) over (
         order by d.date
         rows between (30 - 1) preceding and current row
       ) as value
from daily_dashboard_metrics d
where d.date between '${esc(dateRange.start)}' and '${esc(dateRange.end)}'
order by d.date
limit 1000 offset 0;`;
  };
  const buildRollingSpreadSql = () => {
    const field = horizon === '3d'
      ? (topPct <= 0.05 ? 'cs_top_bottom_p05_spread_3d' : 'cs_top_bottom_decile_spread_3d')
      : (topPct <= 0.05 ? 'cs_top_bottom_p05_spread_1d' : 'cs_top_bottom_decile_spread_1d');
    return `select d.date,
       avg(d.${field}) over (
         order by d.date
         rows between (30 - 1) preceding and current row
       ) as value
from daily_dashboard_metrics d
where d.date between '${esc(dateRange.start)}' and '${esc(dateRange.end)}'
order by d.date
limit 1000 offset 0;`;
  };
  const buildRollingHitSql = () => {
    const hitCol = horizon === '3d' ? 'cs_hit_count_3d' : 'cs_hit_count_1d';
    const totCol = horizon === '3d' ? 'total_count_3d' : 'total_count_1d';
    const win = 30; // UI uses 30d window consistently
    return `select d.date,
       (sum(d.${hitCol}) over (
          order by d.date rows between (${win} - 1) preceding and current row
        ))::double precision
       / nullif(sum(d.${totCol}) over (
            order by d.date rows between (${win} - 1) preceding and current row
          ), 0) as rolling_hit_rate
from daily_dashboard_metrics d
where d.date between '${esc(dateRange.start)}' and '${esc(dateRange.end)}'
order by d.date
limit 1000 offset 0;`;
  };
  const buildQuintileReturnsSql = () => {
    const pred = horizon === '3d' ? 'predicted_returns_3' : 'predicted_returns_1';
    const fwd = horizon === '3d' ? 'forward_returns_3' : 'forward_returns_1';
    return `-- Historical predictions data can be obtained via REST API
with base as (
  select
    date,
    ${pred} as pred,
    ${fwd}  as fwd
  from predictions
  where date between '${esc(dateRange.start)}' and '${esc(dateRange.end)}'
    and ${pred} is not null
    and ${fwd}  is not null
), ranked as (
  select date,
         ntile(10) over (partition by date order by pred) as decile,
         fwd
  from base
), per_date as (
  select date, decile, avg(fwd) as avg_ret
  from ranked
  group by date, decile
)
select decile, avg(avg_ret) as avg_return
from per_date
group by decile
order by decile;`;
  };

  // Resolved SQL for Summary (IC + Spread) over selected range (no CASEs)
  const buildSummarySql = () => {
    const icField = horizon === '3d' ? 'cs_spearman_ic_3d' : 'cs_spearman_ic_1d';
    const spreadField = horizon === '3d'
      ? (topPct <= 0.05 ? 'cs_top_bottom_p05_spread_3d' : 'cs_top_bottom_decile_spread_3d')
      : (topPct <= 0.05 ? 'cs_top_bottom_p05_spread_1d' : 'cs_top_bottom_decile_spread_1d');
    return `with filtered as (
  select ${icField} as ic,
         ${spreadField} as sp
  from daily_dashboard_metrics
  where date between '${esc(dateRange.start)}' and '${esc(dateRange.end)}'
)
select
  avg(ic)::double precision as ic_mean,
  stddev_samp(ic)::double precision as ic_std,
  avg(case when ic > 0 then 1 else 0 end)::double precision as ic_positive,
  (avg(ic) / stddev_samp(ic)) * sqrt(365)::double precision as icir_ann,
  avg(sp)::double precision as spread_mean,
  stddev_samp(sp)::double precision as spread_std,
  (avg(sp) / stddev_samp(sp)) * sqrt(365)::double precision as spread_sharpe_ann,
  avg(case when sp > 0 then 1 else 0 end)::double precision as spread_positive
from filtered;`;
  };

  // Simple clipboard copy helper for SQL dialog
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_e) {
      const ta = document.createElement('textarea');
      ta.value = text || '';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { ta.remove(); }
    }
  };

  // Range-aware IC aggregates for badges
  const globalStats = React.useMemo(() => {
    if (rangeIcStats) {
      return {
        meanIc: rangeIcStats.mean ?? null,
        stdIc: rangeIcStats.std ?? null,
        positiveProp: rangeIcStats.positive ?? null,
        icirAnn: rangeIcStats.icirAnn ?? null,
      };
    }
    return { meanIc: null, stdIc: null, positiveProp: null, icirAnn: null };
  }, [rangeIcStats]);

  const minDateForInputs = React.useMemo(() => {
    if (availableRange.start && availableRange.start > MIN_OOS_DATE) {
      return availableRange.start;
    }
    return MIN_OOS_DATE;
  }, [availableRange.start]);

  // Info tooltip component with hover functionality and no focus outline
  const InfoTooltip = ({ title, description }) => {
    const [open, setOpen] = React.useState(false);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="text-slate-300 hover:text-slate-200 transition-colors focus:outline-none focus-visible:outline-none"
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

  // NEW: top control bar (date pickers) - compact, right-aligned, no background
  const controlBar = (
    <div className="flex w-full items-center justify-end mb-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <InfoTooltip
            title="Model Horizon"
            description="Choose the prediction horizon (1‑day or 3‑day). Updates all badges and plots on this page."
          />
          <label className="text-xs text-slate-300">Model</label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value === '3d' ? '3d' : '1d')}
            className="bg-slate-900 border border-slate-700 px-2 py-1 rounded h-8 text-white"
          >
            <option value="1d">1‑Day</option>
            <option value="3d">3‑Day</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <InfoTooltip
            title="Top/Bottom Spread Percentile"
            description="Controls the fraction of assets used for top and bottom groups in spread metrics (10% = decile; 5% = stronger tails)."
          />
          <label className="text-xs text-slate-300">Spread</label>
          <select
            value={topPct}
            onChange={(e) => setTopPct(Number(e.target.value) === 0.05 ? 0.05 : 0.1)}
            className="bg-slate-900 border border-slate-700 px-2 py-1 rounded h-8 text-white"
          >
            <option value={0.1}>Top/Bottom 10%</option>
            <option value={0.05}>Top/Bottom 5%</option>
          </select>
        </div>
        <label className="text-xs text-slate-300">From</label>
        <input
          type="date"
          value={dateRange.start}
          min={minDateForInputs}
          max={dateRange.end || todayIso}
          onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))}
          disabled={loading}
          className="bg-slate-900 border border-slate-700 px-2 py-1 rounded h-8 text-white"
        />
        <label className="text-xs text-slate-300 ml-2">To</label>
        <input
          type="date"
          value={dateRange.end}
          min={minDateForInputs}
          max={todayIso}
          onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))}
          disabled={loading}
          className="bg-slate-900 border border-slate-700 px-2 py-1 rounded h-8 text-white"
        />
      </div>
    </div>
  );


  

  // Individual monthly badges summarising the 1d regression model
  const monthlyBadges = (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
      {summaryLoadingMin ? (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 animate-pulse">
            <div className="flex items-center justify-center gap-4">
              <div className="min-w-[88px] h-6 bg-slate-800 rounded" />
              <div className="flex flex-col gap-1 w-32">
                <div className="h-3 bg-slate-800 rounded" />
                <div className="h-3 bg-slate-800 rounded" />
                <div className="h-3 bg-slate-800 rounded" />
              </div>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 animate-pulse">
            <div className="flex items-center justify-center gap-4">
              <div className="min-w-[88px] h-6 bg-slate-800 rounded" />
              <div className="flex flex-col gap-1 w-32">
                <div className="h-3 bg-slate-800 rounded" />
                <div className="h-3 bg-slate-800 rounded" />
                <div className="h-3 bg-slate-800 rounded" />
              </div>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 animate-pulse">
            <div className="flex items-center justify-center gap-4">
              <div className="min-w-[88px] h-6 bg-slate-800 rounded" />
              <div className="flex flex-col gap-1 w-32">
                <div className="h-3 bg-slate-800 rounded" />
                <div className="h-3 bg-slate-800 rounded" />
                <div className="h-3 bg-slate-800 rounded" />
              </div>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 animate-pulse">
            <div className="flex items-center justify-center gap-4">
              <div className="min-w-[88px] h-6 bg-slate-800 rounded" />
              <div className="flex flex-col gap-1 w-32">
                <div className="h-3 bg-slate-800 rounded" />
                <div className="h-3 bg-slate-800 rounded" />
                <div className="h-3 bg-slate-800 rounded" />
              </div>
            </div>
          </div>
        </>
      ) : <>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-300 flex items-center justify-center gap-1">
          <InfoTooltip
            title="Mean Daily IC"
            description="Average cross‑sectional Spearman IC across days (horizon‑aware)."
          />
          Mean (IC)
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.meanIc != null ? globalStats.meanIc.toFixed(3) : "—"}</div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-300 flex items-center justify-center gap-1">
          <InfoTooltip
            title="Standard Deviation of IC"
            description="Standard deviation of the daily cross‑sectional IC."
          />
          Std Dev (IC)
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.stdIc != null ? globalStats.stdIc.toFixed(3) : "—"}</div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-300 flex items-center justify-center gap-1">
          <InfoTooltip
            title="Positive Days"
            description="Proportion of days with positive daily IC (1‑day or 3‑day model)."
          />
          Positive Days %
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.positiveProp != null ? `${(globalStats.positiveProp * 100).toFixed(1)}%` : "—"}</div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-300 flex items-center justify-center gap-1">
          <InfoTooltip title="ICIR (annualized)" description="Mean daily IC divided by its std, annualized by √365." />
          ICIR (Annualized)
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.icirAnn != null ? globalStats.icirAnn.toFixed(2) : "—"}</div>
      </div>
      </>}
    </div>
  );


  // Loading skeleton for delta badges while plots update
  const badgesLoading = icSvgLoading || spreadLoading || hitLoading;
  const badgesLoadingDelayed = useMinLoading(badgesLoading, 500);
  const BadgeSkeleton = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 animate-pulse">
      <div className="flex items-center justify-center gap-4">
        <div className="min-w-[88px] h-6 bg-slate-800 rounded" />
        <div className="flex flex-col gap-1 w-32">
          <div className="h-3 bg-slate-800 rounded" />
          <div className="h-3 bg-slate-800 rounded" />
          <div className="h-3 bg-slate-800 rounded" />
        </div>
      </div>
    </div>
  );

  // Summaries from backend function for hit rate (uniform with IC & Spread)
  const hitDeltas = React.useMemo(() => ({
    cur: typeof hitSummary?.last === 'number' ? Number(hitSummary.last) : null,
    d1: typeof hitSummary?.deltas?.d1 === 'number' ? Number(hitSummary.deltas.d1) : null,
    d7: typeof hitSummary?.deltas?.d7 === 'number' ? Number(hitSummary.deltas.d7) : null,
    d30: typeof hitSummary?.deltas?.d30 === 'number' ? Number(hitSummary.deltas.d30) : null,
  }), [hitSummary]);

  // Tighter rolling badges with loading skeleton on date-range changes
  const rollingBadges = (
    <div className="grid gap-6 md:grid-cols-3 mb-4">
      {badgesLoadingDelayed ? (
        <>
          <BadgeSkeleton />
          <BadgeSkeleton />
          <BadgeSkeleton />
        </>
      ) : (
        <>
      {/* Rolling IC */}
      <div className="text-center">
        <h4 className="text-lg font-semibold text-white mb-2 flex items-center justify-center gap-2">
          <InfoTooltip
            title="Rolling Cross‑Sectional IC (30d avg)"
            description="30‑day average of daily cross‑sectional IC (per‑day rank correlation across assets). Not a pooled 30‑day correlation." />
          <span>Rolling IC (30d)</span>
        </h4>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-center gap-4">
            <div className="min-w-[88px]">
              <div className="text-2xl font-bold text-white">{typeof icDeltas.cur === 'number' ? icDeltas.cur.toFixed(4) : "—"}</div>
            </div>
            <div className="flex flex-col gap-1">
                <div className={`flex items-center gap-1 text-xs ${deltaClass(icDeltas.d1)}`}>
                  {icDeltas.d1 === null ? <span className="text-slate-300">1d: —</span> : <>
                    <ArrowUpRight className={`w-3 h-3 ${icDeltas.d1 >= 0 ? "" : "hidden"}`} />
                    <ArrowDownRight className={`w-3 h-3 ${icDeltas.d1 < 0 ? "" : "hidden"}`} />
                    <span className="font-medium">1d: {formatDelta(icDeltas.d1, { asPct: false, decimals: 4 })}</span>
                  </>}
                </div>
                <div className={`flex items-center gap-1 text-xs ${deltaClass(icDeltas.d7)}`}>
                  {icDeltas.d7 === null ? <span className="text-slate-300">7d: —</span> : <>
                    <ArrowUpRight className={`w-3 h-3 ${icDeltas.d7 >= 0 ? "" : "hidden"}`} />
                    <ArrowDownRight className={`w-3 h-3 ${icDeltas.d7 < 0 ? "" : "hidden"}`} />
                    <span className="font-medium">7d: {formatDelta(icDeltas.d7, { asPct: false, decimals: 4 })}</span>
                  </>}
                </div>
                <div className={`flex items-center gap-1 text-xs ${deltaClass(icDeltas.d30)}`}>
                  {icDeltas.d30 === null ? <span className="text-slate-300">30d: —</span> : <>
                    <ArrowUpRight className={`w-3 h-3 ${icDeltas.d30 >= 0 ? "" : "hidden"}`} />
                    <ArrowDownRight className={`w-3 h-3 ${icDeltas.d30 < 0 ? "" : "hidden"}`} />
                    <span className="font-medium">30d: {formatDelta(icDeltas.d30, { asPct: false, decimals: 4 })}</span>
                  </>}
                </div>
              </div>
          </div>
          {/* Raw Data section moved to bottom */}
        </div>
      </div>

      {/* Top/Bottom spread */}
      <div className="text-center">
        <h4 className="text-lg font-semibold text-white mb-2 flex items-center justify-center gap-2">
          <InfoTooltip
            title="Rolling Spread (30d avg)"
            description="30‑day average of daily cross‑sectional top‑minus‑bottom performance using the selected percentile (10% or 5%)." />
          <span>{`Spread (30d • ${topPct === 0.05 ? '5%' : '10%'})`}</span>
        </h4>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-center gap-4">
            <div className="min-w-[88px]">
              <div className="text-2xl font-bold text-white">{typeof spreadDeltas.cur === 'number' ? `${(spreadDeltas.cur * 100).toFixed(2)}%` : "—"}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className={`flex items-center gap-1 text-xs ${deltaClass(spreadDeltas.d1)}`}>
                {spreadDeltas.d1 === null ? <span className="text-slate-300">1d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${spreadDeltas.d1 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${spreadDeltas.d1 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">1d: {formatDelta(spreadDeltas.d1, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${deltaClass(spreadDeltas.d7)}`}>
                {spreadDeltas.d7 === null ? <span className="text-slate-300">7d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${spreadDeltas.d7 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${spreadDeltas.d7 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">7d: {formatDelta(spreadDeltas.d7, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${deltaClass(spreadDeltas.d30)}`}>
                {spreadDeltas.d30 === null ? <span className="text-slate-300">30d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${spreadDeltas.d30 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${spreadDeltas.d30 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">30d: {formatDelta(spreadDeltas.d30, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hit rate */}
      <div className="text-center">
        <h4 className="text-lg font-semibold text-white mb-2 flex items-center justify-center gap-2">
          <InfoTooltip
            title="Rolling Hit Rate (30d avg)"
            description="Share of days where prediction signs matched next‑day returns, averaged over the past 30 days." />
          <span>Hit Rate (30d)</span>
        </h4>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-center gap-4">
            <div className="min-w-[88px]">
              <div className="text-2xl font-bold text-white">{typeof hitDeltas.cur === 'number' ? `${(hitDeltas.cur * 100).toFixed(2)}%` : "—"}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className={`flex items-center gap-1 text-xs ${deltaClass(hitDeltas.d1)}`}>
                {hitDeltas.d1 === null ? <span className="text-slate-300">1d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${hitDeltas.d1 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${hitDeltas.d1 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">1d: {formatDelta(hitDeltas.d1, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${deltaClass(hitDeltas.d7)}`}>
                {hitDeltas.d7 === null ? <span className="text-slate-300">7d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${hitDeltas.d7 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${hitDeltas.d7 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">7d: {formatDelta(hitDeltas.d7, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${deltaClass(hitDeltas.d30)}`}>
                {hitDeltas.d30 === null ? <span className="text-slate-300">30d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${hitDeltas.d30 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${hitDeltas.d30 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">30d: {formatDelta(hitDeltas.d30, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );


  if (loading) {
    return <PerformancePublicSkeleton />;
  }

  return (
    <div className="min-h-screen py-8 bg-slate-950">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Title with clearer spacing */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Regression <span className="gradient-text">Performance</span></h1>
          <p className="text-slate-300 mt-2">
            Out‑of‑sample rolling performance metrics for our {horizon === '3d' ? '3‑day' : '1‑day'} regression model. Data available starting from 2020-01-01.
          </p>
        </div>

        {/* Raw Data section moved below charts */}
        {/* Control bar above everything */}
        {controlBar}

        {/* Metrics: monthly first, then rolling */}
        <div className="space-y-8">
        <div className="text-center mt-8">
          <div className="flex items-center justify-center mb-4 gap-3">
            <h3 className="text-2xl font-semibold text-white">Summary</h3>
            <button
              className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              onClick={() => { setChartSqlTitle('Summary (IC + Spread)'); setChartSqlText(buildSummarySql()); setChartSqlOpen(true); }}
            >Show SQL</button>
          </div>
          {monthlyBadges}
          {/* Spread summary badges (decile/p05) */}
          {(() => {
            // Compute spread stats from daily_dashboard_metrics for selected range
            const is3 = horizon === '3d';
            const useP05 = topPct === 0.05;
            const spreadStats = {
              mean: rangeSpreadStats?.mean ?? null,
              std: rangeSpreadStats?.std ?? null,
              sharpe: rangeSpreadStats?.sharpe ?? null,
              positive: rangeSpreadStats?.positive ?? null,
            };
            const spreadBadgesLoading = summaryLoadingMin;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mt-4">
                {spreadBadgesLoading ? (
                  <>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 animate-pulse">
                      <div className="flex items-center justify-center gap-4">
                        <div className="min-w-[88px] h-6 bg-slate-800 rounded" />
                        <div className="flex flex-col gap-1 w-32">
                          <div className="h-3 bg-slate-800 rounded" />
                          <div className="h-3 bg-slate-800 rounded" />
                          <div className="h-3 bg-slate-800 rounded" />
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 animate-pulse">
                      <div className="flex items-center justify-center gap-4">
                        <div className="min-w-[88px] h-6 bg-slate-800 rounded" />
                        <div className="flex flex-col gap-1 w-32">
                          <div className="h-3 bg-slate-800 rounded" />
                          <div className="h-3 bg-slate-800 rounded" />
                          <div className="h-3 bg-slate-800 rounded" />
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 animate-pulse">
                      <div className="flex items-center justify-center gap-4">
                        <div className="min-w-[88px] h-6 bg-slate-800 rounded" />
                        <div className="flex flex-col gap-1 w-32">
                          <div className="h-3 bg-slate-800 rounded" />
                          <div className="h-3 bg-slate-800 rounded" />
                          <div className="h-3 bg-slate-800 rounded" />
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 animate-pulse">
                      <div className="flex items-center justify-center gap-4">
                        <div className="min-w-[88px] h-6 bg-slate-800 rounded" />
                        <div className="flex flex-col gap-1 w-32">
                          <div className="h-3 bg-slate-800 rounded" />
                          <div className="h-3 bg-slate-800 rounded" />
                          <div className="h-3 bg-slate-800 rounded" />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
                  <div className="text-xs text-slate-300 flex items-center justify-center gap-1">
                    <InfoTooltip
                      title={`Mean Daily Spread (${useP05 ? '5%' : '10%'})`}
                      description={`Average daily top–minus–bottom ${useP05 ? '5%' : '10%'} spread for the ${is3 ? '3‑day' : '1‑day'} model.`}
                    />
                    <span>Mean Spread</span>
                  </div>
                  <div className="text-xl font-bold text-white mt-1">{spreadStats.mean != null ? `${(spreadStats.mean * 100).toFixed(2)}%` : '—'}</div>
                </div>
                <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
                  <div className="text-xs text-slate-300 flex items-center justify-center gap-1">
                    <InfoTooltip title="Std Dev (Spread)" description="Standard deviation of the daily cross‑sectional spread." />
                    <span>Std Dev (Spread)</span>
                  </div>
                  <div className="text-xl font-bold text-white mt-1">{spreadStats.std != null ? `${(spreadStats.std * 100).toFixed(2)}%` : '—'}</div>
                </div>
                <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
                  <div className="text-xs text-slate-300 flex items-center justify-center gap-1">
                    <InfoTooltip
                      title="Positive Days (Spread)"
                      description={`Proportion of days where the ${useP05 ? '5%' : '10%'} spread is greater than zero.`}
                    />
                    <span>Positive Days %</span>
                  </div>
                  <div className="text-xl font-bold text-white mt-1">{spreadStats.positive != null ? `${(spreadStats.positive * 100).toFixed(1)}%` : '—'}</div>
                </div>
                <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
                  <div className="text-xs text-slate-300 flex items-center justify-center gap-1">
                    <InfoTooltip title="Sharpe (Annualized)" description="Mean daily spread divided by its std, annualized by √365." />
                    <span>Sharpe (Annualized)</span>
                  </div>
                  <div className="text-xl font-bold text-white mt-1">{spreadStats.sharpe != null ? spreadStats.sharpe.toFixed(2) : '—'}</div>
                </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>
          {rollingBadges}
        </div>

        {/* Charts */}
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6 mt-8">
            {/* Rolling IC chart with compact title inside card */}
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-slate-300 flex items-center gap-2">
                  <InfoTooltip
                    title="Rolling Information Coefficient"
                    description="30‑day average of the daily cross‑sectional Information Coefficient between predictions and forward returns for the selected horizon." />
                  Rolling 30‑Day Information Coefficient ({horizon})
                </span>
                <button
                  className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  onClick={() => { setChartSqlTitle('Rolling 30‑Day Information Coefficient'); setChartSqlText(buildRollingIcSql()); setChartSqlOpen(true); }}
                >Show SQL</button>
              </div>
              <div className="h-auto">
                {icSvgLoadingMin ? (
                  <div className="animate-pulse"><ChartCardSkeleton height={360} /></div>
                ) : icError ? (
                  <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{icError}</div>
                ) : icSvg ? (
                  <iframe
                    srcDoc={icSvg}
                    title="Rolling 30-Day IC"
                    className="w-full rounded-md"
                    style={{ height: 380, border: 'none', background: 'transparent', opacity: 0, transition: 'opacity 180ms ease-out' }}
                    onLoad={(e) => { try { e.currentTarget.style.opacity = '1'; } catch {} }}
                  />
                ) : (
                  <div className="text-slate-300 text-sm p-4 text-center">No data available for the selected range.</div>
                )}
              </div>
            </div>

            {/* Rolling decile spread chart with compact title inside card */}
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-slate-300 flex items-center gap-2">
                  <InfoTooltip
                    title="Rolling Top–Bottom Spread"
                    description="30‑day average of the cross‑sectional top minus bottom performance using the selected percentile (10% or 5%)." />
                  {`Rolling 30‑Day Avg. Top–Bottom Spread`}
                </span>
                <button
                  className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  onClick={() => { setChartSqlTitle('Rolling 30‑Day Avg. Top–Bottom Spread'); setChartSqlText(buildRollingSpreadSql()); setChartSqlOpen(true); }}
                >Show SQL</button>
              </div>
              <div className="h-auto">
                {spreadLoadingMin ? (
                  <div className="animate-pulse"><ChartCardSkeleton height={360} /></div>
                ) : spreadError ? (
                  <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{spreadError}</div>
                ) : spreadHtml ? (
                  <iframe
                    srcDoc={spreadHtml}
                    title="Rolling 30-Day Decile Spread"
                    className="w-full rounded-md"
                    style={{ height: 380, border: 'none', background: 'transparent', opacity: 0, transition: 'opacity 180ms ease-out' }}
                    onLoad={(e) => { try { e.currentTarget.style.opacity = '1'; } catch {} }}
                  />
                ) : (
                  <div className="text-slate-300 text-sm p-4 text-center">No data available for the selected range.</div>
                )}
              </div>
            </div>

            {/* Rolling hit rate chart in same row */}
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-slate-300 flex items-center gap-2">
                  <InfoTooltip
                    title="Rolling Hit Rate"
                    description="Daily sign match between prediction and 1d forward return, averaged over a 30‑day trailing window (point‑in‑time)." />
                  Rolling 30‑Day Hit Rate
                </span>
                <button
                  className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  onClick={() => { setChartSqlTitle('Rolling 30‑Day Hit Rate'); setChartSqlText(buildRollingHitSql()); setChartSqlOpen(true); }}
                >Show SQL</button>
              </div>
              {hitLoadingMin ? (
                <ChartCardSkeleton height={360} />
              ) : hitError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{hitError}</div>
              ) : hitHtml ? (
                <iframe
                  srcDoc={hitHtml}
                  title="Rolling Hit Rate"
                  className="w-full rounded-md"
                  style={{ height: 380, border: 'none', background: 'transparent', opacity: 0, transition: 'opacity 180ms ease-out' }}
                  onLoad={(e) => { try { e.currentTarget.style.opacity = '1'; } catch {} }}
                />
              ) : (
                <div className="text-slate-300 text-sm p-4 text-center">No data available for the selected range.</div>
              )}
            </div>
          </div>

          {/* New: IC by Symbol -- Now uses dateRange */}
          <ICBySymbol dateRange={dateRange} horizon={horizon} />

          {/* New plots: Quintile Returns + Capacity proxy */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-slate-300 flex items-center gap-2">
                  <InfoTooltip
                    title="Decile Returns"
                    description="Per‑day, assets are binned into deciles by predicted return. Bars show the average forward return across days for each decile." />
                  Average Returns by Cross-Sectional Prediction Decile
                </span>
                <button
                  className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  onClick={() => { setChartSqlTitle('Average Returns by Cross‑Sectional Prediction Decile'); setChartSqlText(buildQuintileReturnsSql()); setChartSqlOpen(true); }}
                >Show SQL</button>
              </div>
              {quintileLoadingMin ? (
                <ChartCardSkeleton height={360} />
              ) : quintileError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{quintileError}</div>
              ) : quintileHtml ? (
                <iframe
                  srcDoc={quintileHtml}
                  title="Quintile Returns"
                  className="w-full rounded-md"
                  style={{ height: 380, border: 'none', background: 'transparent', opacity: 0, transition: 'opacity 180ms ease-out' }}
                  onLoad={(e) => { try { e.currentTarget.style.opacity = '1'; } catch {} }}
                />
              ) : (
                <div className="text-slate-300 text-sm p-4 text-center">No data available for the selected range.</div>
              )}
            </div>
            <MedianADVByDecile dateRange={dateRange} horizon={horizon} />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <ICDistribution dateRange={dateRange} horizon={horizon} />
              <SpreadDistribution dateRange={dateRange} horizon={horizon} topPct={topPct} />
            </div>
            <div className="space-y-6">
              <BootstrapICDistribution dateRange={dateRange} horizon={horizon} />
              <BootstrapSpreadDistribution dateRange={dateRange} horizon={horizon} topPct={topPct} />
            </div>
          </div>
      </div>

        {/* Generic chart SQL dialog */}
        <Dialog open={chartSqlOpen} onOpenChange={setChartSqlOpen}>
          <DialogContent className="bg-slate-950 border border-slate-800 text-white max-w-7xl w-[96vw] max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="text-white">{chartSqlTitle || 'SQL'}</DialogTitle>
            </DialogHeader>
            <div className="flex justify-end mb-2">
              <CopyButton text={chartSqlText} />
            </div>
            {renderSql(chartSqlText)}
          </DialogContent>
        </Dialog>

        {/* Raw Data (bottom of dashboard, under distribution plots) */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Raw Data</h3>
          </div>
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3 col-span-full">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-slate-200">daily_dashboard_metrics</span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={rawDailyLoading}
                    className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    onClick={() => {
                      const cols = rawDailyRows.length ? Object.keys(rawDailyRows[0]) : [];
                      const lines = [cols.join(',')];
                      rawDailyRows.forEach((r) => lines.push(cols.map((c) => String(r[c] ?? '')).join(',')));
                      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `daily_dashboard_metrics_${dateRange.start}_to_${dateRange.end}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    URL.revokeObjectURL(url);
                  }}
                  >Download CSV</button>
                  <button
                    className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    onClick={() => setSchemaTable('daily')}
                  >Show Schema</button>
                  <button
                    className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    onClick={() => setSqlTable('daily')}
                  >Show SQL</button>
                </div>
              </div>
              <div className="text-xs text-slate-300 mb-2 flex items-center gap-2">
                <InfoTooltip
                  title="Daily Dashboard Metrics"
                  description="Per‑day cross‑sectional metrics for 1‑day and 3‑day models (IC, top–bottom spreads 10%/5%, hit/total counts). These power the rolling 30‑day plots and the histogram‑based plots above." />
                <span>Daily cross‑sectional metrics by date.</span>
              </div>
              <div className={`${rawDailyLoading ? 'overflow-hidden' : 'overflow-y-auto overflow-x-scroll scrollbar-visible'} relative border border-slate-800 rounded-md h-[360px]`} style={{ scrollbarGutter: rawDailyLoading ? undefined : 'stable' }}>
                {rawDailyLoading && (
                  <div className="sticky top-0 left-0 right-0 h-full flex items-center justify-center bg-slate-950/70 z-40 pointer-events-none">
                    <span className="text-slate-300 text-sm">Loading…</span>
                  </div>
                )}
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-800 sticky top-0">
                    <tr>
                      {(rawDailyRows.length ? Object.keys(rawDailyRows[0]) : ['date']).map((c) => (
                        <th key={c} className="text-left px-2 py-2 text-slate-300 whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawDailyRows.length ? (
                      rawDailyRows.map((row, i) => (
                        <tr key={i} className="border-t border-slate-800">
                          {Object.keys(rawDailyRows[0]).map((c) => (
                            <td key={c} className="px-2 py-1 text-slate-300 whitespace-nowrap">{String(row[c] ?? '')}</td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      !rawDailyLoading ? (
                        <tr><td className="px-2 py-3 text-slate-300" colSpan={12}>No rows</td></tr>
                      ) : null
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  onClick={() => setRawDailyPage((p) => Math.max(1, p - 1))}
                  disabled={rawDailyPage === 1 || rawDailyLoading}
                >Prev</button>
                <span className="text-xs text-slate-300">Page {rawDailyPage}</span>
                <button
                  className="text-xs px-2 py-1 rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  onClick={() => setRawDailyPage((p) => p + 1)}
                  disabled={rawDailyLoading || (rawDailyRows.length < RAW_PAGE_SIZE)}
                >Next</button>
              </div>
            </div>

          </div>

          <Dialog open={!!sqlTable} onOpenChange={(open) => { if (!open) setSqlTable(null); }}>
            <DialogContent className="bg-slate-950 border border-slate-800 text-white max-w-7xl w-[96vw] max-h-[90vh]">
              <DialogHeader>
                <DialogTitle className="text-white">daily_dashboard_metrics</DialogTitle>
              </DialogHeader>
              <div className="flex justify-end mb-2">
                <CopyButton text={dailySql} />
              </div>
              {renderSql(dailySql)}
            </DialogContent>
          </Dialog>

          {/* Schema dialog */}
          <Dialog open={!!schemaTable} onOpenChange={(open) => { if (!open) setSchemaTable(null); }}>
            <DialogContent className="bg-slate-950 border border-slate-800 text-white max-w-[120rem] w-[98vw] max-h-[96vh]">
              <DialogHeader>
                <DialogTitle className="text-white">daily_dashboard_metrics Schema</DialogTitle>
              </DialogHeader>
              <SchemaView table={'daily'} />
            </DialogContent>
          </Dialog>
        </div>

        <div className="text-xs text-slate-300 mt-6">
          Past performance is not indicative of future results. This page is provided for informational and educational purposes only.
        </div>
      </div>
    </div>
  );
}
