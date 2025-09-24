
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend
} from "recharts";
import { Calendar } from "lucide-react";
import Section from "@/components/dashboard/Section";

// Tokens universe (sample)
const TOKENS = [
  "BTC","ETH","SOL","AVAX","NEAR","DOT","MATIC","ADA","LINK","UNI",
  "ATOM","ICP","LTC","XRP","ARB","OP","APT","AAVE","SUI","FIL",
  "ETC","INJ","MKR","RNDR","SEI","IMX","GRT","ALGO","EGLD","FTM"
];

// Deterministic synthetic daily long/short returns for a token and a day index
function dailyLongReturn(tokenIdx, dayIdx) {
  const base = 0.0004 * Math.sin((tokenIdx + 1) * 0.8) + 0.0002 * Math.cos(dayIdx / 9 + tokenIdx / 5);
  const cyc = 0.0012 * Math.sin((dayIdx + tokenIdx * 2) / 13);
  return base + cyc;
}
function dailyShortReturn(tokenIdx, dayIdx) {
  return -0.8 * dailyLongReturn(tokenIdx, dayIdx) + 0.00005 * Math.sin((dayIdx + tokenIdx) / 7);
}

// Build a year of dates and equity series
const fullDates = Array.from({ length: 365 }).map((_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (364 - i));
  return d.toISOString().slice(0, 10);
});

const fullEquity = fullDates.map((date, i) => ({
  date,
  strategy: 100 + i * 0.18 + Math.sin(i / 7) * 0.9,
  benchmark: 100 + i * 0.12 + Math.sin(i / 9) * 0.8,
}));

// Histogram helper (synthetic normal-ish)
const makeHist = (buckets, mu = 0.8, sigma = 0.25) =>
  Array.from({ length: buckets }).map((_, i) => {
    const bucket = (i - buckets / 2) / 10;
    const density = Math.max(0, 40 * Math.exp(-Math.pow(bucket - mu, 2) / (2 * sigma * sigma)));
    return { bucket: Number(bucket.toFixed(2)), count: Math.round(density) };
  });

// UPDATED: allow color and optional X tick formatter
const HistogramCard = ({ title, data, barColor = "#60a5fa", xTickFormatter }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-md">
    <div className="p-4 border-b border-slate-800">
      <h4 className="font-semibold">{title}</h4>
    </div>
    <div className="p-4 h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis
            dataKey="bucket"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            stroke="#334155"
            tickFormatter={xTickFormatter}
          />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
          <RechartsTooltip
            contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }}
            labelFormatter={(l) => `Bucket: ${l}`}
            formatter={(v) => [v, "count"]}
          />
          <Bar dataKey="count" fill={barColor} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

