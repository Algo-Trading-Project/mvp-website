import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LineChart, Info } from "lucide-react";
import { listPredictionDates, rawDaily, backtestEquityCurvePlot } from "@/api/functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Small hoverable info icon used in titles
function HoverInfo({ label, children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-white/80 hover:text-white focus:outline-none"
          aria-label={label || 'More info'}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="bg-slate-900 border-slate-700 text-white p-3 max-w-xs text-left"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

// Utility: build a polyline path for a sparkline given numeric data
function buildPath(values, width, height, pad = 2, scale) {
  const n = values.length;
  if (!n) return "";
  const min = scale?.min ?? Math.min(...values);
  const max = scale?.max ?? Math.max(...values);
  const span = max - min || 1;
  const w = Math.max(1, width - pad * 2);
  const h = Math.max(1, height - pad * 2);
  const xStep = w / Math.max(1, n - 1);
  const toX = (i) => pad + i * xStep;
  const toY = (v) => pad + (h - ((v - min) / span) * h);
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(2)},${toY(v).toFixed(2)}`)
    .join(" ");
}

function Sparkline({ series = [], color = "#22c55e" }) {
  const d = buildPath(series, 100, 36);
  return (
    <svg viewBox="0 0 100 36" className="w-full h-16">
      {series.length ? (
        <path d={d} fill="none" stroke={color} strokeWidth="2" />
      ) : (
        <rect x="0" y="0" width="100" height="36" fill="transparent" />
      )}
    </svg>
  );
}

function BarsBase({ series = [], posColor = '#22c55e', negColor = '#ef4444', baselineColor = '#94a3b8', showBaseline = true, scale = 1.35 }) {
  // Fill width but keep a small, consistent margin so bars aren't flush
  // against rounded card edges, and keep a tiny gap between bars.
  const width = 100;
  const height = 36;
  // Keep a subtle margin and a small gap; noticeably wider than before
  // but not flush with the container edges.
  const pad = 0.6; // ~0.6% each side in viewBox units
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const baselineY = pad + innerH;

  const maxAbs = Math.max(1e-9, ...series.map((v) => Math.abs(v)));
  const barCount = Math.max(1, series.length);

  const step = 5;
  const gap = -50; // light separation and end‑margins
  const barW = 5;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-16"
      style={{ width: 'calc(100% + 12px)', transform: 'translateX(-6px)' }}
    >
      {showBaseline && (
        <line x1={pad} x2={width - pad} y1={baselineY} y2={baselineY} stroke={baselineColor} strokeDasharray="3 3" strokeWidth="1" opacity="0.7" />
      )}
      {series.map((v, i) => {
        const x = pad + i * step + gap / 2; // center bar within its slot
        const h = Math.max(1, (Math.abs(v) / maxAbs) * (innerH * 0.96));
        const y = baselineY - h; // rise from bottom; sign shown via color
        const color = v >= 0 ? posColor : negColor;
        return <rect key={i} x={x} y={y} width={barW} height={h} rx={1.5} fill={color} opacity="0.95" />;
      })}
    </svg>
  );
}

const BarsIC = ({ series = [] }) => (
  <BarsBase series={series} posColor="#22c55e" negColor="#ef4444" baselineColor="transparent" showBaseline={false} scale={1.8} />
);

const BarsSpread = ({ series = [] }) => (
  <BarsBase series={series} posColor="#22c55e" negColor="#ef4444" baselineColor="#22c55e" showBaseline={false} scale={1.8} />
);

function EquityMini({ equity = [], btc = [] }) {
  // Use a shared scale so relative differences are visually accurate
  const width = 100,
    height = 36,
    pad = 2;
  const minAll = Math.min(...(equity.length ? equity : [1]), ...(btc.length ? btc : [1]));
  const maxAll = Math.max(...(equity.length ? equity : [1]), ...(btc.length ? btc : [1]));
  const scale = { min: minAll, max: maxAll };
  // Reduce drawing width so the curves end earlier (leaving badge clearance)
  const widthUsed = width * 0.78;
  const d1 = buildPath(equity, widthUsed, height, pad, scale);
  const d2 = buildPath(btc, widthUsed, height, pad, scale);
  const innerW = width - pad * 2,
    innerH = height - pad * 2;
  const toY = (v) => pad + (innerH - ((v - minAll) / (maxAll - minAll || 1)) * innerH);
  // Baseline at 1.0
  const yBaseline = toY(1);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16">
      <line x1={pad} x2={width - pad} y1={yBaseline} y2={yBaseline} stroke="#94a3b8" strokeDasharray="2 3" strokeWidth="1" opacity="0.6" />
      {equity.length ? <path d={d1} fill="none" stroke="#60a5fa" strokeWidth="2" /> : null}
      {btc.length ? <path d={d2} fill="none" stroke="#ef4444" strokeWidth="1.5" /> : null}
    </svg>
  );
}

export default function PerformancePreviewSection() {
  const [loading, setLoading] = React.useState(true);
  const [icSeries, setIcSeries] = React.useState([]);
  const [spreadSeries, setSpreadSeries] = React.useState([]);
  const [equitySeries, setEquitySeries] = React.useState([]);
  const [btcSeries, setBtcSeries] = React.useState([]);
  const [equityBadges, setEquityBadges] = React.useState({ mult: null, btcMult: null, cagr: null, maxdd: null });
  const [icBadge, setIcBadge] = React.useState(null);
  const [spreadBadge, setSpreadBadge] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Find the latest available date
        const latest = await listPredictionDates({ limit: 1 }).catch(() => ({ dates: [] }));
        const end = Array.isArray(latest?.dates) && latest.dates.length ? latest.dates[0] : new Date().toISOString().slice(0, 10);
        const endDate = new Date(`${end}T00:00:00Z`);
        // Separate windows: equity (365 days) and IC/p05 spread (30 days)
        const startEquityDate = new Date(endDate);
        startEquityDate.setUTCDate(endDate.getUTCDate() - 365);
        const startEquity = startEquityDate.toISOString().slice(0, 10);
        const startShortDate = new Date(endDate);
        startShortDate.setUTCDate(endDate.getUTCDate() - 30);
        const startShort = startShortDate.toISOString().slice(0, 10);

        // Daily metrics for IC and p05 spread (last 30 days)
        const daily = await rawDaily({ start: startShort, end, page: 1, page_size: 1000 }).catch(() => ({ rows: [] }));
        const rows = Array.isArray(daily?.rows) ? daily.rows : [];
        const toNum = (v) => {
          if (typeof v === 'number') return Number.isFinite(v) ? v : null;
          const n = Number(v); return Number.isFinite(n) ? n : null;
        };
        const icVals = rows
          .map((r) => toNum(r.cs_spearman_ic_1d))
          .filter((v) => typeof v === 'number');
        const spreadVals = rows
          .map((r) => toNum(r.cs_top_bottom_p05_spread_1d))
          .filter((v) => typeof v === 'number');

        // Equity vs BTC over the 365‑day window
        const back = await backtestEquityCurvePlot({ start: startEquity, end, fees: 0.003, horizon: '1d', top_pct: 0.05 }).catch(() => null);
        const eq = back?.series?.equity ?? [];
        const btc = back?.series?.btc_equity ?? [];

        if (!cancelled) {
          setIcSeries(icVals.slice(-30));
          setSpreadSeries(spreadVals.slice(-30)); // recent 30 bars
          setEquitySeries(eq);
          setBtcSeries(btc);
          // Overlays
          const mult = eq.length ? eq[eq.length - 1] : null;
          const btcMult = btc.length ? btc[btc.length - 1] : null;
          const cagr = back?.metrics?.cagr ?? null;
          const maxdd = back?.metrics?.max_drawdown ?? null;
          setEquityBadges({ mult, btcMult, cagr, maxdd });
          const average = (arr) => {
            const vals = arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
            if (!vals.length) return null;
            return vals.reduce((a, b) => a + b, 0) / vals.length;
          };
          setIcBadge(average(icVals));
          setSpreadBadge(average(spreadVals));
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Unable to load preview data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const cards = [
    {
      key: 'equity',
      title: "Cumulative Return (Strategy vs BTC)",
      caption: "Last 365 days. Fees applied to strategy curve.",
      graphic: <EquityMini equity={equitySeries} btc={btcSeries} />,
    },
    {
      key: 'ic',
      title: "Daily Information Coefficient (1d model)",
      titleNode: (
        <span className="inline-flex items-center gap-1">
          Daily Information Coefficient (1d model)
          <HoverInfo label="What is IC?">
            <div className="text-xs font-semibold mb-1">Information Coefficient (IC)</div>
            <div className="text-[11px] leading-relaxed">
              Rank correlation between predicted and realized returns across the asset universe each day (1d).
            </div>
          </HoverInfo>
        </span>
      ),
      caption: "Last 30 days.",
      graphic: <BarsIC series={icSeries} />,
    },
    {
      key: 'spread',
      title: "Top vs Bottom Spread (5th‑percentile)",
      titleNode: (
        <span className="inline-flex items-center gap-1">
          Top vs Bottom Spread (5th‑percentile)
          <HoverInfo label="What is p05?">
            <div className="text-xs font-semibold mb-1">p05 spread</div>
            <div className="text-[11px] leading-relaxed">
              Difference between the average returns of the top 5% and bottom 5% of tokens by predicted return each day (1d). Higher is better.
            </div>
          </HoverInfo>
        </span>
      ),
      caption: "Last 30 days.",
      graphic: <BarsSpread series={spreadSeries} />,
    },
  ];

  return (
    <section className="bg-slate-900 py-14 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Proven Results</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mt-1">Publicly verified performance</h2>
            <p className="text-white mt-2">Transparent, out‑of‑sample metrics. Inspect the full dashboard when ready.</p>
          </div>
          <Link to={createPageUrl("Dashboard")} className="hidden md:inline-flex items-center gap-2 text-blue-300 hover:text-blue-200">
            <LineChart className="w-5 h-5" />
            Explore the Performance Dashboard
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {cards.map((c) => (
            <div key={c.title} className="rounded-xl border border-slate-800 bg-slate-950 p-5 relative overflow-hidden">
              <div className={`mb-3 ${c.key === 'ic' || c.key === 'spread' ? '-mx-5' : ''}`}>
                {loading ? (
                  <div className="h-16 w-full bg-slate-800/60 animate-pulse rounded" />
                ) : (
                  c.graphic
                )}
              </div>
              {!loading && !error && (
                c.key === 'equity' ? (
                  <div className="absolute top-2 right-3 flex flex-col items-end gap-1 text-[11px]">
                    {equityBadges.mult != null && (
                      <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-white font-semibold">
                        <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#60a5fa' }} />
                        Strategy {equityBadges.mult.toFixed(2)}x
                      </span>
                    )}
                    {equityBadges.btcMult != null && (
                      <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700 text-white font-semibold">
                        <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#ef4444' }} />
                        BTC {equityBadges.btcMult.toFixed(2)}x
                      </span>
                    )}
                  </div>
                ) : c.key === 'ic' ? (
                  icBadge != null && (
                    <div className="absolute top-2 right-3 text-[11px] px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-white font-semibold">
                      30-day mean: {icBadge.toFixed(3)}
                    </div>
                  )
                ) : c.key === 'spread' ? (
                  spreadBadge != null && (
                    <div className="absolute top-2 right-3 text-[11px] px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-white font-semibold">
                      30-day mean: {(spreadBadge * 100).toFixed(2)}%
                    </div>
                  )
                ) : null
              )}
              <div className="text-white font-semibold">{c.titleNode ?? c.title}</div>
              <div className="text-white text-sm mt-1">{error ? 'Preview unavailable' : c.caption}</div>
              {c.key === 'equity' && !loading && !error && (
                <div className="mt-2 text-[11px] font-semibold">
                  {equityBadges.cagr != null && (
                    <span className="text-emerald-400">CAGR: {(equityBadges.cagr * 100).toFixed(1)}%</span>
                  )}
                  {equityBadges.maxdd != null && (
                    <span className="ml-3 text-red-400">Max DD: {(Math.abs(equityBadges.maxdd) * 100).toFixed(1)}%</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 md:hidden">
          <Link to={createPageUrl("Dashboard")} className="inline-flex items-center gap-2 text-blue-300 hover:text-blue-200">
            <LineChart className="w-5 h-5" />
            Explore the Performance Dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}
