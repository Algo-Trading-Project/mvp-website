
import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User as UserIcon, KeyRound, CreditCard, LogIn, Loader2, Copy, ShieldAlert, ShieldOff } from 'lucide-react';
import { User } from '@/api/entities';
import { Navigate, useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import AccountPageSkeleton from "@/components/skeletons/AccountPageSkeleton";
import { toast } from "sonner";
import { SUPABASE_ANON_KEY } from "@/api/config";

const ACCOUNT_CACHE_KEY = "account-page-cache";

const loadAccountCache = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to read account cache", error);
    return null;
  }
};

const persistAccountCache = (snapshot) => {
  if (typeof window === "undefined") return;
  try {
    if (snapshot) {
      window.sessionStorage?.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(snapshot));
    } else {
      window.sessionStorage?.removeItem(ACCOUNT_CACHE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist account cache", error);
  }
};

const hashApiKey = async (key) => {
  if (!key) throw new Error("Cannot hash an empty API key.");
  if (typeof crypto === "undefined" || !crypto.subtle?.digest) {
    throw new Error("Secure hashing is unavailable in this environment.");
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export default function Account() {
  const cacheRef = useRef(loadAccountCache());
  const [user, setUser] = useState(cacheRef.current?.user ?? null);
  const [subscription, setSubscription] = useState(cacheRef.current?.subscription ?? null);
  const [loading, setLoading] = useState(!cacheRef.current);
  const navigate = useNavigate();

  // New states for preferences and API key
  const [marketingOptIn, setMarketingOptIn] = useState(cacheRef.current?.preferences?.marketingOptIn ?? false);
  const [weeklySummary, setWeeklySummary] = useState(cacheRef.current?.preferences?.weeklySummary ?? false);
  const [productUpdates, setProductUpdates] = useState(cacheRef.current?.preferences?.productUpdates ?? false);
  const [apiKey, setApiKey] = useState(cacheRef.current?.apiKey ?? "");
  const [hasStoredApiKey, setHasStoredApiKey] = useState(cacheRef.current?.hasApiKeyHash ?? false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(null);
  const [copyStatus, setCopyStatus] = useState("idle");
  const [anonCopyStatus, setAnonCopyStatus] = useState("idle");
  const [showPlainApiKey, setShowPlainApiKey] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const saveBannerTimeout = useRef(null);

  const initialPreferencesRef = useRef({
    marketingOptIn: cacheRef.current?.preferences?.marketingOptIn ?? false,
    weeklySummary: cacheRef.current?.preferences?.weeklySummary ?? false,
    productUpdates: cacheRef.current?.preferences?.productUpdates ?? false,
  });

  useEffect(() => {
    const checkUser = async () => {
      if (!cacheRef.current) setLoading(true);
      try {
        const me = await User.me();
        if (!me) {
          setUser(null);
          setSubscription(null);
          setApiKey("");
          setHasStoredApiKey(false);
          setLoading(false);
          cacheRef.current = null;
          persistAccountCache(null);
          return;
        }

        setUser(me);
        const meta = me?.raw_user_meta_data ?? me?.user_metadata ?? {};
        const cachedApiKey = cacheRef.current?.apiKey ?? "";
        setApiKey(cachedApiKey || "");
        setHasStoredApiKey(Boolean(meta?.api_key_hash));
        const prefs = {
          marketingOptIn: Boolean(meta.marketing_opt_in ?? meta.marketingOptIn ?? false),
          weeklySummary: Boolean(meta.weekly_summary ?? meta.weeklySummary ?? false),
          productUpdates: Boolean(meta.product_updates ?? meta.productUpdates ?? false),
        };
        initialPreferencesRef.current = prefs;
        setMarketingOptIn(prefs.marketingOptIn);
        setWeeklySummary(prefs.weeklySummary);
        setProductUpdates(prefs.productUpdates);
        if (me?.subscription_level && me.subscription_level !== "free") {
          setSubscription({
            plan: me.subscription_level,
            status: "active",
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        } else {
          setSubscription(null);
        }
      } catch (e) {
        setUser(null);
        setSubscription(null);
        setApiKey("");
        setHasStoredApiKey(false);
        cacheRef.current = null;
        persistAccountCache(null);
        initialPreferencesRef.current = {
          marketingOptIn: false,
          weeklySummary: false,
          productUpdates: false,
        };
        setMarketingOptIn(false);
        setWeeklySummary(false);
        setProductUpdates(false);
      }
      setLoading(false);
    };
    checkUser();
  }, []);

  const canGenerateApiKey = true;

  const generateRandomKey = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    const hex = [];
    for (let i = 0; i < 32; i++) {
      hex.push(((Math.random() * 16) | 0).toString(16));
    }
    return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
  };

  const handleGenerateApiKey = async () => {
    if (!canGenerateApiKey) return;
    setApiKeyLoading(true);
    setApiKeyError(null);
    try {
      const newKey = generateRandomKey();
      const hashedKey = await hashApiKey(newKey);
      await User.updateMyUserData({ api_key: null, api_key_hash: hashedKey });
      setApiKey(newKey);
      setHasStoredApiKey(true);
      setShowPlainApiKey(true);
      setUser((prev) => {
        if (!prev) return prev;
        const existingMeta = { ...(prev.raw_user_meta_data ?? prev.user_metadata ?? {}) };
        delete existingMeta.api_key;
        delete existingMeta.api_key_hash;
        const updatedMeta = {
          ...existingMeta,
          api_key_hash: hashedKey,
        };
        return {
          ...prev,
          raw_user_meta_data: updatedMeta,
          user_metadata: updatedMeta,
        };
      });
      setCopyStatus("idle");
      toast.success("API key generated");
      setApiKeyDialogOpen(false);
      setShowPlainApiKey(true);
    } catch (error) {
      const message = error?.message || "Failed to generate API key.";
      setApiKeyError(message);
      toast.error("Unable to generate API key", { description: message });
    } finally {
      setApiKeyLoading(false);
    }
  };

  const handleRevokeApiKey = async () => {
    if (!apiKey && !hasStoredApiKey) return;
    setApiKeyLoading(true);
    setApiKeyError(null);
    try {
      await User.updateMyUserData({ api_key: null, api_key_hash: null });
      setApiKey("");
      setHasStoredApiKey(false);
      setShowPlainApiKey(false);
      setUser((prev) => {
        if (!prev) return prev;
        const existingMeta = { ...(prev.raw_user_meta_data ?? prev.user_metadata ?? {}) };
        delete existingMeta.api_key;
        delete existingMeta.api_key_hash;
        return {
          ...prev,
          raw_user_meta_data: existingMeta,
          user_metadata: existingMeta,
        };
      });
      toast.success("API key revoked");
      setRevokeDialogOpen(false);
    } catch (error) {
      const message = error?.message || "Failed to revoke API key.";
      setApiKeyError(message);
      toast.error("Unable to revoke API key", { description: message });
    } finally {
      setApiKeyLoading(false);
    }
  };

  const handleCopyApiKey = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopyStatus("copied");
      toast.success("API key copied to clipboard");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch (error) {
      setCopyStatus("error");
      toast.error("Unable to copy API key", { description: error?.message });
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  };

  const handleCopyAnonKey = async () => {
    if (!SUPABASE_ANON_KEY) return;
    try {
      await navigator.clipboard.writeText(SUPABASE_ANON_KEY);
      setAnonCopyStatus("copied");
      toast.success("Anon key copied to clipboard");
      setTimeout(() => setAnonCopyStatus("idle"), 2000);
    } catch (error) {
      setAnonCopyStatus("error");
      toast.error("Unable to copy anon key", { description: error?.message });
      setTimeout(() => setAnonCopyStatus("idle"), 2000);
    }
  };

  useEffect(() => {
    const snapshot = user
      ? {
          user,
          subscription,
          apiKey,
          hasApiKeyHash: hasStoredApiKey,
          preferences: {
            marketingOptIn,
            weeklySummary,
            productUpdates,
          },
        }
      : null;
    cacheRef.current = snapshot;
    persistAccountCache(snapshot);
  }, [user, subscription, apiKey, hasStoredApiKey, marketingOptIn, weeklySummary, productUpdates]);

  const preferencesChanged =
    marketingOptIn !== initialPreferencesRef.current.marketingOptIn ||
    weeklySummary !== initialPreferencesRef.current.weeklySummary ||
    productUpdates !== initialPreferencesRef.current.productUpdates;

  useEffect(() => {
    return () => {
      if (saveBannerTimeout.current) {
        clearTimeout(saveBannerTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (preferencesChanged) {
      if (saveBannerTimeout.current) {
        clearTimeout(saveBannerTimeout.current);
        saveBannerTimeout.current = null;
      }
      setPreferencesSaved(false);
    }
  }, [preferencesChanged]);

  const handleSavePreferences = async () => {
    if (preferencesSaving) return;
    setPreferencesSaving(true);
    try {
      await User.updateMyUserData({
        marketing_opt_in: marketingOptIn,
        weekly_summary: weeklySummary,
        product_updates: productUpdates,
      });

      setUser((prev) => {
        if (!prev) return prev;
        const updatedMeta = {
          ...(prev.raw_user_meta_data ?? prev.user_metadata ?? {}),
          marketing_opt_in: marketingOptIn,
          weekly_summary: weeklySummary,
          product_updates: productUpdates,
        };
        return {
          ...prev,
          raw_user_meta_data: updatedMeta,
          user_metadata: updatedMeta,
        };
      });

      initialPreferencesRef.current = {
        marketingOptIn,
        weeklySummary,
        productUpdates,
      };
      if (saveBannerTimeout.current) {
        clearTimeout(saveBannerTimeout.current);
      }
      setPreferencesSaved(true);
      saveBannerTimeout.current = setTimeout(() => {
        setPreferencesSaved(false);
        saveBannerTimeout.current = null;
      }, 3000);
    } catch (error) {
      toast.error("Unable to save preferences", {
        description: error?.message || "Please try again.",
      });
    } finally {
      setPreferencesSaving(false);
    }
  };

  if (loading) {
    return <AccountPageSkeleton />;
  }

  if (!user) {
    return (
      <div className="min-h-screen py-16 bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl font-bold mb-4">My <span className="gradient-text">Account</span></h1>
          <p className="text-slate-400 mb-6">You’re not signed in. Sign in to manage your account and subscription.</p>
          <Link to={createPageUrl("GetStarted")}>
            <Button className="bg-blue-600 hover:bg-blue-700 rounded-md">
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 bg-slate-950">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-4 lg:px-6">
        <h1 className="text-3xl font-bold mb-8">
          My <span className="gradient-text">Account</span>
        </h1>
        <div className="grid gap-8 md:grid-cols-2">
          {/* Profile card */}
          <div className="bg-slate-900 border border-slate-800 rounded-md">
            <div className="p-6 border-b border-slate-800">
              <h3 className="flex items-center space-x-2 font-semibold">
                <UserIcon className="w-5 h-5 text-blue-400" />
                <span>Profile</span>
              </h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-slate-400">Name</Label>
                  <p className="font-semibold text-lg">{user.full_name || user.email}</p>
                </div>
                <div>
                  <Label className="text-sm text-slate-400">Email</Label>
                  <p className="font-semibold text-lg">{user.email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Subscription card */}
          <div className="bg-slate-900 border border-slate-800 rounded-md">
            <div className="p-6 border-b border-slate-800">
              <h3 className="flex items-center space-x-2 font-semibold">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Subscription</span>
              </h3>
            </div>
            <div className="p-6">
              {subscription ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-slate-400">Plan</Label>
                    <p className="font-semibold text-lg capitalize">{subscription.plan}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400">Status</Label>
                    <p className="font-semibold text-emerald-400 capitalize">{subscription.status}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400">Next Renewal</Label>
                    <p className="font-semibold">{new Date(subscription.current_period_end).toLocaleDateString()}</p>
                  </div>
                  <Button className="bg-blue-600 hover:bg-blue-700 mt-2 rounded-md" onClick={() => navigate(createPageUrl('Pricing'))}>
                    Manage Billing
                  </Button>
                </div>
              ) : (
                 <div className="text-center">
                    <p className="text-slate-400 mb-4">You don't have an active subscription.</p>
                    <Button onClick={() => navigate(createPageUrl('Pricing'))} className="rounded-md">View Plans</Button>
                 </div>
              )}
            </div>
          </div>

          {/* API Access with modal */}
          <div className="bg-slate-900 border border-slate-800 rounded-md md:col-span-2">
            <div className="p-6 border-b border-slate-800">
              <h3 className="flex items-center space-x-2 font-semibold">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <span>API Access</span>
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-400">
                API access is available on Pro and Desk plans. Use your key to download signals programmatically.
              </p>

              <div className="p-3 bg-slate-950 rounded-md flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-slate-700">
                <span className="font-mono text-slate-200 break-all">
                  {apiKey
                    ? showPlainApiKey
                      ? apiKey
                      : "••••••••••••••••••••••••••••••••"
                    : hasStoredApiKey
                      ? "••••••••••••••••••••••••••••••••"
                      : "No key generated"}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-md border-slate-700 bg-white text-slate-900 hover:bg-slate-100"
                    onClick={handleCopyApiKey}
                    disabled={!apiKey}
                  >
                    <Copy className="w-3 h-3 mr-2" />
                    {copyStatus === "copied" ? "Copied" : "Copy"}
                  </Button>
                  <Dialog open={apiKeyDialogOpen} onOpenChange={(open) => { setApiKeyDialogOpen(open); if (!open) { setApiKeyError(null); setApiKeyLoading(false); } }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md border-blue-500 text-blue-400 hover:bg-blue-500/10"
                        disabled={!canGenerateApiKey}
                        onClick={() => setApiKeyError(null)}
                      >
                        {apiKey || hasStoredApiKey ? "Regenerate Key" : "Generate New Key"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border border-slate-700 text-white">
                      <DialogHeader>
                        <DialogTitle>{apiKey ? "Regenerate API key" : "Generate API key"}</DialogTitle>
                        <DialogDescription className="text-slate-400">
                          Generating a new key revokes the previous one immediately. Store the new key securely—this is the only time it will be shown.
                        </DialogDescription>
                      </DialogHeader>
                      {!canGenerateApiKey ? (
                        <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                          Upgrade to a Pro plan to generate API credentials.
                        </div>
                      ) : null}
                      {apiKeyError ? (
                        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                          {apiKeyError}
                        </div>
                      ) : null}
                      <DialogFooter className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => setApiKeyDialogOpen(false)}
                          disabled={apiKeyLoading}
                          className="rounded-md"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleGenerateApiKey}
                          disabled={apiKeyLoading || !canGenerateApiKey}
                          className="bg-blue-600 hover:bg-blue-700 rounded-md"
                        >
                          {apiKeyLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {apiKey ? "Regenerate" : "Generate"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  {(apiKey || hasStoredApiKey) && (
                    <Dialog
                      open={revokeDialogOpen}
                      onOpenChange={(open) => {
                        setRevokeDialogOpen(open);
                        if (!open) {
                          setApiKeyError(null);
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-md border-red-500 text-red-400 hover:bg-red-500/10"
                          onClick={() => setApiKeyError(null)}
                          disabled={apiKeyLoading}
                        >
                          <ShieldOff className="w-3 h-3 mr-2" />
                          Revoke Key
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-900 border border-slate-700 text-white">
                        <DialogHeader>
                          <DialogTitle>Revoke API key</DialogTitle>
                          <DialogDescription className="text-slate-400">
                            This will permanently invalidate your current key. Any clients using it will stop working until a new key is generated.
                          </DialogDescription>
                        </DialogHeader>
                        {apiKeyError ? (
                          <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                            {apiKeyError}
                          </div>
                        ) : null}
                        <DialogFooter className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            onClick={() => setRevokeDialogOpen(false)}
                            disabled={apiKeyLoading}
                            className="rounded-md"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleRevokeApiKey}
                            disabled={apiKeyLoading}
                            className="bg-red-600 hover:bg-red-700 rounded-md"
                          >
                            {apiKeyLoading ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : null}
                            Revoke
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
              {!canGenerateApiKey ? (
                <p className="text-xs text-amber-300">
                  Upgrade to Pro or Desk to manage API credentials.
                </p>
              ) : null}

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Supabase anon key
                </Label>
                <div className="p-3 bg-slate-950 rounded-md flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-slate-700">
                  <span className="font-mono text-slate-200 break-all">
                    {SUPABASE_ANON_KEY || "Not configured"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-md border-slate-700 bg-white text-slate-900 hover:bg-slate-100"
                    onClick={handleCopyAnonKey}
                    disabled={!SUPABASE_ANON_KEY}
                  >
                    <Copy className="w-3 h-3 mr-2" />
                    {anonCopyStatus === "copied" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Include this in every request as <code className="font-mono text-slate-200">Authorization: Bearer {SUPABASE_ANON_KEY ? "YOUR_SUPABASE_ANON_KEY" : "..."}</code>.
                </p>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-slate-900 border border-slate-800 rounded-md md:col-span-2">
            <div className="p-6 border-b border-slate-800">
              <h3 className="font-semibold">Preferences</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="marketing" className="text-slate-200">Marketing emails</Label>
                  <p className="text-xs text-slate-400">Receive occasional updates, promotions, and news.</p>
                </div>
                <Switch
                  id="marketing"
                  checked={marketingOptIn}
                  onCheckedChange={(v) => {
                    setMarketingOptIn(v);
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="weekly" className="text-slate-200">Weekly summary</Label>
                  <p className="text-xs text-slate-400">Get a weekly digest of performance and signals.</p>
                </div>
                <Switch id="weekly" checked={weeklySummary} onCheckedChange={setWeeklySummary} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="product" className="text-slate-200">Product updates</Label>
                  <p className="text-xs text-slate-400">Be notified of new features and improvements.</p>
                </div>
                <Switch id="product" checked={productUpdates} onCheckedChange={setProductUpdates} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {preferencesChanged && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center pointer-events-none z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-full shadow-lg px-4 py-2 pointer-events-auto flex items-center gap-3">
            <span className="text-sm text-slate-200">You have unsaved changes</span>
            <Button
              onClick={handleSavePreferences}
              disabled={preferencesSaving}
              className="bg-blue-600 hover:bg-blue-700 rounded-md"
            >
              {preferencesSaving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
      {preferencesSaved && !preferencesChanged && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center pointer-events-none z-40">
          <div className="bg-emerald-500/90 text-white px-4 py-2 rounded-full shadow-lg pointer-events-none text-sm font-medium">
            Changes saved
          </div>
        </div>
      )}
    </div>
  );
}
