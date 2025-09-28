
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
import DashboardClassificationSection from "../components/dashboard/DashboardClassificationSection";

import DashboardOverviewSkeleton from "@/components/skeletons/DashboardOverviewSkeleton";
import ChartCardSkeleton from "@/components/skeletons/ChartCardSkeleton";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("regression"); // default to regression to avoid blank page
  const [modelHorizon, setModelHorizon] = useState("1d"); // NEW: model toggle for overview
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
    if (tabParam && ["overview","regression","classification"].includes(tabParam)) {
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
          // Map IC 30d EMA to legacy keys expected in the overview display
          rolling_30d_ic_1d: Number(r.rolling_30d_ema_ic_1d ?? null),
          rolling_30d_ic_7d: Number(r.rolling_30d_ema_ic_7d ?? null),
          // Map decile spread 30d EMA
          rolling_30d_avg_top_bottom_decile_spread_1d: Number(r.rolling_30d_ema_top_bottom_decile_spread_1d ?? null),
          rolling_30d_avg_top_bottom_decile_spread_7d: Number(r.rolling_30d_ema_top_bottom_decile_spread_7d ?? null),
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

  const handleModelHorizonChange = async (newHorizon) => {
    if (signalsLoading || newHorizon === modelHorizon) return;
    setSignalsLoading(true);
    setModelHorizon(newHorizon);
  };

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

  // NEW: Choose metrics based on selected model horizon using latest non-null values
  const currentModelData = metricsRows.length
    ? {
        rolling_ic_30d:
          modelHorizon === "1d"
            ? latestValue(metricsRows, "rolling_30d_ic_1d")
            : latestValue(metricsRows, "rolling_30d_ic_7d"),
        // Hit rate removed in data; keep null so UI won't mislead
        hit_rate_30d: null,
        top_bottom_spread_30d:
          modelHorizon === "1d"
            ? latestValue(metricsRows, "rolling_30d_avg_top_bottom_decile_spread_1d")
            : latestValue(metricsRows, "rolling_30d_avg_top_bottom_decile_spread_7d"),
      }
    : null;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "regression", label: "Regression Model Performance" },
    { id: "classification", label: "Classification Model Performance" }
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
            <div className="flex justify-end mb-6">
              <div className="flex items-center gap-2">
                <button
                  disabled={contentLoading || metricsLoading || signalsLoading}
                  className={`px-3 py-1.5 rounded-md border transition-colors ${
                    modelHorizon === "1d"
                      ? "bg-blue-600 border-blue-500 text-white"
                      : (contentLoading || metricsLoading || signalsLoading)
                      ? "bg-slate-700 border-slate-600 text-slate-400 cursor-not-allowed"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  }`}
                  onClick={() => handleModelHorizonChange("1d")}
                >
                  1‑Day Model
                </button>
                <button
                  disabled={contentLoading || metricsLoading || signalsLoading}
                  className={`px-3 py-1.5 rounded-md border transition-colors ${
                    modelHorizon === "7d"
                      ? "bg-blue-600 border-blue-500 text-white"
                      : (contentLoading || metricsLoading || signalsLoading)
                      ? "bg-slate-700 border-slate-600 text-slate-400 cursor-not-allowed"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  }`}
                  onClick={() => handleModelHorizonChange("7d")}
                >
                  7‑Day Model
                </button>
              </div>
            </div>

            <div className="grid lg:grid-cols-1 gap-6 mb-8">
              {currentModelData && (
                <SignalHealthDisplay
                  title={`${modelHorizon === "1d" ? "1-Day" : "7-Day"} Model Health (Most Recent Data)`}
                  data={currentModelData}
                />
              )}
            </div>
            <TopSignals
              subscription={subscription}
              modelHorizon={modelHorizon}
              loading={signalsLoading}
              onLoadingChange={setSignalsLoading}
            />
          </>
        );
      case "regression":
        return <DashboardOOSSection />;
      case "classification":
        return <DashboardClassificationSection />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen py-8 bg-slate-950">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
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
