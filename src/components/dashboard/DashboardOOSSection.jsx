
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
    if (lastIdx < 0) return { d1: null, d30: null, cur: null };
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
      d30: pick(30)
    };
  };

  const icDeltas = getDeltas(series, "ic");
  const spreadDeltas = getDeltas(series, "spread");

  const formatDelta = (val, { asPct = false, decimals = 4 }) => {
    if (val === null || typeof val !== "number" || Number.isNaN(val)) return "—";
    return asPct ? `${val >= 0 ? "+" : ""}${(val * 100).toFixed(decimals)}%` : `${val >= 0 ? "+" : ""}${val.toFixed(decimals)}`;
  };

  const deltaClass = (val) => {
    if (val === null || typeof val !== "number" || Number.isNaN(val)) return "text-slate-400";
    return val >= 0 ? "text-emerald-400" : "text-red-400";
  };

  // Monthly aggregates derived from the 1d regression metrics
  const globalStats = React.useMemo(() => {
    const toNumber = (value) => {
      if (typeof value === "number") return Number.isNaN(value) ? null : value;
      if (typeof value === "string" && value.trim() !== "") {
        const num = Number(value);
        return Number.isNaN(num) ? null : num;
      }
      return null;
    };

    const icValues = monthlyRows
      .map((r) => toNumber(r.information_coefficient_1d))
      .filter((v) => v !== null);

    const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const std = (arr) => {
      if (arr.length < 2) return 0;
      const m = mean(arr);
      const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / (arr.length - 1);
      return Math.sqrt(variance);
    };

    const positiveMonths = icValues.filter((v) => v > 0).length;
    const positiveProp = icValues.length ? positiveMonths / icValues.length : 0;
    const icMean = mean(icValues);
    const icStd = std(icValues);
    const avgMonthlyPreds = monthlyRows.length
      ? monthlyRows.reduce((sum, row) => sum + (toNumber(row.n_preds) ?? 0), 0) / monthlyRows.length
      : 0;

    return {
      meanIc: icMean,
      stdIc: icStd,
      positiveProp,
      avgMonthlyPreds,
    };
  }, [monthlyRows]);

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

  // Individual monthly badges summarising the 1d regression model
  const monthlyBadges = (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          Mean (IC)
          <InfoTooltip
            title="Mean IC"
            description="Average of daily cross‑sectional ICs, aggregated by month. Not a pooled calculation."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.meanIc != null ? globalStats.meanIc.toFixed(3) : "—"}</div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          Std Dev (IC)
          <InfoTooltip
            title="Standard Deviation of IC"
            description="Monthly standard deviation of daily cross‑sectional ICs. Measures consistency."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.stdIc != null ? globalStats.stdIc.toFixed(3) : "—"}</div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          Positive Months %
          <InfoTooltip
            title="Positive Months"
            description="Proportion of months with a positive average Information Coefficient."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.positiveProp != null ? `${(globalStats.positiveProp * 100).toFixed(1)}%` : "—"}</div>
      </div>
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          Avg Predictions / Month
          <InfoTooltip
            title="Prediction Coverage"
            description="Average number of model predictions logged per month within the selected history."
          />
        </div>
        <div className="text-xl font-bold text-white mt-1">{globalStats.avgMonthlyPreds != null ? Math.round(globalStats.avgMonthlyPreds).toLocaleString() : "—"}</div>
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
