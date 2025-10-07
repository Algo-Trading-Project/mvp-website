import React from "react";
// Note: This component is intended to be embedded inside Dashboard.jsx.
// Do not wrap with Layout to avoid duplicate headers.
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { backtestEquityCurvePlot, backtestRollingAlphaPlot, backtestBootstrapRobustnessPlot, predictionsCoverage } from "@/api/functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, AreaChart, Area, Legend } from 'recharts';

const BACKTEST_CACHE_KEY = "backtest-cache-v1";

const loadBacktestCache = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(BACKTEST_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to read backtest cache", error);
    return null;
  }
};

const persistBacktestCache = (snapshot) => {
  if (typeof window === "undefined") return;
  try {
    if (snapshot) {
      window.sessionStorage?.setItem(BACKTEST_CACHE_KEY, JSON.stringify(snapshot));
    } else {
      window.sessionStorage?.removeItem(BACKTEST_CACHE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist backtest cache", error);
  }
};

export default function Backtest() {
  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const MIN_BACKTEST_DATE = "2020-01-01";
  const cacheRef = React.useRef(loadBacktestCache());
  const cached = cacheRef.current;
  const initialDateRange = cached?.dateRange ?? { start: MIN_BACKTEST_DATE, end: todayIso };
  const [dateRange, setDateRange] = React.useState(initialDateRange);
  const [coverage, setCoverage] = React.useState(cached?.coverage ?? null);
  const [initialized, setInitialized] = React.useState(Boolean(cached?.initialized));

  const hasEquityCache = cached && cached.equityHtml && cached.dateRange?.start === initialDateRange.start && cached.dateRange?.end === initialDateRange.end;
  const hasAlphaCache = cached && cached.alphaHtml && cached.dateRange?.start === initialDateRange.start && cached.dateRange?.end === initialDateRange.end;
  const hasBootstrapCache = cached && cached.bootstrapHtml && cached.dateRange?.start === initialDateRange.start && cached.dateRange?.end === initialDateRange.end;

  const [equityHtml, setEquityHtml] = React.useState(cached?.equityHtml ?? null);
  const [equityLoading, setEquityLoading] = React.useState(hasEquityCache ? false : true);
  const [equityError, setEquityError] = React.useState(null);
  const [metrics, setMetrics] = React.useState(cached?.metrics ?? null);
  const [btcMetrics, setBtcMetrics] = React.useState(cached?.btcMetrics ?? null);
  const [equitySeries, setEquitySeries] = React.useState(cached?.equitySeries ?? null);

  const [alphaHtml, setAlphaHtml] = React.useState(cached?.alphaHtml ?? null);
  const [betaHtml, setBetaHtml] = React.useState(cached?.betaHtml ?? null);
  const [abLoading, setAbLoading] = React.useState(hasAlphaCache ? false : true);
  const [abError, setAbError] = React.useState(null);

  const [bootstrapHtml, setBootstrapHtml] = React.useState(cached?.bootstrapHtml ?? null);
  const [bootstrapCharts, setBootstrapCharts] = React.useState(cached?.bootstrapCharts ?? null);
  const [bootstrapLoading, setBootstrapLoading] = React.useState(hasBootstrapCache ? false : true);
  const [bootstrapError, setBootstrapError] = React.useState(null);

  const rangeMatchesCache = React.useCallback(() => {
    const current = cacheRef.current;
    if (!current || !current.dateRange) return false;
    return current.dateRange.start === dateRange.start && current.dateRange.end === dateRange.end;
  }, [dateRange.start, dateRange.end]);

  React.useEffect(() => {
    if (!dateRange?.start || !dateRange?.end) return;
    if (
      !metrics &&
      !btcMetrics &&
      !equityHtml &&
      !equitySeries &&
      !alphaHtml &&
      !betaHtml &&
      !bootstrapHtml &&
      !bootstrapCharts &&
      !coverage
    ) {
      return;
    }
    const snapshot = {
      initialized: true,
      dateRange,
      coverage,
      metrics,
      btcMetrics,
      equityHtml,
      equitySeries,
      alphaHtml,
      betaHtml,
      bootstrapHtml,
      bootstrapCharts,
    };
    cacheRef.current = snapshot;
    persistBacktestCache(snapshot);
  }, [
    dateRange,
    coverage,
    metrics,
    btcMetrics,
    equityHtml,
    equitySeries,
    alphaHtml,
    betaHtml,
    bootstrapHtml,
    bootstrapCharts,
  ]);

  // Initialize default range to 2020-01-01 -> latest predictions date
  React.useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const info = await predictionsCoverage({ monthsBack: 240 });
        if (cancelled) return;
        setCoverage(info || null);
        const latest = info?.latest_date || info?.max_date || todayIso;
        const minCandidate = info?.min_date && info.min_date > MIN_BACKTEST_DATE ? info.min_date : MIN_BACKTEST_DATE;
        setDateRange({ start: minCandidate, end: latest });
      } finally {
        if (!cancelled) setInitialized(true);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [todayIso]);

  React.useEffect(() => {
    const load = async () => {
      const hasCache = rangeMatchesCache() && (cacheRef.current?.equityHtml || cacheRef.current?.equitySeries);
      if (!hasCache) {
        setEquityLoading(true);
        setEquitySeries(null);
      }
      setEquityError(null);
      try {
        const res = await backtestEquityCurvePlot({ start: dateRange.start, end: dateRange.end, period: '1d', fees: 0.003 });
        setEquityHtml(res?.html || null);
        setMetrics(res?.metrics || null);
        setBtcMetrics(res?.btc_metrics || null);
        setEquitySeries(res?.series || null);
      } catch (e) { setEquityError(e?.message || 'Unable to load equity curve'); setEquityHtml(null); setEquitySeries(null); }
      finally { setEquityLoading(false); }
    };
    if (initialized) load();
  }, [dateRange.start, dateRange.end, initialized, rangeMatchesCache]);

  React.useEffect(() => {
    const load = async () => {
      const hasCache = rangeMatchesCache() && (cacheRef.current?.alphaHtml || cacheRef.current?.betaHtml);
      if (!hasCache) {
        setAbLoading(true);
      }
      setAbError(null);
      try {
        const res = await backtestRollingAlphaPlot({ start: dateRange.start, end: dateRange.end, window: 30 });
        setAlphaHtml(res?.alpha || null);
        setBetaHtml(res?.beta || null);
      } catch (e) { setAbError(e?.message || 'Unable to load alpha/beta'); setAlphaHtml(null); setBetaHtml(null); }
      finally { setAbLoading(false); }
    };
    if (initialized) load();
  }, [dateRange.start, dateRange.end, initialized, rangeMatchesCache]);

  // Removed OOS plots from Backtest per request

  React.useEffect(() => {
    const load = async () => {
      const hasCache = rangeMatchesCache() && (cacheRef.current?.bootstrapHtml || cacheRef.current?.bootstrapCharts);
      if (!hasCache) {
        setBootstrapLoading(true);
      }
      setBootstrapError(null);
      try {
        const res = await backtestBootstrapRobustnessPlot({ start: dateRange.start, end: dateRange.end, iterations: 10000, period: '1d', fees: 0.003 });
        setBootstrapHtml(res?.html || null);
        if (res?.charts) setBootstrapCharts(res.charts);
      } catch (e) { setBootstrapError(e?.message || 'Unable to load bootstrap plot'); setBootstrapHtml(null); }
      finally { setBootstrapLoading(false); }
    };
    if (initialized) load();
  }, [dateRange.start, dateRange.end, initialized, rangeMatchesCache]);

  const controlBar = (
    <div className="flex w-full items-center justify-end mb-4">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400">From</label>
        <input type="date" value={dateRange.start} min={MIN_BACKTEST_DATE} max={dateRange.end || todayIso} onChange={(e)=>setDateRange(r=>({...r,start:e.target.value}))} className="bg-slate-900 border border-slate-700 px-2 py-1 rounded h-8 text-white" />
        <label className="text-xs text-slate-400 ml-2">To</label>
        <input type="date" value={dateRange.end} min={MIN_BACKTEST_DATE} max={todayIso} onChange={(e)=>setDateRange(r=>({...r,end:e.target.value}))} className="bg-slate-900 border border-slate-700 px-2 py-1 rounded h-8 text-white" />
      </div>
    </div>
  );

  const InfoTooltip = ({ title, description }) => {
    const [open, setOpen] = React.useState(false);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="text-slate-400 hover:text-slate-300 transition-colors focus:outline-none"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            aria-label={`About ${title}`}
          >
            <Info className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="bg-slate-900 border-slate-700 text-white p-3 max-w-xs"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="font-semibold text-sm mb-1">{title}</div>
          <div className="text-xs text-slate-300">{description}</div>
        </PopoverContent>
      </Popover>
    );
  };

  const MetricBadge = ({ label, value, fmt='pct', info }) => {
    const format = (v) => {
      if (v === null || v === undefined || Number.isNaN(v)) return '—';
      if (fmt === 'pct') return `${(v*100).toFixed(2)}%`;
      if (fmt === 'ratio') return `${v.toFixed(2)}`;
      return `${v.toFixed(2)}`;
    };
    const valueClass = fmt === 'pct' ? 'text-lg md:text-xl' : 'text-xl md:text-2xl';
    return (
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          <InfoTooltip title={label} description={info} />
          {label}
        </div>
        <div className={`${valueClass} font-bold text-white mt-1`}>{format(value)}</div>
      </div>
    );
  };

  const metricDefs = [
    { key:'total_return', label:'Total Return', fmt:'pct', info:'Overall gain from start to end of the selected period.' },
    { key:'cagr', label:'CAGR', fmt:'pct', info:'Average yearly growth rate over the selected period.' },
    { key:'max_drawdown', label:'Max Drawdown', fmt:'pct', info:'Largest drop from a peak to a trough along the way.' },
    { key:'avg_drawdown', label:'Avg Drawdown', fmt:'pct', info:'Typical size of pullbacks during the period.' },
    { key:'sharpe', label:'Sharpe', fmt:'ratio', info:'How much return we earned for the bumpiness of results (higher is better).' },
    { key:'sortino', label:'Sortino', fmt:'ratio', info:'Return earned for downside bumps only (penalizes losses more).' },
    { key:'calmar', label:'Calmar', fmt:'ratio', info:'Yearly growth compared to the worst drop (higher is better).' },
  ];

  const underwaterSeries = React.useMemo(() => {
    if (!equitySeries) return null;
    const strategyDates = Array.isArray(equitySeries.dates) ? equitySeries.dates : [];
    const strategyDrawdowns = Array.isArray(equitySeries.drawdowns) ? equitySeries.drawdowns : [];
    const btcDates = Array.isArray(equitySeries.btc_dates) ? equitySeries.btc_dates : [];
    const btcDrawdowns = Array.isArray(equitySeries.btc_drawdowns) ? equitySeries.btc_drawdowns : [];

    const strategyMap = new Map();
    strategyDates.forEach((date, idx) => {
      const raw = strategyDrawdowns[idx];
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (typeof date === 'string' && Number.isFinite(value)) {
        strategyMap.set(date, Number(value * 100));
      }
    });

    const btcMap = new Map();
    btcDates.forEach((date, idx) => {
      const raw = btcDrawdowns[idx];
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (typeof date === 'string' && Number.isFinite(value)) {
        btcMap.set(date, Number(value * 100));
      }
    });

    if (!strategyMap.size && !btcMap.size) return null;

    const combinedDates = Array.from(new Set([...strategyMap.keys(), ...btcMap.keys()]));
    combinedDates.sort();

    const rows = combinedDates
      .map((date) => {
        const strategy = strategyMap.has(date) ? strategyMap.get(date) : null;
        const btc = btcMap.has(date) ? btcMap.get(date) : null;
        return {
          date,
          strategy: Number.isFinite(strategy) ? strategy : null,
          btc: Number.isFinite(btc) ? btc : null,
        };
      })
      .filter((row) => row.strategy !== null || row.btc !== null);

    return rows.length ? rows : null;
  }, [equitySeries]);

  const drawdownTickFormatter = React.useCallback((value) => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return '—';
    const digits = Math.abs(num) < 10 ? 1 : 0;
    return `${num.toFixed(digits)}%`;
  }, []);

  const drawdownTooltipFormatter = React.useCallback((value, name) => {
    const num = typeof value === 'number' ? value : Number(value);
    const formatted = Number.isFinite(num) ? `${num.toFixed(2)}%` : '—';
    return [formatted, name];
  }, []);

  const drawdownLegendFormatter = React.useCallback((value) => value, []);

  const HistogramTooltip = ({ active, payload, label, title, fmt, formatX }) => {
    if (!active || !payload || !payload.length) return null;
    const count = payload[0]?.value ?? 0;
    const labelFmt = formatX(label);
    return (
      <div className="bg-slate-800/90 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100">
        <div>{title}: {labelFmt}</div>
        <div>Count: {count}</div>
      </div>
    );
  };

  const HistCard = ({ title, data, fmt='pct', color='#64748b' }) => {
    const formatX = (v) => {
      const num = Number(v);
      if (!Number.isFinite(num)) return '';
      // Uniform decimal formatting (no percent symbol)
      return num.toFixed(2);
    };
    const mean = data?.mean ?? 0;
    const p005 = data?.p005 ?? 0;
    const p995 = data?.p995 ?? 0;
    const rows = (data?.centers || []).map((x, i) => ({ x, y: (data.counts || [])[i] || 0 }));
    const formattedMean = formatX(mean);
    const ciLabel = `[${formatX(p005)}, ${formatX(p995)}]`;
    // Keep badges one line even with info icon: small, tight leading
    const badgeTextClass = 'text-xs md:text-sm leading-tight whitespace-nowrap';
    const badgePadClass = 'px-3 py-2';
    return (
      <div className="space-y-2">
        {/* Badges row (outside and above the plot card) */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`bg-slate-800/70 border border-slate-700 rounded-md ${badgePadClass} ${badgeTextClass} font-medium text-slate-100`}> 
            <div className="flex items-center justify-center gap-1">
              <InfoTooltip title="Mean" description="Average of the bootstrapped values for this metric." />
              <span>Mean: {formattedMean}</span>
            </div>
          </div>
          <div className={`bg-slate-800/70 border border-slate-700 rounded-md ${badgePadClass} ${badgeTextClass} font-medium text-slate-100`}>
            <div className="flex items-center justify-center gap-1">
              <InfoTooltip title="99% Confidence Interval" description="Range containing 99% of simulated values (0.5% to 99.5%)." />
              <span>99% CI: {ciLabel}</span>
            </div>
          </div>
        </div>
        {/* Plot card */}
        <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
          <div className="flex items-center mb-2 gap-2">
            <InfoTooltip title={`${title} Histogram`} description={`Distribution of bootstrapped ${title} values from 10k simulated equity curves.`} />
            <span className="font-semibold text-sm text-slate-200">{title}</span>
          </div>
          <div style={{ width: '100%', height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 6, left: 8 }}>
                <CartesianGrid stroke="#334155" vertical={false} />
                <XAxis dataKey="x" tickFormatter={formatX} stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickLine={{ stroke: '#334155' }} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickLine={{ stroke: '#334155' }} />
                <RTooltip content={<HistogramTooltip title={title} fmt={fmt} formatX={formatX} />} />
                <Bar dataKey="y" fill={color} stroke="#000000" strokeWidth={1} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  const RobustnessGrid = ({ charts }) => {
    const defs = [
      { key: 'sharpes', title: 'Sharpe', fmt: 'ratio', color: '#22c55e' },
      { key: 'sortinos', title: 'Sortino', fmt: 'ratio', color: '#3b82f6' },
      { key: 'calmar', title: 'Calmar', fmt: 'ratio', color: '#ef4444' },
      { key: 'cagrs', title: 'CAGR', fmt: 'ratio', color: '#a78bfa' },
      { key: 'mdds', title: 'Max Drawdown', fmt: 'ratio', color: '#92400e' },
      { key: 'avgdds', title: 'Average Drawdown', fmt: 'ratio', color: '#b45309' },
    ];
    return (
      <div className="grid md:grid-cols-3 gap-4">
        {defs.map(d => <HistCard key={d.key} title={d.title} data={charts?.[d.key]} fmt={d.fmt} color={d.color} />)}
      </div>
    );
  };

  return (
      <div className="min-h-screen py-8 lg:py-10 bg-slate-950 text-white">
        <div className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Backtest</h1>
            <p className="text-slate-400 mt-2">Run simple top-bottom decile strategy backtests and view OOS metrics.</p>
          </div>

          {controlBar}

          {/* Summary metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-2">
            {equityLoading
              ? metricDefs.map((m) => (
                  <div key={m.key} className="bg-slate-900 border border-slate-800 rounded-lg p-4 animate-pulse h-20" />
                ))
              : metricDefs.map((m) => (
                  <MetricBadge key={m.key} label={m.label} fmt={m.fmt} value={metrics?.[m.key]} info={m.info} />
                ))}
          </div>
          {/* BTC comparison badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
            {equityLoading
              ? metricDefs.map((m) => (
                  <div key={'btc-'+m.key} className="bg-slate-900 border border-slate-800 rounded-lg p-4 animate-pulse h-20" />
                ))
              : metricDefs.map((m) => (
                  <MetricBadge key={'btc-'+m.key} label={`BTC ${m.label}`} fmt={m.fmt} value={btcMetrics?.[m.key]} info={`BTC ${m.info}`} />
                ))}
          </div>

          {/* Main section: Equity curve and drawdowns */}
          <div className="grid md:grid-cols-1 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                  <InfoTooltip title="Equity Curve" description="Cumulative product of (1 + returns) after fees; compared to BTC buy‑and‑hold over same cadence." />
                  Equity Curve (Strategy vs BTC)
                </span>
              </div>
              {equityLoading ? <ChartCardSkeleton height={380} /> : equityError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{equityError}</div>
              ) : equityHtml ? (
                <iframe srcDoc={equityHtml} title="Backtest Equity Curve" className="w-full rounded-md" style={{ height: 400, border: 'none', background: 'transparent' }} />
              ) : (
                <div className="text-slate-400 text-sm p-4 text-center">No data available for the selected range.</div>
              )}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                  <InfoTooltip
                    title="Underwater Curve"
                    description="Peak-to-trough drawdowns for the strategy and BTC. Values sit at 0% at new peaks and drop negative when the equity curve is below its prior high."
                  />
                  Underwater (Drawdown %)
                </span>
              </div>
              {equityLoading ? <ChartCardSkeleton height={320} /> : equityError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{equityError}</div>
              ) : underwaterSeries?.length ? (
                <div style={{ width: '100%', height: 320 }}>
                  <ResponsiveContainer>
                    <AreaChart data={underwaterSeries} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="strategy-dd-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="btc-dd-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#334155" vertical={false} />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickFormatter={drawdownTickFormatter}
                        domain={['dataMin', 0]}
                      />
                      <RTooltip
                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#1e293b', color: '#e2e8f0' }}
                        formatter={drawdownTooltipFormatter}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={28}
                        wrapperStyle={{ color: '#cbd5e1' }}
                        formatter={drawdownLegendFormatter}
                      />
                      <Area
                        type="monotone"
                        dataKey="strategy"
                        name="Strategy Drawdown"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        fill="url(#strategy-dd-fill)"
                        fillOpacity={1}
                        connectNulls
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="btc"
                        name="BTC Drawdown"
                        stroke="#ef4444"
                        strokeWidth={2}
                        fill="url(#btc-dd-fill)"
                        fillOpacity={1}
                        connectNulls
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-slate-400 text-sm p-4 text-center">No drawdown data available for the selected range.</div>
              )}
            </div>
          </div>

          {/* Alpha / Beta */}
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2"><span className="font-semibold text-sm text-slate-200 flex items-center gap-2"><InfoTooltip title="Rolling Alpha" description="Extra return versus BTC over the last 30 days. Positive means the strategy outpaced BTC on average." /> Rolling 30‑Day Alpha vs BTC</span></div>
              {abLoading ? <ChartCardSkeleton height={360} /> : abError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{abError}</div>
              ) : alphaHtml ? (
                <iframe srcDoc={alphaHtml} title="Rolling Alpha" className="w-full rounded-md" style={{ height: 380, border: 'none', background: 'transparent' }} />
              ) : <div className="text-slate-400 text-sm p-4 text-center">No data</div>}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2"><span className="font-semibold text-sm text-slate-200 flex items-center gap-2"><InfoTooltip title="Rolling Beta" description="How closely the strategy moves with BTC over 30 days. Around 1 means it moves with BTC; near 0 means it’s independent; negative moves opposite." /> Rolling 30‑Day Beta vs BTC</span></div>
              {abLoading ? <ChartCardSkeleton height={360} /> : abError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{abError}</div>
              ) : betaHtml ? (
                <iframe srcDoc={betaHtml} title="Rolling Beta" className="w-full rounded-md" style={{ height: 380, border: 'none', background: 'transparent' }} />
              ) : <div className="text-slate-400 text-sm p-4 text-center">No data</div>}
            </div>
          </div>

          {/* Robustness / Bootstrap */}
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3 mt-6">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-sm text-slate-200 flex items-center gap-2"><InfoTooltip title="Robustness Testing" description="We shuffle and resample daily returns to build many alternate histories. The histograms show how much each metric could vary, giving a realistic range of outcomes." /> Robustness: Bootstrapped Metrics (10k curves)
              </span>
            </div>
            {bootstrapLoading ? (
              <div className="grid md:grid-cols-3 gap-4">
                {Array.from({length:6}).map((_,i)=>(<ChartCardSkeleton key={i} height={320} />))}
              </div>
            ) : bootstrapError ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{bootstrapError}</div>
            ) : bootstrapCharts ? (
              <RobustnessGrid charts={bootstrapCharts} InfoTooltip={InfoTooltip} />
            ) : bootstrapHtml ? (
              <iframe srcDoc={bootstrapHtml} title="Bootstrap Robustness" className="w-full rounded-md" style={{ height: 560, border: 'none', background: 'transparent' }} />
            ) : <div className="text-slate-400 text-sm p-4 text-center">No data</div>}
          </div>
        </div>
      </div>
  );
}
