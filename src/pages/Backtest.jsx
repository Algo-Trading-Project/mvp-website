import React from "react";
import Layout from "./Layout";
import { createPageUrl } from "@/utils";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";
import { backtestEquityCurvePlot, backtestRollingAlphaPlot, backtestBootstrapRobustnessPlot } from "@/api/functions";

export default function Backtest() {
  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateRange, setDateRange] = React.useState({ start: "2019-02-01", end: todayIso });

  const [equityHtml, setEquityHtml] = React.useState(null);
  const [equityLoading, setEquityLoading] = React.useState(true);
  const [equityError, setEquityError] = React.useState(null);

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
        const res = await backtestBootstrapRobustnessPlot({ start: dateRange.start, end: dateRange.end, iterations: 3000, window: 30 });
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

  return (
    <Layout currentPageName="Backtest">
      <div className="min-h-screen py-8 bg-slate-950 text-white">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Backtest</h1>
            <p className="text-slate-400 mt-2">Run simple top-bottom decile strategy backtests and view OOS metrics.</p>
          </div>

          {controlBar}

          {/* Main section: Equity curve only */}
          <div className="grid md:grid-cols-1 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2"><span className="font-semibold text-sm text-slate-200">Equity Curve (Strategy vs BTC)</span></div>
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
              <div className="flex items-center justify-between mb-2"><span className="font-semibold text-sm text-slate-200">Rolling 30‑Day Alpha vs BTC</span></div>
              {abLoading ? <ChartCardSkeleton height={360} /> : abError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{abError}</div>
              ) : alphaHtml ? (
                <iframe srcDoc={alphaHtml} title="Rolling Alpha" className="w-full rounded-md" style={{ height: 380, border: 'none', background: 'transparent' }} />
              ) : <div className="text-slate-400 text-sm p-4 text-center">No data</div>}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-md p-3">
              <div className="flex items-center justify-between mb-2"><span className="font-semibold text-sm text-slate-200">Rolling 30‑Day Beta vs BTC</span></div>
              {abLoading ? <ChartCardSkeleton height={360} /> : abError ? (
                <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{abError}</div>
              ) : betaHtml ? (
                <iframe srcDoc={betaHtml} title="Rolling Beta" className="w-full rounded-md" style={{ height: 380, border: 'none', background: 'transparent' }} />
              ) : <div className="text-slate-400 text-sm p-4 text-center">No data</div>}
            </div>
          </div>

          {/* Robustness / Bootstrap */}
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3 mt-6">
            <div className="flex items-center justify-between mb-2"><span className="font-semibold text-sm text-slate-200">Bootstrap OOS Performance (Window Compounded Return)</span></div>
            {bootstrapLoading ? <ChartCardSkeleton height={360} /> : bootstrapError ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-md p-4 text-center">{bootstrapError}</div>
            ) : bootstrapHtml ? (
              <iframe srcDoc={bootstrapHtml} title="Bootstrap Robustness" className="w-full rounded-md" style={{ height: 380, border: 'none', background: 'transparent' }} />
            ) : <div className="text-slate-400 text-sm p-4 text-center">No data</div>}
          </div>
        </div>
      </div>
    </Layout>
  );
}
