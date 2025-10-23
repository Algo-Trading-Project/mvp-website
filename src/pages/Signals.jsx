
import React from "react";
import { User } from "@/api/entities";
import { listPredictionDates, predictionsRange, getLiteTokens } from "@/api/functions";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Search, Filter, ChevronDown, X, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

function toCSV(rows) {
  const headers = ["date", "symbol", "y_pred"];
  const lines = [headers.join(",")];
  rows.forEach(r => {
    const line = [
      r.date,
      r.symbol,
      r.y_pred ?? ""
    ].join(",");
    lines.push(line);
  });
  return lines.join("\n");
}

async function fetchPredictionsForDate(date) {
  const res = await predictionsRange({ start: date, end: date, limit: 200000 });
  const rows = Array.isArray(res?.rows) ? res.rows : [];
  return rows.map((r) => ({
    date: r.date,
    symbol: String(r.symbol_id || "").split("_")[0],
    y_pred: r.y_pred,
  }));
}

function saveFile(content, filename, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Free tier frozen token list
const FREE_TIER_TOKENS = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL', 'DOGE', 'TRX', 'ADA'];

export default function SignalsHub() {
  const [me, setMe] = React.useState(null);
  const [loadingUser, setLoadingUser] = React.useState(true);

  const [latestDate, setLatestDate] = React.useState("");
  const [todayLoading, setTodayLoading] = React.useState(false);

  const [range, setRange] = React.useState({ start: "", end: "" });
  const [rangeLoading, setRangeLoading] = React.useState(false);

  // Token multi-select modal + persistence
  const [tokenModalOpen, setTokenModalOpen] = React.useState(false);
  const [allTokens, setAllTokens] = React.useState([]);
  const [tokenSearch, setTokenSearch] = React.useState("");
  const [liteAllowedTokens, setLiteAllowedTokens] = React.useState([]);
  const liteInitRef = React.useRef(false);
  const [tokensReady, setTokensReady] = React.useState(false);
  
  // Updated selectedTokens logic for free tier
  const [selectedTokens, setSelectedTokens] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem("qp_selected_tokens");
      return saved ? JSON.parse(saved) : FREE_TIER_TOKENS;
    }
    return FREE_TIER_TOKENS;
  });

  // Fixed pagination for recent dates
  const [visibleDates, setVisibleDates] = React.useState([]);
  const [lastLoadedDate, setLastLoadedDate] = React.useState("");
  const [hasMoreDates, setHasMoreDates] = React.useState(true);
  const [recentLoading, setRecentLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  // Upgrade prompt states
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  const [upgradeMessage, setUpgradeMessage] = React.useState("");
  const [showTierInfoModal, setShowTierInfoModal] = React.useState(false);
  const [showDateInfoModal, setShowDateInfoModal] = React.useState(false);

  // Derive plan tier from auth user metadata (subscription_tier preferred)
  const planTier = React.useMemo(() => {
    const meta = (me && (me.user_metadata || me.raw_user_meta_data)) || {};
    const tier = String((meta.subscription_tier ?? meta.subscription_level ?? "")).toLowerCase();
    if (tier) return tier;
    const slug = String(meta.plan_slug ?? "").toLowerCase();
    if (slug.includes("pro")) return "pro";
    if (slug.includes("lite")) return "lite";
    if (slug.includes("api")) return "api";
    return "free";
  }, [me]);

  const isPro = planTier === "pro" || planTier === "api" || planTier === "desk";
  const isLite = planTier === 'lite';
  const isFreeUser = !me || planTier === "free";

  // Lite lookback enforcement helpers
  const LITE_LOOKBACK_DAYS = 180;
  const liteMinDate = React.useMemo(() => {
    if (!latestDate) return "";
    const end = new Date(`${latestDate}T00:00:00Z`);
    const start = new Date(end);
    // Inclusive 180-day window ending on latestDate
    start.setUTCDate(end.getUTCDate() - (LITE_LOOKBACK_DAYS - 1));
    return start.toISOString().slice(0, 10);
  }, [latestDate]);

  const clampLiteDate = (value) => {
    if (!isLite || !latestDate) return value;
    let v = value;
    if (liteMinDate && v < liteMinDate) v = liteMinDate;
    if (v > latestDate) v = latestDate;
    return v;
  };

  React.useEffect(() => {
    (async () => {
      try {
        const u = await User.me();
        setMe(u);
      } catch {
        setMe(null);
      }
      setLoadingUser(false);
    })();
  }, []);

  React.useEffect(() => {
    const loadInitial = async () => {
      const { dates = [] } = (await listPredictionDates({ limit: 8 })) || {};
      if (dates.length) {
        setLatestDate(dates[0]);
        const end = dates[0];
        const endDate = new Date(`${end}T00:00:00Z`);
        const startDate = new Date(endDate);
        startDate.setUTCDate(endDate.getUTCDate() - 6);
        setRange({ start: startDate.toISOString().slice(0, 10), end });
        // Set recent (exclude latest)
        setVisibleDates(dates.slice(1, 8));
        setHasMoreDates(false);
        setRecentLoading(false);
      } else {
        setRecentLoading(false);
      }
    };
    setRecentLoading(true);
    loadInitial();
  }, []);

  // Load token list from latest day via edge function
  // Load token list for latest day
  React.useEffect(() => {
    if (!latestDate) return;
    const loadTokens = async () => {
      // Reset readiness while (re)loading
      setTokensReady(false);
      // Free: avoid calling the API function (blocked on server), no tokens allowed
      if (isFreeUser) {
        setAllTokens([]);
        setTokensReady(true);
        return;
      }
      // Lite: use the curated list directly
      if (isLite) {
        if (liteAllowedTokens.length) {
          const sorted = [...liteAllowedTokens].sort((a, b) => a.localeCompare(b));
          setAllTokens(sorted);
        } else {
          setAllTokens([]);
          // Keep tokensReady false until list arrives
        }
        return;
      }
      // Pro+/API: fetch the day’s universe and list bases
      const res = await predictionsRange({ start: latestDate, end: latestDate, limit: 200000 });
      const rows = Array.isArray(res?.rows) ? res.rows : [];
      const unique = Array.from(
        new Set(rows.map((r) => String(r.symbol_id || "").split("_")[0]).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
      setAllTokens(unique);
      setTokensReady(true);
    };
    loadTokens();
  }, [latestDate, planTier, isFreeUser, isLite, liteAllowedTokens.length]);

  // Load Lite allowed tokens when user is Lite
  React.useEffect(() => {
    const fetchLite = async () => {
      if (planTier !== 'lite') {
        setLiteAllowedTokens([]);
        liteInitRef.current = false;
        return;
      }
      try {
        const res = await getLiteTokens({});
        const bases = Array.isArray(res?.base_symbols) ? res.base_symbols : [];
        setLiteAllowedTokens(bases);
      } catch (e) {
        setLiteAllowedTokens([]);
      }
    };
    fetchLite();
  }, [planTier]);

  // Recent dates are derived in loadInitial above (exclude latest, top 7)

  const loadMoreDates = async () => {
    // With simplified recent list (top 7), no pagination for now
    return;
  };

  // (moved plan tier + flags earlier to avoid TDZ issues in hooks below)

  const freshness = React.useMemo(() => {
    if (!latestDate) return { label: "Syncing", tone: "pending" };
    const latest = new Date(`${latestDate}T00:00:00Z`);
    const now = new Date();
    const diffDays = (now - latest) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1.5) return { label: "On schedule", tone: "ok" };
    if (diffDays <= 2.5) return { label: "Slight delay", tone: "warn" };
    // Default to a stable green state instead of red
    return { label: "Stable", tone: "ok" };
  }, [latestDate]);

  // Set selected tokens based on user tier
  React.useEffect(() => {
    if (isFreeUser) {
      // Free users cannot download; no tokens allowed
      if (selectedTokens.length !== 0) {
        setSelectedTokens([]);
      }
      return;
    }
    if (isLite && liteAllowedTokens.length) {
      // On first load for Lite, default to all allowed tokens
      if (!liteInitRef.current) {
        setSelectedTokens(liteAllowedTokens);
        liteInitRef.current = true;
        setTokensReady(true);
        return;
      }
      const allowed = new Set(liteAllowedTokens.map((s) => s.toUpperCase()));
      const filtered = selectedTokens.filter((t) => allowed.has(String(t).toUpperCase()));
      if (filtered.length !== selectedTokens.length || filtered.length === 0) {
        // If nothing left after filtering, default to all allowed
        setSelectedTokens(filtered.length ? filtered : liteAllowedTokens);
      }
      setTokensReady(true);
    }
  }, [isFreeUser, isLite, liteAllowedTokens.length, selectedTokens.length]);

  // For Pro/API tiers, default to selecting all tokens when first loaded
  React.useEffect(() => {
    if (!isFreeUser && !isLite && allTokens.length) {
      const isDefaultFree = selectedTokens.length === FREE_TIER_TOKENS.length &&
        FREE_TIER_TOKENS.every(t => selectedTokens.includes(t));
      if (selectedTokens.length === 0 || isDefaultFree) {
        setSelectedTokens(allTokens);
      }
      setTokensReady(true);
    }
  }, [isFreeUser, isLite, allTokens.length]);

  const handleDownloadToday = async () => {
    if (isFreeUser) {
      setUpgradeMessage("Downloads are not available on the Free tier. Upgrade to Lite or Pro for access.");
      setShowUpgradeModal(true);
      return;
    }
    if (!latestDate) return;
    setTodayLoading(true);
    const rows = await fetchPredictionsForDate(latestDate);
    const csv = toCSV(rows);
    saveFile(csv, `predictions_${latestDate}.csv`);
    setTodayLoading(false);
  };

  const handleDownloadForDate = async (date) => {
    if (isFreeUser) {
      setUpgradeMessage("Downloads are not available on the Free tier. Upgrade to Lite or Pro for access.");
      setShowUpgradeModal(true);
      return;
    }
    const rows = await fetchPredictionsForDate(date);
    const csv = toCSV(rows);
    saveFile(csv, `predictions_${date}.csv`);
  };

  const handleTokenFilterClick = () => {
    if (isFreeUser) {
      setUpgradeMessage("Downloads are not available on the Free tier. Upgrade to Lite (60 tokens) or Pro for access.");
      setShowUpgradeModal(true);
      return;
    }
    setTokenModalOpen(true);
  };

  const handleRangeDownload = async () => {
    if (isFreeUser) {
      setUpgradeMessage("Downloads are not available on the Free tier. Upgrade to Lite or Pro for access.");
      setShowUpgradeModal(true);
      return;
    }
    if (!range.start || !range.end) return;

    // Universal per-request cap: 365 days (inclusive)
    const start = new Date(`${range.start}T00:00:00Z`);
    const end = new Date(`${range.end}T00:00:00Z`);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000*60*60*24)) + 1;
    if (diffDays > 365) {
      alert('Maximum of 365 days per request. Please break your request into smaller ranges.');
      return;
    }

    // Enforce Lite lookback: both dates must be within the last 180 days ending on latestDate
    if (isLite && latestDate) {
      if ((liteMinDate && range.start < liteMinDate) || range.end > latestDate) {
        alert(`Lite tier allows selecting dates within the last ${LITE_LOOKBACK_DAYS} days ending on ${latestDate}.`);
        return;
      }
    }

    setRangeLoading(true);
    const tokenFilter = selectedTokens;
    const payload = { start: range.start, end: range.end, limit: 200000 };
    if (tokenFilter && tokenFilter.length) {
      // Use short symbols (BTC) — server expands to *_USD
      Object.assign(payload, { tokens: tokenFilter });
    }
    const res = await predictionsRange(payload);
    const allRows = (res?.rows || []).map((r) => ({
      date: r.date,
      symbol: String(r.symbol_id || "").split("_")[0],
      y_pred: r.y_pred,
    }));

    // For free users, always filter to free tier tokens
    const tokensToFilter = selectedTokens;
    if (tokensToFilter && tokensToFilter.length > 0) {
      const setTokens = new Set(tokensToFilter.map((s) => s.toUpperCase()));
      const filtered = allRows.filter(r => setTokens.has(r.symbol.toUpperCase()));
      const csv = toCSV(filtered);
      const suffix = isFreeUser ? "_free_tier" : "_filtered";
      saveFile(csv, `predictions_${range.start}_to_${range.end}${suffix}.csv`);
    } else {
      const csv = toCSV(allRows);
      saveFile(csv, `predictions_${range.start}_to_${range.end}.csv`);
    }
    
    setRangeLoading(false);
  };

  // Persist selections (only for paid users)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && !isFreeUser) {
      localStorage.setItem("qp_selected_tokens", JSON.stringify(selectedTokens));
    }
  }, [selectedTokens, isFreeUser]);

  if (loadingUser) {
    return (
      <div className="min-h-screen py-8 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-8 w-64 bg-slate-800 rounded mb-2 animate-pulse" />
          <div className="h-4 w-96 bg-slate-800 rounded mb-8 animate-pulse" />
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="h-32 bg-slate-900 border border-slate-800 rounded-lg animate-pulse" />
            <div className="h-32 bg-slate-900 border border-slate-800 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Signals <span className="gradient-text">Repository</span></h1>
          <div className="flex items-center justify-center gap-8 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Latest: {latestDate || "Loading..."}</span>
            </div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border ${
                freshness.tone === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : freshness.tone === 'warn'
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  : freshness.tone === 'alert'
                  ? 'bg-red-500/10 border-red-500/40 text-red-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              {freshness.label}
            </span>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid lg:grid-cols-1 gap-8 mb-12">
          {/* Historical Range */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl shadow-xl">
            <div className="p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Historical Download</h3>
                  <p className="text-slate-400">Download predictions across a selected date range. Extended ranges and full token access require Pro.</p>
                </div>
                <div className="p-3 bg-emerald-600/20 rounded-lg">
                  <Search className="w-6 h-6 text-emerald-400" />
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-end gap-4 flex-wrap">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <label className="block text-sm font-medium text-slate-300">From Date</label>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-200"
                        aria-label="Date lookback information"
                        onClick={() => setShowDateInfoModal(true)}
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="date"
                      className="w-44 h-9 bg-slate-800 border border-slate-600 rounded-md px-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={range.start}
                      min="2020-01-01"
                      onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <label className="block text-sm font-medium text-slate-300">To Date</label>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-200"
                        aria-label="Date lookback information"
                        onClick={() => setShowDateInfoModal(true)}
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="date"
                      className="w-44 h-9 bg-slate-800 border border-slate-600 rounded-md px-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={range.end}
                      min="2020-01-01"
                      onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-slate-300">
                      {tokensReady ? (
                        (() => {
                          const tierName = isFreeUser ? 'Free Tier' : isLite ? 'Lite Tier' : (planTier === 'api' ? 'API Tier' : 'Pro Tier');
                          const allowedCount = isFreeUser ? 0 : (isLite ? liteAllowedTokens.length : allTokens.length);
                          return `Token Filter (${tierName}: ${allowedCount} tokens)`;
                        })()
                      ) : (
                        <span className="inline-block h-4 w-56 bg-slate-700/60 rounded animate-pulse" />
                      )}
                    </label>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-200"
                      aria-label="Tier access information"
                      onClick={() => setShowTierInfoModal(true)}
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full h-10 rounded-lg border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                    onClick={handleTokenFilterClick}
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    {tokensReady ? (
                      isFreeUser
                        ? `${selectedTokens.length || 0} tokens selected`
                        : (selectedTokens.length ? `${selectedTokens.length} tokens selected` : "Select tokens to filter")
                    ) : (
                      <span className="inline-block h-4 w-40 bg-slate-700/60 rounded animate-pulse" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleRangeDownload}
                disabled={rangeLoading || !range.start || !range.end}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-all duration-200"
              >
                <Search className="w-5 h-5 mr-2" />
                {rangeLoading ? "Preparing Download..." : "Request Historical CSV"}
              </Button>

              {false && isFreeUser && (
                <div />
              )}
            </div>
          </div>
        </div>

        {/* Recent Files */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg">
          <div className="px-8 py-6 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Recent Daily Files</h3>
              <span className="text-sm text-slate-400">
                Showing {visibleDates.length} files
              </span>
            </div>
          </div>
          
          <div className="p-8">
            {/* Today's predictions row moved here */}
            {latestDate && (
              <div className="flex items-center justify-between p-4 mb-4 bg-slate-800/40 hover:bg-slate-800/60 rounded-lg transition-colors duration-200">
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span className="font-mono text-slate-200">{latestDate} (Today)</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 px-4 bg-white text-slate-900 border-slate-300 hover:bg-slate-100 rounded-lg font-medium"
                  onClick={handleDownloadToday}
                  disabled={!latestDate || todayLoading}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {todayLoading ? 'Preparing...' : 'Download CSV'}
                </Button>
              </div>
            )}
            {recentLoading ? (
              <div className="space-y-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-800/60 rounded-lg animate-pulse">
                    <div className="h-5 w-24 bg-slate-700 rounded" />
                    <div className="h-9 w-32 bg-slate-700 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleDates.map(date => (
                  <div key={date} className="flex items-center justify-between p-4 bg-slate-800/40 hover:bg-slate-800/60 rounded-lg transition-colors duration-200">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="font-mono text-slate-200">{date}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 px-4 bg-white text-slate-900 border-slate-300 hover:bg-slate-100 rounded-lg font-medium"
                      onClick={() => handleDownloadForDate(date)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download CSV
                    </Button>
                  </div>
                ))}
                
                {!visibleDates.length && (
                  <div className="text-center py-12">
                    <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No recent files found.</p>
                  </div>
                )}
                
                {hasMoreDates && (
                  <div className="text-center pt-6">
                    <Button
                      onClick={loadMoreDates}
                      disabled={loadingMore}
                      variant="outline"
                      className="h-10 px-8 bg-white text-slate-900 border-slate-300 hover:bg-slate-100 rounded-lg font-medium"
                    >
                      {loadingMore ? "Loading..." : "Load More"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade Prompt Modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="bg-slate-900 border border-slate-700 text-white">
          <DialogHeader className="text-center items-center">
            <DialogTitle className="text-xl">Upgrade Required</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-slate-300">{upgradeMessage}</p>
          </div>
          <DialogFooter className="justify-center sm:justify-center">
            <Button
              onClick={() => setShowUpgradeModal(false)}
              variant="outline"
              className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Close
            </Button>
            <Button
              onClick={() => window.location.href = '/Pricing'}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              View Plans
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token Selection Modal (Pro only) */}
      <Dialog open={tokenModalOpen} onOpenChange={setTokenModalOpen}>
        <DialogContent className="bg-slate-900 border border-slate-700 text-white max-w-2xl max-h-[80vh] overflow-hidden">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl">Select Tokens</DialogTitle>
            <p className="text-slate-400">Choose which tokens to include in your download. Your selection will be saved.</p>
          </DialogHeader>
          
          <div className="space-y-4">
            <Input
              placeholder="Search tokens..."
              value={tokenSearch}
              onChange={(e) => setTokenSearch(e.target.value)}
              className="bg-slate-800 border-slate-600 focus:ring-2 focus:ring-blue-500"
            />
            
            <div className="max-h-64 overflow-y-auto border border-slate-700 rounded-lg">
              <div className="divide-y divide-slate-700">
                {allTokens
                  .filter(t => !tokenSearch || t.toLowerCase().includes(tokenSearch.toLowerCase()))
                  .map(token => {
                    const checked = selectedTokens.includes(token);
                    return (
                      <label key={token} className="flex items-center gap-3 p-3 hover:bg-slate-800 cursor-pointer transition-colors">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            if (v) setSelectedTokens(s => [...s, token]);
                            else setSelectedTokens(s => s.filter(x => x !== token));
                          }}
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <span className="font-mono text-sm">{token}</span>
                      </label>
                    );
                  })}
                {allTokens.filter(t => !tokenSearch || t.toLowerCase().includes(tokenSearch.toLowerCase())).length === 0 && (
                  <div className="p-4 text-center text-slate-400">No tokens found.</div>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter className="pt-4 border-t border-slate-700">
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-slate-400">
                {selectedTokens.length} token{selectedTokens.length !== 1 ? 's' : ''} selected
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedTokens(allTokens)}
                  className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
                  disabled={allTokens.length === 0}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedTokens([])}
                  className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Clear All
                </Button>
                <Button
                  onClick={() => setTokenModalOpen(false)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Done
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tier Info Modal */}
      <Dialog open={showTierInfoModal} onOpenChange={setShowTierInfoModal}>
        <DialogContent className="bg-slate-900 border border-slate-700 text-white max-w-lg">
          <DialogHeader className="text-center items-center">
            <DialogTitle className="text-xl">Token Universe by Tier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-slate-300 text-center">
            <p>
              Access to the token universe depends on your plan tier:
            </p>
            <ul className="list-disc pl-5 space-y-1 inline-block text-left mx-auto">
              <li><span className="font-semibold">Free:</span> Downloads are not available.</li>
              <li><span className="font-semibold">Lite:</span> Top 60 tokens by 90‑day median daily dollar volume, excluding stablecoins.</li>
              <li><span className="font-semibold">Pro/API:</span> Full token universe.</li>
            </ul>
          </div>
          <DialogFooter className="justify-center sm:justify-center">
            <Button
              onClick={() => setShowTierInfoModal(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date Lookback Info Modal */}
      <Dialog open={showDateInfoModal} onOpenChange={setShowDateInfoModal}>
        <DialogContent className="bg-slate-900 border border-slate-700 text-white max-w-lg">
          <DialogHeader className="text-center items-center">
            <DialogTitle className="text-xl">Date Range Lookback Limits</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-slate-300 text-center">
            <p>
              Maximum historical lookback depends on your subscription tier:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-left">
              <li><span className="font-semibold">Free:</span> 0 days (downloads not available).</li>
              <li><span className="font-semibold">Lite:</span> up to 180 days.</li>
              <li><span className="font-semibold">Pro/API:</span> entire history (365 days per request).</li>
            </ul>
          </div>
          <DialogFooter className="justify-center sm:justify-center">
            <Button
              onClick={() => setShowDateInfoModal(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