// UPDATED: allow color for bars
const TokenBarCard = ({ title, data, fillColor = "#34d399" }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-md">
    <div className="p-4 border-b border-slate-800">
      <h4 className="font-semibold">{title}</h4>
    </div>
    <div className="p-4 h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis
            dataKey="token"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            stroke="#334155"
            interval={0}
            height={50}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            stroke="#334155"
            tickFormatter={(v) => `${(v * 100).toFixed(2)}%`}
          />
          <RechartsTooltip
            contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }}
            formatter={(v) => [`${(v * 100).toFixed(3)}%`, "avg return"]}
          />
          <Bar dataKey="avg" fill={fillColor} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default function DashboardPerformanceSection() {
  // Date range UI (year-to-date default)
  const [dateRange, setDateRange] = useState({
    start: "2025-01-01", // Changed to year-to-date
    end: fullDates[fullDates.length - 1],
  });

  const handleDateChange = (e) => {
    setDateRange((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const filteredIdx = useMemo(() => {
    return fullDates
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d >= dateRange.start && d <= dateRange.end)
      .map(({ i }) => i);
  }, [dateRange]);

  const equityData = useMemo(() => {
    const idxSet = new Set(filteredIdx);
    return fullEquity.filter((_, i) => idxSet.has(i));
  }, [filteredIdx]);

  // Compute token averages for selected range
  const { topLong, topShort, bottomLong, bottomShort } = useMemo(() => {
    const sumsLong = Array(TOKENS.length).fill(0);
    const sumsShort = Array(TOKENS.length).fill(0);
    const n = filteredIdx.length || 1;

    filteredIdx.forEach((dayIdx) => {
      TOKENS.forEach((_, tIdx) => {
        sumsLong[tIdx] += dailyLongReturn(tIdx, dayIdx);
        sumsShort[tIdx] += dailyShortReturn(tIdx, dayIdx);
      });
    });

    const avgLong = TOKENS.map((token, tIdx) => ({ token, avg: sumsLong[tIdx] / n }));
    const avgShort = TOKENS.map((token, tIdx) => ({ token, avg: sumsShort[tIdx] / n }));

    const top10Long = [...avgLong].sort((a, b) => b.avg - a.avg).slice(0, 10);
    const bottom10Long = [...avgLong].sort((a, b) => a.avg - b.avg).slice(0, 10);
    const top10Short = [...avgShort].sort((a, b) => b.avg - a.avg).slice(0, 10);
    const bottom10Short = [...avgShort].sort((a, b) => a.avg - b.avg).slice(0, 10);

    return {
      topLong: top10Long,
      topShort: top10Short,
      bottomLong: bottom10Long,
      bottomShort: bottom10Short,
    };
  }, [filteredIdx]);

  // Histograms: existing 3 + NEW 4 (avg dd, max dd, alpha, beta)
  const sharpeHist = makeHist(20, 0.8, 0.3);
  const sortinoHist = makeHist(20, 1.0, 0.35);
  const calmarHist = makeHist(20, 0.6, 0.28);

  // New distributions (synthetic, centered appropriately)
  const avgDrawdownHist = makeHist(20, -0.6, 0.25);
  const maxDrawdownHist = makeHist(20, -1.0, 0.2);
  const alphaHist = makeHist(20, 0.1, 0.25);
  const betaHist = makeHist(20, 0.9, 0.15);

  // Formatters for X-axis where % makes sense
  const pctFormatter = (v) => `${(Number(v) * 100).toFixed(0)}%`;

  return (
    <div className="space-y-6">
      <Section
        title="Performance Analytics"
        subtitle="Equity curve vs benchmark for the selected date range"
        rightSlot={
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400">From</span>
              <input
                type="date"
                name="start"
                className="bg-slate-800 border border-slate-700 px-2 py-1 rounded"
                value={dateRange.start}
                onChange={handleDateChange}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">To</span>
              <input
                type="date"
                name="end"
                className="bg-slate-800 border border-slate-700 px-2 py-1 rounded"
                value={dateRange.end}
                onChange={handleDateChange}
              />
            </div>
          </div>
        }
      >
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={equityData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} stroke="#334155" />
              <Legend />
              <RechartsTooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }}
              />
              <Line type="monotone" dataKey="strategy" name="Strategy" stroke="#34d399" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#60a5fa" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section
        title="Risk/Return Ratios (Bootstrapped)"
        subtitle="Distribution of Sharpe, Sortino, and Calmar ratios"
      >
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <HistogramCard title="Sharpe (bootstrapped)" data={sharpeHist} barColor="#60a5fa" />
          <HistogramCard title="Sortino (bootstrapped)" data={sortinoHist} barColor="#34d399" />
          <HistogramCard title="Calmar (bootstrapped)" data={calmarHist} barColor="#a78bfa" />
        </div>
      </Section>

      <Section
        title="Drawdowns & Factor Exposures (Bootstrapped)"
        subtitle="Avg and max drawdown distributions, alpha and beta"
      >
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <HistogramCard
            title="Avg Drawdown (bootstrapped)"
            data={avgDrawdownHist}
            barColor="#f59e0b"
            xTickFormatter={pctFormatter}
          />
          <HistogramCard
            title="Max Drawdown (bootstrapped)"
            data={maxDrawdownHist}
            barColor="#f87171"
            xTickFormatter={pctFormatter}
          />
          <HistogramCard
            title="Alpha (bootstrapped)"
            data={alphaHist}
            barColor="#2dd4bf"
            xTickFormatter={pctFormatter}
          />
          <HistogramCard
            title="Beta (bootstrapped)"
            data={betaHist}
            barColor="#6366f1"
          />
        </div>
      </Section>

      <Section
        title="Token Leaderboards"
        subtitle="Average returns by token within the selected date range"
      >
        <div className="grid md:grid-cols-2 gap-6">
          <TokenBarCard title="Top 10 Tokens by Avg Long Returns" data={topLong} fillColor="#10b981" />
          <TokenBarCard title="Top 10 Tokens by Avg Short Returns" data={topShort} fillColor="#10b981" />
          <TokenBarCard title="Bottom 10 Tokens by Avg Long Returns" data={bottomLong} fillColor="#f87171" />
          <TokenBarCard title="Bottom 10 Tokens by Avg Short Returns" data={bottomShort} fillColor="#f87171" />
        </div>
      </Section>
    </div>
  );
}
