
import React, { useState, useEffect } from "react";
import Section from "@/components/dashboard/Section";
import { ArrowUpRight, ArrowDownRight, Info, Download } from "lucide-react";
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
import { cross_sectional_metrics_1d } from "@/api/entities";
import { monthly_performance_metrics } from "@/api/entities";
import ICBySymbol from "@/components/dashboard/ICBySymbol";
import ICDistribution from "@/components/dashboard/ICDistribution";
import { rollingIcPlot, rollingSpreadPlot, predictionsCoverage } from "@/api/functions";
import BootstrapICDistribution from "@/components/dashboard/BootstrapICDistribution";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Helper function to generate nice y-axis ticks
const generateNiceTicks = (min, max, targetCount = 6) => {
  if (min === max) {
    const offset = Math.abs(min) * 0.1 || 0.1;
    return [Number((min - offset).toFixed(2)), Number(min.toFixed(2)), Number((min + offset).toFixed(2))];
  }

  const range = max - min;
  const roughStep = range / (targetCount - 1);

  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  let niceStep;

  if (normalized <= 1) niceStep = 1 * magnitude;
  else if (normalized <= 2) niceStep = 2 * magnitude;
  else if (normalized <= 5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;

  const ticks = [];
  for (let tick = niceMin; tick <= niceMax + niceStep / 2; tick += niceStep) {
    ticks.push(Number(tick.toFixed(2)));
  }

  if (min <= 0 && max >= 0 && !ticks.includes(0)) {
    ticks.push(0);
    ticks.sort((a, b) => a - b);
  }

  return ticks;
};

export default function DashboardOOSSection() {
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [availableRange, setAvailableRange] = useState({ start: "", end: "" });

  const [monthlyRows, setMonthlyRows] = useState([]);

  // New state for backend-rendered IC Plotly HTML (interactive)
  const [icSvg, setIcSvg] = React.useState(null);
  const [icSvgLoading, setIcSvgLoading] = React.useState(true);

  // New state for backend-rendered Decile Spread Plotly HTML
  const [spreadHtml, setSpreadHtml] = React.useState(null);
  const [spreadLoading, setSpreadLoading] = React.useState(true);


  React.useEffect(() => {
    const load = async () => {
      const [rawRows, mRows, coverageInfo] = await Promise.all([
        cross_sectional_metrics_1d.filter({}, "date", 10000),
        monthly_performance_metrics.filter({}, "year", 10000),
        predictionsCoverage({ monthsBack: 240 }).catch((error) => {
          console.error("Failed to load predictions coverage", error);
          return null;
        }),
      ]);
      const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

      const rows = rawRows
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

      const coverageStart = coverageInfo?.min_date || earliestDate || '2019-01-01';
      const coverageEnd = coverageInfo?.max_date || latestDate || coverageStart;

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

      setDateRange({ start: safeStart, end: defaultEnd });

      setMonthlyRows(mRows);

      setLoading(false);
    };
    load();
  }, []);

  // New useEffect for loading the Plotly HTML for IC
  React.useEffect(() => {
    const load = async () => {
      setIcSvgLoading(true);
      const endDate = dateRange.end || (allRows.length ? allRows[allRows.length - 1].date : null);
      if (!endDate) {
        setIcSvg(null);
        setIcSvgLoading(false);
        return;
      }
      const fallbackStart = dateRange.start || (allRows.length ? allRows[0].date : undefined);
      const data = await rollingIcPlot({ start: fallbackStart, end: endDate });
      // Now using HTML (interactive Plotly) from backend
      setIcSvg(data?.html || null);
      setIcSvgLoading(false);
    };
    if ((dateRange.start && dateRange.end) || (dateRange.start && allRows.length)) {
      load();
    }
  }, [dateRange.start, dateRange.end, allRows]);

  // Load Plotly HTML for Decile Spread
  React.useEffect(() => {
    const load = async () => {
      setSpreadLoading(true);
      const endDate = dateRange.end || (allRows.length ? allRows[allRows.length - 1].date : null);
      if (!endDate) {
        setSpreadHtml(null);
        setSpreadLoading(false);
        return;
      }
      const fallbackStart = dateRange.start || (allRows.length ? allRows[0].date : undefined);
      const data = await rollingSpreadPlot({ start: fallbackStart, end: endDate });
      setSpreadHtml(data?.html || null);
      setSpreadLoading(false);
    };
    if ((dateRange.start && dateRange.end) || (dateRange.start && allRows.length)) {
      load();
    }
  }, [dateRange.start, dateRange.end, allRows]);


  const filtered = React.useMemo(() => {
    if (!allRows.length || !dateRange.start || !dateRange.end) return [];
    return allRows.filter((d) => d.date >= dateRange.start && d.date <= dateRange.end);
  }, [allRows, dateRange]);

  const series = React.useMemo(() => {
    return filtered.map((r) => ({
      date: r.date,
      ic: typeof r["rolling_30d_avg_ic"] === "number" ? Number(r["rolling_30d_avg_ic"].toFixed(4)) : null,
      spread: typeof r["rolling_30d_avg_top_bottom_decile_spread"] === "number" ? Number(r["rolling_30d_avg_top_bottom_decile_spread"].toFixed(4)) : null
    }));
  }, [filtered]);

  // Helper: compute deltas vs N days ago using series index offsets
  const getDeltas = (data, key) => {
    const lastIdx = (() => {
      for (let i = data.length - 1; i >= 0; i--) {
        if (typeof data[i]?.[key] === "number" && !Number.isNaN(data[i][key])) return i;
      }
      return -1;
    })();
    if (lastIdx < 0) return { d1: null, d7: null, d30: null, cur: null };
    const cur = data[lastIdx][key];

    const pick = (offset) => {
      const j = lastIdx - offset;
      if (j >= 0 && typeof data[j]?.[key] === "number" && !Number.isNaN(data[j][key])) {
        return cur - data[j][key]; // subtraction, not percent return
      }
      return null;
    };

    return {
      cur,
      d1: pick(1),
      d7: pick(7),
      d30: pick(30)
    };
  };

  const icDeltas = getDeltas(series, "ic");
  const spreadDeltas = getDeltas(series, "spread");

  const horizonLabel = "1-Day";

  const formatDelta = (val, { asPct = false, decimals = 4 }) => {
    if (val === null || typeof val !== "number" || Number.isNaN(val)) return "—";
    return asPct ? `${val >= 0 ? "+" : ""}${(val * 100).toFixed(decimals)}%` : `${val >= 0 ? "+" : ""}${val.toFixed(decimals)}`;
  };

  const deltaClass = (val) => {
    if (val === null || typeof val !== "number" || Number.isNaN(val)) return "text-slate-400";
    return val >= 0 ? "text-emerald-400" : "text-red-400";
  };

  // NEW: global monthly stats (mean, std, annualized ICIR) from monthly_ic_metrics
  const globalStats = React.useMemo(() => {
    const vals1d = monthlyRows
      .map((r) => r.information_coefficient_1d)
      .filter((v) => typeof v === "number" && !Number.isNaN(v));
    const vals7d = [];

    const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const std = (arr) => {
      if (!arr.length || arr.length < 2) return 0; // Need at least 2 points for std dev
      const m = mean(arr);
      const variance = arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / (arr.length - 1); // Sample standard deviation
      return Math.sqrt(variance);
    };

    const positiveMonths1d = vals1d.filter(v => v > 0).length;
    const positiveProp1d = vals1d.length > 0 ? positiveMonths1d / vals1d.length : 0;

    const positiveMonths7d = vals7d.filter(v => v > 0).length;
    const positiveProp7d = vals7d.length > 0 ? positiveMonths7d / vals7d.length : 0;

    const m1 = mean(vals1d);
    const s1 = std(vals1d);
    const icir1 = s1 > 0 ? m1 / s1 * Math.sqrt(12) : 0;

    const m7 = 0;
    const s7 = 0;
    const icir7 = 0;

    return {
      mean1d: m1,
      std1d: s1,
      icir1d: icir1,
      positiveProp1d,
      mean7d: m7,
      std7d: s7,
      icir7d: icir7,
      positiveProp7d
    };
  }, [monthlyRows]);

  // Replace getChartProps to enforce 2-decimal ticks
  const getChartProps = (data, key) => {
    const vals = data.map((d) => d[key]).filter((v) => typeof v === "number" && !Number.isNaN(v));
    if (!vals.length) return { domain: [-1, 1], ticks: [-1, -0.5, 0, 0.5, 1] };

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const ticks = generateNiceTicks(min, max);

    return {
      domain: [ticks[0], ticks[ticks.length - 1]],
      ticks
    };
  };

  // NEW: top control bar (date pickers) - model selection removed
  const controlBar = (
    <div className="flex flex-wrap gap-4 items-center justify-between bg-slate-900 border border-slate-800 rounded-md p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">From</span>
        <input
          type="date"
          value={dateRange.start}
          min={availableRange.start || '2019-01-01'}
          max={availableRange.end || dateRange.end}
          onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))}
          disabled={loading}
          className="bg-slate-800 border border-slate-700 px-2 py-1 rounded h-9 text-white"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">To</span>
        <input
          type="date"
          value={dateRange.end}
          min={availableRange.start || '2019-01-01'}
          max={availableRange.end}
          onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))}
          disabled={loading}
          className="bg-slate-800 border border-slate-700 px-2 py-1 rounded h-9 text-white"
        />
      </div>
    </div>
  );


  // Info tooltip component with hover functionality and no focus outline
  const InfoTooltip = ({ title, description }) => {
    const [open, setOpen] = React.useState(false);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="text-slate-400 hover:text-slate-300 transition-colors focus:outline-none focus-visible:outline-none"
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

  // Individual monthly badges: separate evenly-sized badges for Mean, Std, Positive %, ICIR
  const monthlyBadges = (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          Mean
          <InfoTooltip
            title="Mean IC"
            description="Average of daily cross‑sectional ICs, aggregated by month. Not a pooled calculation."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.mean1d != null ? globalStats.mean1d.toFixed(3) : "—"}</div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          Std Dev
          <InfoTooltip
            title="Standard Deviation of IC"
            description="Monthly standard deviation of daily cross‑sectional ICs. Measures consistency."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.std1d != null ? globalStats.std1d.toFixed(3) : "—"}</div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          Positive Months %
          <InfoTooltip
            title="Positive Months"
            description="Proportion of months with a positive average Information Coefficient."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.positiveProp1d != null ? `${(globalStats.positiveProp1d * 100).toFixed(1)}%` : "—"}</div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          ICIR
          <InfoTooltip
            title="Annualized ICIR"
            description="Mean monthly IC ÷ std of monthly IC, annualized by √12. Measures risk-adjusted skill."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.icir1d != null ? globalStats.icir1d.toFixed(3) : "—"}</div>
      </div>
    </div>
  );


  // Tighter rolling badges: value + deltas INSIDE the badge, titles centered above; reduced padding
  const rollingBadges = (
    <div className="grid gap-6 md:grid-cols-2">
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
              <div className="text-2xl font-bold text-white">{icDeltas.cur !== null ? icDeltas.cur.toFixed(4) : "—"}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className={`flex items-center gap-1 text-xs ${deltaClass(icDeltas.d1)}`}>
                {icDeltas.d1 === null ? <span className="text-slate-400">1d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${icDeltas.d1 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${icDeltas.d1 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">1d: {formatDelta(icDeltas.d1, { asPct: false, decimals: 4 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${deltaClass(icDeltas.d7)}`}>
                {icDeltas.d7 === null ? <span className="text-slate-400">7d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${icDeltas.d7 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${icDeltas.d7 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">7d: {formatDelta(icDeltas.d7, { asPct: false, decimals: 4 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${deltaClass(icDeltas.d30)}`}>
                {icDeltas.d30 === null ? <span className="text-slate-400">30d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${icDeltas.d30 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${icDeltas.d30 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">30d: {formatDelta(icDeltas.d30, { asPct: false, decimals: 4 })}</span>
                </>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Decile spread */}
      <div className="text-center">
        <h4 className="text-lg font-semibold text-white mb-2 flex items-center justify-center gap-2">
          <InfoTooltip
            title="Rolling Decile Spread (30d avg)"
            description="30‑day average of daily cross‑sectional top‑minus‑bottom decile performance. Higher suggests more tradable signal." />
          <span>Decile Spread (30d)</span>
        </h4>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-center gap-4">
            <div className="min-w-[88px]">
              <div className="text-2xl font-bold text-white">
                {spreadDeltas.cur !== null ? `${(spreadDeltas.cur * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className={`flex items-center gap-1 text-xs ${deltaClass(spreadDeltas.d1)}`}>
                {spreadDeltas.d1 === null ? <span className="text-slate-400">1d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${spreadDeltas.d1 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${spreadDeltas.d1 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">1d: {formatDelta(spreadDeltas.d1, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${deltaClass(spreadDeltas.d7)}`}>
                {spreadDeltas.d7 === null ? <span className="text-slate-400">7d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${spreadDeltas.d7 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${spreadDeltas.d7 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">7d: {formatDelta(spreadDeltas.d7, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${deltaClass(spreadDeltas.d30)}`}>
                {spreadDeltas.d30 === null ? <span className="text-slate-400">30d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${spreadDeltas.d30 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${spreadDeltas.d30 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">30d: {formatDelta(spreadDeltas.d30, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );


  if (loading) {
    return <PerformancePublicSkeleton />;
  }

  const firstDataDate = allRows[0]?.date;
  const lastDataDate = allRows[allRows.length - 1]?.date;

  return (
    <div className="min-h-screen py-8 bg-slate-950">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
        {/* Title with clearer spacing */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Regression <span className="gradient-text">Performance</span></h1>
          <p className="text-slate-400 mt-2">
            Out‑of‑sample rolling performance metrics for our 1‑day regression model. Data available starting from 2019-02-01.
          </p>
        </div>

        {/* Control bar above everything */}
        {controlBar}

        {/* Metrics: monthly first, then rolling */}
        <div className="space-y-8">
        <div className="text-center mt-8">
          <h3 className="text-2xl font-semibold text-white mb-4">Monthly IC (1‑Day)</h3>
          {monthlyBadges}
        </div>
          {rollingBadges}
        </div>

        {/* Charts */}
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Section
              title={`Rolling 30‑Day Information Coefficient (1d)`}
              subtitle="Out-of-sample rank correlation of predictions vs. realized returns"
              rightSlot={(
                <Button asChild variant="outline" size="sm" className="border-slate-700 text-slate-200">
                  <Link to={createPageUrl("Signals")}>
                    <span className="flex items-center">
                      <Download className="w-4 h-4 mr-2" />
                      Export data
                    </span>
                  </Link>
                </Button>
              )}
            >
              <div className="h-auto">
                {icSvgLoading ? (
                  <div className="animate-pulse">
                    <ChartCardSkeleton height={360} />
                  </div>
                ) : icSvg ? (
                  <div className="w-full">
                    <iframe
                      srcDoc={icSvg}
                      title="Rolling 30-Day IC"
                      className="w-full rounded-md"
                      style={{ height: 380, border: "none", background: "transparent" }}
                    />
                  </div>
                ) : (
                  <div className="text-slate-400 text-sm p-4 text-center">No data available for the selected range.</div>
                )}
              </div>
            </Section>

            <Section
              title={`Rolling 30‑Day Avg. Top–Bottom Decile Spread (1d)`}
              subtitle="30‑day moving average of the net performance difference between top and bottom deciles">
              <div className="h-auto">
                {spreadLoading ? (
                  <div className="animate-pulse">
                    <ChartCardSkeleton height={360} />
                  </div>
                ) : spreadHtml ? (
                  <div className="w-full">
                    <iframe
                      srcDoc={spreadHtml}
                      title="Rolling 30-Day Decile Spread"
                      className="w-full rounded-md"
                      style={{ height: 380, border: "none", background: "transparent" }}
                    />
                  </div>
                ) : (
                  <div className="text-slate-400 text-sm p-4 text-center">No data available for the selected range.</div>
                )}
              </div>
            </Section>
          </div>

          {/* New: IC by Symbol -- Now uses dateRange */}
          <ICBySymbol dateRange={dateRange} />

          <div className="grid md:grid-cols-2 gap-6">
            <ICDistribution dateRange={dateRange} />
            <BootstrapICDistribution dateRange={dateRange} />
          </div>
        </div>

        <div className="text-xs text-slate-500 mt-6">
          Past performance is not indicative of future results. This page is provided for informational and educational purposes only.
        </div>
      </div>
    </div>
  );
}
