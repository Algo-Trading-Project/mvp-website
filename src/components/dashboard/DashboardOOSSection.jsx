
import React, { useState, useEffect } from "react";
import Section from "@/components/dashboard/Section";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cross_sectional_metrics_1d } from "@/api/entities";
import { monthly_performance_metrics } from "@/api/entities";
import ICBySymbol from "@/components/dashboard/ICBySymbol";
import ICDistribution from "@/components/dashboard/ICDistribution";
import { rollingIcPlot } from "@/api/functions";
import { rollingSpreadPlot } from "@/api/functions";
import BootstrapICDistribution from "@/components/dashboard/BootstrapICDistribution";

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

const HORIZON_OPTIONS = [
  { id: "1d", label: "1-Day" },
  { id: "7d", label: "7-Day" },
];

const DIRECTION_OPTIONS = [{ id: "combined", label: "Combined" }];

export default function DashboardOOSSection() {
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState("1d");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  const [monthlyRows, setMonthlyRows] = useState([]);

  // New state for backend-rendered IC Plotly HTML (interactive)
  const [icSvg, setIcSvg] = React.useState(null);
  const [icSvgLoading, setIcSvgLoading] = React.useState(true);

  // New state for backend-rendered Decile Spread Plotly HTML
  const [spreadHtml, setSpreadHtml] = React.useState(null);
  const [spreadLoading, setSpreadLoading] = React.useState(true);


  React.useEffect(() => {
    const load = async () => {
      const rows = await cross_sectional_metrics_1d.filter({}, "date", 10000);
      setAllRows(rows);

      const latestDate = rows.length ? rows[rows.length - 1].date : "";
      const earliestDate = rows.length ? rows[0].date : "";
      setDateRange({ start: earliestDate, end: latestDate });

      const mRows = await monthly_performance_metrics.filter({}, "year", 10000);
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
      const data = await rollingIcPlot({
        horizon,
        start: fallbackStart,
        end: endDate
      });
      // Now using HTML (interactive Plotly) from backend
      setIcSvg(data?.html || null);
      setIcSvgLoading(false);
    };
    if ((dateRange.start && dateRange.end) || (dateRange.start && allRows.length)) {
      load();
    }
  }, [horizon, dateRange.start, dateRange.end, allRows]);

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
      const data = await rollingSpreadPlot({
        horizon,
        start: fallbackStart,
        end: endDate
      });
      setSpreadHtml(data?.html || null);
      setSpreadLoading(false);
    };
    if ((dateRange.start && dateRange.end) || (dateRange.start && allRows.length)) {
      load();
    }
  }, [horizon, dateRange.start, dateRange.end, allRows]);


  const filtered = React.useMemo(() => {
    if (!allRows.length || !dateRange.start || !dateRange.end) return [];
    return allRows.filter((d) => d.date >= dateRange.start && d.date <= dateRange.end);
  }, [allRows, dateRange]);

  const series = React.useMemo(() => {
    const icField = horizon === "1d" ? "rolling_30d_ema_ic_1d" : "rolling_30d_ema_ic_7d";
    const spreadField = horizon === "1d" ? "rolling_30d_ema_top_bottom_decile_spread_1d" : "rolling_30d_ema_top_bottom_decile_spread_7d";
    return filtered.map((r) => ({
      date: r.date,
      ic: typeof r[icField] === "number" ? Number(r[icField].toFixed(4)) : null,
      spread: typeof r[spreadField] === "number" ? Number(r[spreadField].toFixed(4)) : null
    }));
  }, [filtered, horizon]);

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

  const horizonLabel = horizon === "1d" ? "1-Day" : "7-Day";

  const formatDelta = (val, { asPct = false, decimals = 4 }) => {
    if (val === null || typeof val !== "number" || Number.isNaN(val)) return "—";
    return asPct ? `${val >= 0 ? "+" : ""}${(val * 100).toFixed(decimals)}%` : `${val >= 0 ? "+" : ""}${val.toFixed(decimals)}`;
  };

  // NEW: global monthly stats (mean, std, annualized ICIR) from monthly_ic_metrics
  const globalStats = React.useMemo(() => {
    const vals1d = monthlyRows
      .map((r) => r.information_coefficient_1d)
      .filter((v) => typeof v === "number" && !Number.isNaN(v));
    const vals7d = monthlyRows
      .map((r) => r.information_coefficient_7d)
      .filter((v) => typeof v === "number" && !Number.isNaN(v));

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

    const m7 = mean(vals7d);
    const s7 = std(vals7d);
    const icir7 = s7 > 0 ? m7 / s7 * Math.sqrt(12) : 0;

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

  // NEW: top control bar (model dropdown + date pickers) - no background
  const controlBar = (
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

      <div className="flex items-center gap-2 opacity-75">
        <span className="text-sm text-slate-400">Direction</span>
        <Select value="combined" disabled>
          <SelectTrigger className="w-[160px] bg-slate-800 border-slate-700 h-9 text-white">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-white">
            {DIRECTION_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id} className="text-white">
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
          min={allRows[0]?.date}
          max={allRows[allRows.length - 1]?.date}
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
          min={allRows[0]?.date}
          max={allRows[allRows.length - 1]?.date}
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
        <div className="text-xl font-bold text-white mt-1">
          {(() => {
            const val = horizon === "1d" ? globalStats.mean1d : globalStats.mean7d;
            return val != null ? val.toFixed(3) : "—";
          })()}
        </div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          Std Dev
          <InfoTooltip
            title="Standard Deviation of IC"
            description="Monthly standard deviation of daily cross‑sectional ICs. Measures consistency."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">
          {(() => {
            const val = horizon === "1d" ? globalStats.std1d : globalStats.std7d;
            return val != null ? val.toFixed(3) : "—";
          })()}
        </div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          Positive Months %
          <InfoTooltip
            title="Positive Months"
            description="Proportion of months with a positive average Information Coefficient."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">
          {(() => {
            const val = horizon === "1d" ? globalStats.positiveProp1d : globalStats.positiveProp7d;
            return val != null ? `${(val * 100).toFixed(1)}%` : "—";
          })()}
        </div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          ICIR
          <InfoTooltip
            title="Annualized ICIR"
            description="Mean monthly IC ÷ std of monthly IC, annualized by √12. Measures risk-adjusted skill."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">
          {(() => {
            const val = horizon === "1d" ? globalStats.icir1d : globalStats.icir7d;
            return val != null ? val.toFixed(3) : "—";
          })()}
        </div>
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
              <div className={`flex items-center gap-1 text-xs ${typeof icDeltas.d1 === "number" && icDeltas.d1 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {icDeltas.d1 === null ? <span className="text-slate-400">1d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${icDeltas.d1 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${icDeltas.d1 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">1d: {formatDelta(icDeltas.d1, { asPct: false, decimals: 4 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${typeof icDeltas.d7 === "number" && icDeltas.d7 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {icDeltas.d7 === null ? <span className="text-slate-400">7d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${icDeltas.d7 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${icDeltas.d7 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">7d: {formatDelta(icDeltas.d7, { asPct: false, decimals: 4 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${typeof icDeltas.d30 === "number" && icDeltas.d30 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
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
              <div className={`flex items-center gap-1 text-xs ${typeof spreadDeltas.d1 === "number" && spreadDeltas.d1 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {spreadDeltas.d1 === null ? <span className="text-slate-400">1d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${spreadDeltas.d1 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${spreadDeltas.d1 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">1d: {formatDelta(spreadDeltas.d1, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${typeof spreadDeltas.d7 === "number" && spreadDeltas.d7 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {spreadDeltas.d7 === null ? <span className="text-slate-400">7d: —</span> : <>
                  <ArrowUpRight className={`w-3 h-3 ${spreadDeltas.d7 >= 0 ? "" : "hidden"}`} />
                  <ArrowDownRight className={`w-3 h-3 ${spreadDeltas.d7 < 0 ? "" : "hidden"}`} />
                  <span className="font-medium">7d: {formatDelta(spreadDeltas.d7, { asPct: true, decimals: 2 })}</span>
                </>}
              </div>
              <div className={`flex items-center gap-1 text-xs ${typeof spreadDeltas.d30 === "number" && spreadDeltas.d30 >= 0 ? "text-emerald-400" : "text-red-400"}`}>
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
            Out‑of‑sample rolling performance metrics for our models (1d, 7d). Data available starting from 2019-02-01.
          </p>
        </div>

        {/* Control bar above everything */}
        {controlBar}

        {/* Metrics: monthly first, then rolling */}
        <div className="space-y-8">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">Monthly IC ({horizonLabel})</h3>
            {monthlyBadges}
          </div>
          {rollingBadges}
        </div>

        {/* Charts */}
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Section
              title={`Rolling 30‑Day Information Coefficient (${horizon})`}
              subtitle="Out-of-sample rank correlation of predictions vs. realized returns">
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
              title={`Rolling 30‑Day Avg. Top–Bottom Decile Spread (${horizon})`}
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
          <ICBySymbol horizon={horizon} dateRange={dateRange} />
          
          <div className="grid md:grid-cols-2 gap-6">
            <ICDistribution horizon={horizon} dateRange={dateRange} />
            <BootstrapICDistribution horizon={horizon} dateRange={dateRange} />
          </div>
        </div>

        <div className="text-xs text-slate-500 mt-6">
          Past performance is not indicative of future results. This page is provided for informational and educational purposes only.
        </div>
      </div>
    </div>
  );
}
