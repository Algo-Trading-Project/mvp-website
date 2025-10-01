
import React, { useState, useEffect } from "react";
import { createPageUrl } from "@/utils";
import { Download, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { User } from "@/api/entities";
import { fetchMetrics } from "@/api/functions";
import { toast } from "sonner";

import SignalHealthDisplay from "../components/dashboard/SignalHealthDisplay";
import TopSignals from "../components/dashboard/TopSignals";

// Import subpage components
import DashboardOOSSection from "../components/dashboard/DashboardOOSSection";

import DashboardOverviewSkeleton from "@/components/skeletons/DashboardOverviewSkeleton";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";

export default function Dashboard() {
  const MODEL_VERSION = "Model v1.3";
  const MODEL_RELEASED_AT = "Retrained 2025-08-22";
  const [activeTab, setActiveTab] = useState("regression"); // default to regression to avoid blank page
  const [user, setUser] = useState(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [metricsRows, setMetricsRows] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(null);
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

  // Load metrics data (no auth required)
  useEffect(() => {
    const loadMetrics = async () => {
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const data = await fetchMetrics({});
        const rows = data?.cross || [];
        rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        const mapped = rows.map(r => ({
          date: r.date,
          // New schema fields mapped to legacy keys used by overview
          rolling_30d_ic_1d: Number(r.rolling_30d_avg_ic ?? null),
          rolling_30d_avg_top_bottom_decile_spread_1d: Number(r.rolling_30d_avg_top_bottom_decile_spread ?? null),
          rolling_30d_hit_rate_1d: Number(r.rolling_30d_hit_rate ?? null),
        }));
        setMetricsRows(mapped);
      } catch (error) {
        console.error("Failed to fetch metrics:", error);
        setMetricsRows([]); // Clear data on error
        const message = error?.message || "Unable to load dashboard metrics.";
        setMetricsError(message);
        toast.error("Metrics data could not be loaded", {
          id: "dashboard-metrics-error",
          description: message,
        });
      } finally {
        setMetricsLoading(false);
      }
    };
    loadMetrics();
  }, []); // Remove dependency on auth status

  useEffect(() => {
    const t = setTimeout(() => setContentLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setContentLoading(true);
    const t = setTimeout(() => setContentLoading(false), 600);
    return () => clearTimeout(t);
  }, [activeTab]);

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
  const currentModelData = metricsRows.length
    ? {
        rolling_ic_30d: latestValue(metricsRows, "rolling_30d_ic_1d"),
        hit_rate_30d: latestValue(metricsRows, "rolling_30d_hit_rate_1d"),
        top_bottom_spread_30d: latestValue(metricsRows, "rolling_30d_avg_top_bottom_decile_spread_1d"),
      }
    : null;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "regression", label: "Regression Model Performance" }
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
            {/* Horizon toggle removed; 1d-only */}

            <div className="grid lg:grid-cols-1 gap-6 mb-8">
              {currentModelData && (
                <SignalHealthDisplay title="1-Day Model Health (Most Recent Data)" data={currentModelData} />
              )}
            </div>
            <TopSignals subscription={subscription} loading={signalsLoading} onLoadingChange={setSignalsLoading} />
          </>
        );
      case "regression":
        return <DashboardOOSSection />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen py-8 bg-slate-950">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
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
