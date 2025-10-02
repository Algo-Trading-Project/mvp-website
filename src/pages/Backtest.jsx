import React from "react";
// Note: This component is intended to be embedded inside Dashboard.jsx.
// Do not wrap with Layout to avoid duplicate headers.
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { backtestEquityCurvePlot, backtestRollingAlphaPlot, backtestBootstrapRobustnessPlot } from "@/api/functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";

export default function Backtest() {
  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateRange, setDateRange] = React.useState({ start: "2019-02-01", end: todayIso });

  const [equityHtml, setEquityHtml] = React.useState(null);
  const [equityLoading, setEquityLoading] = React.useState(true);
  const [equityError, setEquityError] = React.useState(null);
  const [metrics, setMetrics] = React.useState(null);
  const [btcMetrics, setBtcMetrics] = React.useState(null);

  const [alphaHtml, setAlphaHtml] = React.useState(null);
  const [betaHtml, setBetaHtml] = React.useState(null);
  const [abLoading, setAbLoading] = React.useState(true);
  const [abError, setAbError] = React.useState(null);

  const [bootstrapHtml, setBootstrapHtml] = React.useState(null);
  const [bootstrapLoading, setBootstrapLoading] = React.useState(true);
  const [bootstrapError, setBootstrapError] = React.useState(null);

  React.useEffect(() => {
    const load = async () => {
      setEquityLoading(true); setEquityError(null);
      try {
        const res = await backtestEquityCurvePlot({ start: dateRange.start, end: dateRange.end, period: '1d', fees: 0.003 });
        setEquityHtml(res?.html || null);
        setMetrics(res?.metrics || null);
        setBtcMetrics(res?.btc_metrics || null);
      } catch (e) { setEquityError(e?.message || 'Unable to load equity curve'); setEquityHtml(null); }
      finally { setEquityLoading(false); }
    };
    load();
  }, [dateRange.start, dateRange.end]);

  React.useEffect(() => {
    const load = async () => {
      setAbLoading(true); setAbError(null);
      try {
        const res = await backtestRollingAlphaPlot({ start: dateRange.start, end: dateRange.end, window: 30 });
        setAlphaHtml(res?.alpha || null);
        setBetaHtml(res?.beta || null);
      } catch (e) { setAbError(e?.message || 'Unable to load alpha/beta'); setAlphaHtml(null); setBetaHtml(null); }
      finally { setAbLoading(false); }
    };
    load();
  }, [dateRange.start, dateRange.end]);

  // Removed OOS plots from Backtest per request

  React.useEffect(() => {
    const load = async () => {
      setBootstrapLoading(true); setBootstrapError(null);
      try {
        const res = await backtestBootstrapRobustnessPlot({ start: dateRange.start, end: dateRange.end, iterations: 10000, period: '1d', fees: 0.003 });
        setBootstrapHtml(res?.html || null);
      } catch (e) { setBootstrapError(e?.message || 'Unable to load bootstrap plot'); setBootstrapHtml(null); }
      finally { setBootstrapLoading(false); }
    };
    load();
  }, [dateRange.start, dateRange.end]);

  const controlBar = (
    <div className="flex w-full items-center justify-end mb-4">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400">From</label>
        <input type="date" value={dateRange.start} max={dateRange.end || todayIso} onChange={(e)=>setDateRange(r=>({...r,start:e.target.value}))} className="bg-slate-900 border border-slate-700 px-2 py-1 rounded h-8 text-white" />
        <label className="text-xs text-slate-400 ml-2">To</label>
        <input type="date" value={dateRange.end} max={todayIso} onChange={(e)=>setDateRange(r=>({...r,end:e.target.value}))} className="bg-slate-900 border border-slate-700 px-2 py-1 rounded h-8 text-white" />
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
    return (
      <div className="text-center bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-400 flex items-center justify-center gap-1">
          {label}
          <InfoTooltip title={label} description={info} />
        </div>
        <div className="text-xl font-bold text-white mt-1">{format(value)}</div>
      </div>
    );
  };

  const metricDefs = [
    { key:'total_return', label:'Total Return', fmt:'pct', info:'Final equity minus 1 over selected period.' },
    { key:'cagr', label:'CAGR', fmt:'pct', info:'Compound Annual Growth Rate based on cadence and period length.' },
    { key:'max_drawdown', label:'Max Drawdown', fmt:'pct', info:'Largest peak‑to‑trough decline of equity.' },
    { key:'avg_drawdown', label:'Avg Drawdown', fmt:'pct', info:'Average drawdown across time (negative values).' },
    { key:'sharpe', label:'Sharpe', fmt:'ratio', info:'Annualized mean return divided by volatility (risk‑free assumed 0).' },
    { key:'sortino', label:'Sortino', fmt:'ratio', info:'Annualized mean return divided by downside deviation.' },
    { key:'calmar', label:'Calmar', fmt:'ratio', info:'CAGR divided by absolute max drawdown.' },
  ];

  return (
      <div className="min-h-screen py-8 bg-slate-950 text-white">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
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

          {/* Main section: Equity curve only */}
          <div className="grid md:grid-cols-1 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                  Equity Curve (Strategy vs BTC)
                  <InfoTooltip title="Equity Curve" description="Cumulative product of (1 + returns) after fees; compared to BTC buy‑and‑hold over same cadence." />
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
          </div>

          {/* Alpha / Beta */}
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2"><span className="font-semibold text-sm text-slate-200 flex items-center gap-2">Rolling 30‑Day Alpha vs BTC <InfoTooltip title="Rolling Alpha" description="Mean strategy return minus beta times mean BTC return over a 30‑day window." /></span></div>
              {abLoading ? <ChartCardSkeleton height={360} /> : abError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{abError}</div>
              ) : alphaHtml ? (
                <iframe srcDoc={alphaHtml} title="Rolling Alpha" className="w-full rounded-md" style={{ height: 380, border: 'none', background: 'transparent' }} />
              ) : <div className="text-slate-400 text-sm p-4 text-center">No data</div>}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2"><span className="font-semibold text-sm text-slate-200 flex items-center gap-2">Rolling 30‑Day Beta vs BTC <InfoTooltip title="Rolling Beta" description="Slope of strategy returns regressed on BTC returns over a 30‑day window." /></span></div>
              {abLoading ? <ChartCardSkeleton height={360} /> : abError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{abError}</div>
              ) : betaHtml ? (
                <iframe srcDoc={betaHtml} title="Rolling Beta" className="w-full rounded-md" style={{ height: 380, border: 'none', background: 'transparent' }} />
              ) : <div className="text-slate-400 text-sm p-4 text-center">No data</div>}
            </div>
          </div>

          {/* Robustness / Bootstrap */}
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3 mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm text-slate-200 flex items-center gap-2">Robustness: Bootstrapped Metrics (10k curves)
                <InfoTooltip title="Bootstrap Robustness" description="Resample returns with replacement to build 10,000 synthetic equity curves and show histograms of key performance metrics." />
              </span>
            </div>
            {bootstrapLoading ? <ChartCardSkeleton height={360} /> : bootstrapError ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{bootstrapError}</div>
            ) : bootstrapHtml ? (
              <iframe srcDoc={bootstrapHtml} title="Bootstrap Robustness" className="w-full rounded-md" style={{ height: 560, border: 'none', background: 'transparent' }} />
            ) : <div className="text-slate-400 text-sm p-4 text-center">No data</div>}
          </div>
        </div>
      </div>
  );
}
