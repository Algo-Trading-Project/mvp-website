import React from "react";
import { Button } from "@/components/ui/button";
import { Crown, TrendingDown, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getLatestPredictions } from "@/api/functions";
import { toast } from "sonner";

export const getTopSignalsCacheKey = (horizon = '1d') => `top-signals-cache-v2:${horizon}`;

const loadSignalsCache = (cacheKey) => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(cacheKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to read top signals cache", error);
    return null;
  }
};

const persistSignalsCache = (cacheKey, snapshot) => {
  if (typeof window === "undefined") return;
  try {
    if (snapshot) {
      window.sessionStorage?.setItem(cacheKey, JSON.stringify(snapshot));
    } else {
      window.sessionStorage?.removeItem(cacheKey);
    }
  } catch (error) {
    console.warn("Failed to persist top signals cache", error);
  }
};

// Loading skeleton for signals table
const SignalTableSkeleton = ({ title, icon: Icon, iconColor }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-md">
    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
      <h3 className="flex items-center space-x-2 font-semibold text-sm">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span>{title}</span>
      </h3>
      <div className="h-7 w-20 bg-slate-800 rounded animate-pulse" />
    </div>
    <div className="p-4">
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center p-3 rounded-md bg-slate-800/60">
            <div className="flex items-center space-x-3 min-w-[160px]">
              <div className="w-12 h-12 bg-slate-700 rounded-sm animate-pulse" />
              <div className="flex-1 text-center">
                <div className="h-4 w-10 bg-slate-700 rounded mx-auto animate-pulse" />
              </div>
            </div>
            <div className="h-8 w-px bg-slate-700 mx-4" />
            <div className="flex-1 grid grid-cols-2 divide-x divide-slate-700">
              <div className="px-3 text-center">
                <div className="h-4 w-16 bg-slate-700 rounded mx-auto mb-2 animate-pulse" />
                <div className="h-3 w-10 bg-slate-800 rounded mx-auto animate-pulse" />
              </div>
              <div className="px-3 text-center">
                <div className="h-4 w-16 bg-slate-700 rounded mx-auto mb-2 animate-pulse" />
                <div className="h-3 w-12 bg-slate-800 rounded mx-auto animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default function TopSignals({ subscription, horizon = '1d', loading = false, onLoadingChange = () => {} }) {
  const cacheKey = getTopSignalsCacheKey(horizon);
  const cacheRef = React.useRef(loadSignalsCache(cacheKey));
  const cached = cacheRef.current;

  const [topSignals, setTopSignals] = React.useState(cached?.topSignals ?? []);
  const [bottomSignals, setBottomSignals] = React.useState(cached?.bottomSignals ?? []);
  const [internalLoading, setInternalLoading] = React.useState(cached ? false : true);
  const [error, setError] = React.useState(null);

  const loadSignals = React.useCallback(
    async (abortSignal, { suppressLoading = false } = {}) => {
      if (!suppressLoading) {
        setInternalLoading(true);
        setError(null);
        onLoadingChange(true);
      } else {
        onLoadingChange(false);
      }

      try {
        const data = await getLatestPredictions({ horizon }, { signal: abortSignal });
        if (abortSignal?.aborted) return;

        const lastDate = data?.date;
        const rows = data?.rows || [];

        if (!lastDate || !rows.length) {
          setTopSignals([]);
          setBottomSignals([]);
          setInternalLoading(false);
          onLoadingChange(false);
          return;
        }

        const predField = "y_pred";
        const scored = rows
          .map((r) => {
            const raw = r[predField];
            const score =
              typeof raw === "number"
                ? (Number.isNaN(raw) ? null : raw)
                : typeof raw === "string"
                ? (() => {
                    const num = Number(raw);
                    return Number.isFinite(num) ? num : null;
                  })()
                : null;
            return {
              symbol: String(r.symbol_id ?? "").split("_")[0] || "",
              score,
            };
          })
          .filter((r) => r.symbol && typeof r.score === "number");

        if (!scored.length) {
          setTopSignals([]);
          setBottomSignals([]);
          setInternalLoading(false);
          onLoadingChange(false);
          return;
        }

        const sortedDesc = [...scored].sort((a, b) => b.score - a.score);
        const n = sortedDesc.length;
        const withStats = sortedDesc.map((r, idx) => ({
          symbol: r.symbol,
          pred_return: r.score,
          percentile: n > 1 ? (1 - idx / (n - 1)) * 100 : 100,
          rank: idx + 1,
        }));

        const topFive = withStats.slice(0, 5);
        setTopSignals(topFive);
        const bottom = [...withStats].slice(-5).map((r, i) => ({
          ...r,
          rank: n - 5 + i + 1,
        }));
        setBottomSignals(bottom);

        const snapshot = {
          topSignals: topFive,
          bottomSignals: bottom,
          lastUpdated: new Date().toISOString(),
        };
        cacheRef.current = snapshot;
        persistSignalsCache(cacheKey, snapshot);
      } catch (err) {
        if (abortSignal?.aborted) return;
        console.error("Failed to load latest predictions", err);
        const message = err?.message || "Unable to load signals.";
        setError(message);
        if (!cacheRef.current) {
          setTopSignals([]);
          setBottomSignals([]);
        }
        toast.error("Unable to load today’s signals", {
          id: "top-signals-error",
          description: message,
        });
      } finally {
        if (abortSignal?.aborted) return;
        if (!suppressLoading) {
          setInternalLoading(false);
        }
        onLoadingChange(false);
      }
    },
    [onLoadingChange]
  );

  React.useEffect(() => {
    const controller = new AbortController();
    const hasCache = Boolean(cacheRef.current);
    loadSignals(controller.signal, { suppressLoading: hasCache });
    return () => controller.abort();
  }, [loadSignals, horizon]);

  const getPercentileColor = (percentile) => {
    if (percentile >= 95) return "text-emerald-400";
    if (percentile >= 90) return "text-blue-400";
    if (percentile >= 80) return "text-amber-400";
    if (percentile <= 10) return "text-red-400";
    return "text-slate-400";
  };
  const getReturnColor = (ret) => (ret >= 0 ? "text-emerald-400" : "text-red-400");
  const pct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;

  const isLoggedIn = Boolean(subscription);
  const ctaTarget = isLoggedIn ? "HistoricalHub" : "GetStarted";

  const isLoading = loading || internalLoading;

  const handleRetry = () => {
    loadSignals(undefined, { suppressLoading: false });
  };

  const SignalTable = ({ signals, title, icon: Icon, iconColor }) => {
    if (isLoading) {
      return <SignalTableSkeleton title={title} icon={Icon} iconColor={iconColor} />;
    }

    if (error) {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-md">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="flex items-center space-x-2 font-semibold text-sm">
              <Icon className={`w-4 h-4 ${iconColor}`} />
              <span>{title}</span>
            </h3>
            <Button variant="outline" size="sm" onClick={handleRetry} className="rounded-md">
              Retry
            </Button>
          </div>
          <div className="p-6 flex flex-col items-center text-center text-sm text-red-300 gap-3">
            <AlertTriangle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      );
    }

    if (!signals.length) {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-md">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="flex items-center space-x-2 font-semibold text-sm">
              <Icon className={`w-4 h-4 ${iconColor}`} />
              <span>{title}</span>
            </h3>
          </div>
          <div className="p-6 text-center text-sm text-slate-300">No signals available today.</div>
        </div>
      );
    }

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-md">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="flex items-center space-x-2 font-semibold text-sm">
            <Icon className={`w-4 h-4 ${iconColor}`} />
            <span>{title}</span>
          </h3>
          <Link to={createPageUrl(ctaTarget)}>
            <Button variant="outline" size="sm" className="rounded-md bg-white text-slate-900 border-slate-300 hover:bg-slate-100 text-xs h-7">
              View All
            </Button>
          </Link>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            {signals.map((signal) => (
              <div key={signal.symbol} className="flex items-center p-3 rounded-md bg-slate-800/60">
                {/* Left: rank + symbol (CENTERED SYMBOL) */}
                <div className="flex items-center space-x-3 min-w-[160px]">
                  <div className="w-12 h-12 bg-slate-700 rounded-sm flex items-center justify-center text-sm font-bold">
                    {signal.rank}
                  </div>
                  <div className="flex-1 text-center">
                    <div className="font-semibold text-sm">{signal.symbol}</div>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-8 w-px bg-slate-700 mx-4" />

                {/* Metrics */}
                <div className="flex-1 grid grid-cols-2 divide-x divide-slate-700">
                  <div className="px-3 text-center">
                    <div className={`font-semibold text-sm ${getReturnColor(signal.pred_return)}`}>
                      {pct(signal.pred_return, 1)}
                    </div>
                    <div className="text-xs text-slate-400">{horizon === '3d' ? '3d Pred' : '1d Pred'}</div>
                  </div>
                  <div className="px-3 text-center">
                    <div className={`font-semibold text-sm ${getPercentileColor(signal.percentile)}`}>
                      {signal.percentile.toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-400">Percentile</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <SignalTable
        signals={topSignals}
        title="Top 5 Signals Today"
        icon={Crown}
        iconColor="text-amber-400"
      />
      <SignalTable
        signals={bottomSignals}
        title="Bottom 5 Signals Today"
        icon={TrendingDown}
        iconColor="text-red-400"
      />
    </div>
  );
}
