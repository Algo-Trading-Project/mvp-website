
import React, { useState, useEffect, useRef } from "react";
import { createPageUrl } from "@/utils";
import { Download, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { User } from "@/api/entities";
import { getSupabaseClient } from "@/api/supabaseClient";
import { toast } from "sonner";

import SignalHealthDisplay from "../components/dashboard/SignalHealthDisplay";
import TopSignals, { getTopSignalsCacheKey } from "../components/dashboard/TopSignals";

// Import subpage components
import DashboardOOSSection from "../components/dashboard/DashboardOOSSection";
import Backtest from "./Backtest";

import DashboardOverviewSkeleton from "@/components/skeletons/DashboardOverviewSkeleton";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";

const DASHBOARD_CACHE_KEY = "dashboard-cache-v1";

const loadDashboardCache = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to read dashboard cache", error);
    return null;
  }
};

const persistDashboardCache = (snapshot) => {
  if (typeof window === "undefined") return;
  try {
    if (snapshot) {
      window.sessionStorage?.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(snapshot));
    } else {
      window.sessionStorage?.removeItem(DASHBOARD_CACHE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist dashboard cache", error);
  }
};

export default function Dashboard() {
  const MODEL_VERSION = "Model v1.3";
  const MODEL_RELEASED_AT = "Retrained 2025-08-01";
  const cacheRef = useRef(loadDashboardCache());
  const cached = cacheRef.current;
  const [activeTab, setActiveTab] = useState("regression"); // default to regression to avoid blank page
  const [user, setUser] = useState(null);
  const [contentLoading, setContentLoading] = useState(() => (cached ? false : true));
  const [metricsRows, setMetricsRows] = useState(() => cached?.metricsRows ?? []);
  const [metricsLoading, setMetricsLoading] = useState(() => (cached ? false : true));
  const [horizon, setHorizon] = useState('1d');
  const [signalsLoading, setSignalsLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.sessionStorage?.getItem(getTopSignalsCacheKey('1d')) ? false : true;
  });
  const [metricsError, setMetricsError] = useState(null);
  const [latestSnapshot, setLatestSnapshot] = useState(() => cached?.latestSnapshot ?? null);
  const { search } = useLocation();

  // Check for URL parameter to set active tab
  useEffect(() => {
    const urlParams = new URLSearchParams(search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ["overview","regression"].includes(tabParam)) {
      setActiveTab(tabParam);
    } else if (!tabParam) {
      setActiveTab("regression");
    }
  }, [search]); // Depend on useLocation().search to re-evaluate when URL changes

  // Check auth status (optional now - dashboard works without login)
  useEffect(() => {
    const check = async () => {
      try {
        const me = await User.me();
        setUser(me);
      } catch (e) {
        setUser(null); // No auth required
      }
    };
    check();
  }, []);

  // Load latest overview metrics directly from daily_dashboard_metrics (no Edge Function)
  useEffect(() => {
    const loadLatest = async () => {
      if (!cacheRef.current) setMetricsLoading(true);
      setMetricsError(null);
      try {
        const supabase = getSupabaseClient();
        // Fetch recent rows (>=30) and compute 30d metrics client-side to avoid schema drift
        const { data, error } = await supabase
          .from('daily_dashboard_metrics')
          .select(`date,
            ic:${horizon === '3d' ? 'cs_spearman_ic_3d' : 'cs_spearman_ic_1d'},
            spread:${horizon === '3d' ? 'cs_top_bottom_decile_spread_3d' : 'cs_top_bottom_decile_spread_1d'},
            hitCount:${horizon === '3d' ? 'cs_hit_count_3d' : 'cs_hit_count_1d'},
            totalCount:${horizon === '3d' ? 'total_count_3d' : 'total_count_1d'}`)
          .order('date', { ascending: false })
          .limit(90);
        if (error) throw error;
        const normalize = (v) => {
          if (typeof v === 'number') return Number.isFinite(v) ? v : null;
          if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : null; }
          return null;
        };
        const rowsDesc = Array.isArray(data) ? data : [];
        // Take the most recent rows, then compute 30d metrics over non-null values
        const rows = rowsDesc
          .map((r) => ({
            date: String(r.date ?? ''),
            ic: normalize(r.ic),
            spread: normalize(r.spread),
            hitCount: normalize(r.hitCount) ?? 0,
            totalCount: normalize(r.totalCount) ?? 0,
          }))
          .filter((r) => r.date)
          .slice(0, 90)
          .reverse(); // oldest→newest

        const lastN = (n) => rows.slice(Math.max(0, rows.length - n));
        const last30 = lastN(30);

        const avg = (arr) => {
          const vals = arr.filter((v) => typeof v === 'number' && Number.isFinite(v));
          if (!vals.length) return null;
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        };
        const ic30 = avg(last30.map((r) => r.ic));
        const sp30 = avg(last30.map((r) => r.spread));
        const hit30 = (() => {
          const num = last30.reduce((s, r) => s + (typeof r.hitCount === 'number' ? r.hitCount : 0), 0);
          const den = last30.reduce((s, r) => s + (typeof r.totalCount === 'number' ? r.totalCount : 0), 0);
          if (!den) return null;
          return num / den;
        })();

        const snapshotLatest = {
          rolling_ic_30d: ic30,
          top_bottom_spread_30d: sp30,
          hit_rate_30d: hit30,
        };
        setLatestSnapshot(snapshotLatest);
        cacheRef.current = { metricsRows: [], latestSnapshot: snapshotLatest, fetchedAt: Date.now() };
        persistDashboardCache(cacheRef.current);
      } catch (error) {
        console.error('Failed to load latest overview metrics', error);
        setLatestSnapshot(null);
        setMetricsRows([]);
        const message = error?.message || 'Unable to load latest overview metrics.';
        setMetricsError(message);
        toast.error('Metrics data could not be loaded', { id: 'dashboard-metrics-error', description: message });
      } finally {
        setMetricsLoading(false);
      }
    };
    loadLatest();
  }, [horizon]);

  useEffect(() => {
    if (cacheRef.current) {
      setContentLoading(false);
      return;
    }
    const t = setTimeout(() => setContentLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!cacheRef.current || metricsLoading) {
      setContentLoading(true);
      const t = setTimeout(() => setContentLoading(false), 600);
      return () => clearTimeout(t);
    }
    setContentLoading(false);
  }, [activeTab, metricsLoading]);

  // Horizon toggle removed (1d-only)

  const displayName = user?.full_name || "Guest";
  const subscription = user ? { plan: user.subscription_level || "free", current_period_end: new Date().toISOString() } : null;

  // Get the most recent single row of metrics
  const lastMetrics = metricsLoading || !metricsRows.length ? null : metricsRows[metricsRows.length - 1];

  // Helper to find the most recent non-null numeric value for a given key.
  const latestValue = (rows, key) => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = rows[i]?.[key];
      if (typeof v === "number" && !Number.isNaN(v)) {
        return v;
      }
    }
    return null;
  };

  // Latest overview metrics (1d only)
  const currentModelData = React.useMemo(() => {
    if (latestSnapshot) return latestSnapshot;
    if (!metricsRows.length) return null;
    return {
      rolling_ic_30d: latestValue(metricsRows, "rolling_30d_ic_1d"),
      hit_rate_30d: latestValue(metricsRows, "rolling_30d_hit_rate_1d"),
      top_bottom_spread_30d: latestValue(metricsRows, "rolling_30d_avg_top_bottom_decile_spread_1d"),
    };
  }, [latestSnapshot, metricsRows]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "regression", label: "Regression Model Performance" },
    { id: "backtest", label: "Backtest" },
  ];

  const renderContent = () => {
    if (contentLoading || metricsLoading) {
      if (activeTab === "overview") return <DashboardOverviewSkeleton />;
      return (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <ChartCardSkeleton />
            <ChartCardSkeleton />
          </div>
          <ChartCardSkeleton height={280} lines={2} />
        </div>
      );
    }

    switch (activeTab) {
      case "overview":
        return (
          <>
            {metricsError ? (
              <div className="mb-6 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {metricsError}
              </div>
            ) : null}
            {/* Model toggle */}
            <div className="flex items-center justify-end mb-4">
              <label className="text-xs text-slate-400 mr-2">Model</label>
              <select
                value={horizon}
                onChange={(e) => setHorizon(e.target.value === '3d' ? '3d' : '1d')}
                className="bg-slate-900 border border-slate-700 px-2 py-1 rounded h-8 text-white"
              >
                <option value="1d">1‑Day</option>
                <option value="3d">3‑Day</option>
              </select>
            </div>

            <div className="grid lg:grid-cols-1 gap-6 mb-8">
              {currentModelData && (
                <SignalHealthDisplay title={`${horizon === '3d' ? '3-Day' : '1-Day'} Model Health (Most Recent Data)`} data={currentModelData} />
              )}
            </div>
            <TopSignals subscription={subscription} horizon={horizon} loading={signalsLoading} onLoadingChange={setSignalsLoading} />
          </>
        );
      case "regression":
        return <DashboardOOSSection />;
      case "backtest":
        return <Backtest />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen py-6 bg-slate-950">
      <div className="max-w-[1700px] mx-auto px-2 sm:px-3 lg:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Model status</p>
            <p className="text-sm text-slate-200">{MODEL_VERSION}</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-current" />
              Live OOS feed
            </span>
            <span>{MODEL_RELEASED_AT}</span>
          </div>
        </div>
        <div className="border-b border-slate-800 mb-6">
          <div className="flex flex-wrap gap-x-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  // Update URL without full page reload
                  window.history.pushState({}, '', `?tab=${tab.id}`);
                }}
                className={`px-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-blue-500 text-white'
                    : 'border-b-2 border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div key={activeTab} className="transition-all duration-300 ease-in-out">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
