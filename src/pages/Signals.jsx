
import React from "react";
import { User } from "@/api/entities";
import { predictions } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Search, Filter, Lock, ChevronDown, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

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
  const rows = await predictions.filter({ date }, "symbol_id", 10000);
  return rows.map(r => ({
    date: r.date,
    symbol: r.symbol_id.split("_")[0],
    y_pred: r.y_pred
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
    const loadLatest = async () => {
      const last = await predictions.filter({}, "-date", 1);
      if (last?.length) {
        setLatestDate(last[0].date);
        const end = last[0].date;
        const endDate = new Date(end);
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6);
        setRange({
          start: startDate.toISOString().slice(0,10),
          end
        });
      }
    };
    loadLatest();
  }, []);

  // Load symbol list, lexicographic
  React.useEffect(() => {
    const loadTokens = async () => {
      const rows = await predictions.filter({}, "symbol_id", 10000);
      const unique = Array.from(new Set(rows.map(r => r.symbol_id.split("_")[0])));
      unique.sort((a, b) => a.localeCompare(b));
      setAllTokens(unique);
    };
    loadTokens();
  }, []);

  // Load initial recent dates (first 14 days), excluding the most recent day
  React.useEffect(() => {
    const loadInitialDates = async () => {
      setRecentLoading(true);
      const rows = await predictions.filter({}, "-date", 10000);
      const seen = new Set();
      const allDates = [];
      
      for (const r of rows) {
        if (!seen.has(r.date)) {
          seen.add(r.date);
          allDates.push(r.date);
        }
      }
      
      // Exclude the latest by skipping index 0
      const initial = allDates.slice(1, 15);
      setVisibleDates(initial);
      
      if (initial.length > 0) {
        setLastLoadedDate(initial[initial.length - 1]);
      }
      
      // Are there more dates beyond these 14 (excluding the latest)?
      setHasMoreDates(allDates.length > 15);
      setRecentLoading(false);
    };
    loadInitialDates();
  }, []);

  const loadMoreDates = async () => {
    if (!hasMoreDates || loadingMore) return;
    setLoadingMore(true);
    
    const rows = await predictions.filter({}, "-date", 10000);
    const seen = new Set();
    const allDates = [];
    for (const r of rows) {
      if (!seen.has(r.date)) {
        seen.add(r.date);
        allDates.push(r.date);
      }
    }

    // Filter to dates older than the last loaded date (latest already excluded in initial batch)
    const olderDates = allDates.filter(d => d < lastLoadedDate);
    const nextBatch = olderDates.slice(0, 14);

    if (nextBatch.length > 0) {
      setVisibleDates(prev => [...prev, ...nextBatch]);
      setLastLoadedDate(nextBatch[nextBatch.length - 1]);
      setHasMoreDates(olderDates.length > 14);
    } else {
      setHasMoreDates(false);
    }

    setLoadingMore(false);
  };

  const plan = me?.subscription_level || "free";
  const isPro = plan === "pro" || plan === "desk";
  const isFreeUser = !me || plan === "free";

  const freshness = React.useMemo(() => {
    if (!latestDate) return { label: "Syncing", tone: "pending" };
    const latest = new Date(`${latestDate}T00:00:00Z`);
    const now = new Date();
    const diffDays = (now - latest) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1.5) return { label: "On schedule", tone: "ok" };
    if (diffDays <= 2.5) return { label: "Slight delay", tone: "warn" };
    return { label: "Investigating", tone: "alert" };
  }, [latestDate]);

  // Set selected tokens based on user tier
  React.useEffect(() => {
    if (isFreeUser && selectedTokens.length !== FREE_TIER_TOKENS.length) {
      setSelectedTokens(FREE_TIER_TOKENS);
    }
  }, [isFreeUser, selectedTokens.length]); // Fix: Added selectedTokens.length to dependency array

  const handleDownloadToday = async () => {
    if (!latestDate) return;
    setTodayLoading(true);
    const rows = await fetchPredictionsForDate(latestDate);
    const csv = toCSV(rows);
    saveFile(csv, `predictions_${latestDate}.csv`);
    setTodayLoading(false);
  };

  const handleDownloadForDate = async (date) => {
    const rows = await fetchPredictionsForDate(date);
    const csv = toCSV(rows);
    saveFile(csv, `predictions_${date}.csv`);
  };

  const handleTokenFilterClick = () => {
    if (isFreeUser) {
      setUpgradeMessage("Free tier only gets access to the following tokens' predictions: BTC, ETH, BNB, XRP, SOL, DOGE, TRX, ADA. Upgrade for access to the entire universe of 390+ tokens.");
      setShowUpgradeModal(true);
      return;
    }
    setTokenModalOpen(true);
  };

  const handleRangeDownload = async () => {
    if (!range.start || !range.end) return;

    const start = new Date(range.start);
    const end = new Date(range.end);
    const diffDays = Math.ceil((end - start) / (1000*60*60*24)) + 1;
    
    // Check date range limits for free users
    if (isFreeUser && diffDays > 31) {
      setUpgradeMessage("Free tier is limited to 1 month of historical predictions. Upgrade for extended historical access and download up to 6 months of data.");
      setShowUpgradeModal(true);
      return;
    }
    
    const allowedDays = isPro ? 180 : 31;
    if (diffDays > allowedDays) {
      alert(`Your plan allows up to ${allowedDays} days per request. Please narrow the range.`);
      return;
    }

    setRangeLoading(true);
    const allRows = [];
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0,10);
      const dayRows = await fetchPredictionsForDate(ds);
      if (dayRows.length) {
        allRows.push(...dayRows);
      }
    }

    // For free users, always filter to free tier tokens
    const tokensToFilter = isFreeUser ? FREE_TIER_TOKENS : selectedTokens;
    if (tokensToFilter.length > 0) {
      const setTokens = new Set(tokensToFilter.map(s => s.toUpperCase()));
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
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span>Extended access requires Pro</span>
            </div>
            <Link to={createPageUrl("Data")} className="text-emerald-300 hover:text-emerald-200">
              See column dictionary →
            </Link>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {/* Today's Predictions */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl shadow-xl">
            <div className="p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Today's Predictions</h3>
                  <p className="text-slate-400">Download the latest daily predictions across the entire universe.</p>
                </div>
                <div className="p-3 bg-blue-600/20 rounded-lg">
                  <Download className="w-6 h-6 text-blue-400" />
                </div>
              </div>
              
              <div className="bg-slate-800/60 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Date:</span>
                  <span className="font-mono text-slate-200">{latestDate || "—"}</span>
                </div>
              </div>

              <Button
                onClick={handleDownloadToday}
                disabled={!latestDate || todayLoading}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all duration-200"
              >
                <Download className="w-5 h-5 mr-2" />
                {todayLoading ? "Preparing Download..." : "Download CSV"}
              </Button>
            </div>
          </div>

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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">From Date</label>
                    <input
                      type="date"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={range.start}
                      onChange={(e) => setRange(r => ({ ...r, start: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">To Date</label>
                    <input
                      type="date"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={range.end}
                      onChange={(e) => setRange(r => ({ ...r, end: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Token Filter {isFreeUser ? "(Free Tier: 8 tokens)" : "(Pro Only)"}
                  </label>
                  <Button
                    variant="outline"
                    className="w-full h-10 rounded-lg border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                    onClick={handleTokenFilterClick}
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    {isFreeUser ? "8 tokens selected" : selectedTokens.length ? `${selectedTokens.length} tokens selected` : "Select tokens to filter"}
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

              {isFreeUser && (
                <div className="mt-4 p-3 bg-amber-600/10 border border-amber-600/20 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-400 text-sm">
                    <Lock className="w-4 h-4" />
                    <span>Free tier limited to 8 tokens and 1 month history. Upgrade for full access.</span>
                  </div>
                </div>
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
          <DialogHeader>
            <DialogTitle className="text-xl">Upgrade Required</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-300">{upgradeMessage}</p>
          </div>
          <DialogFooter>
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
    </div>
  );
}
