import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { User as UserIcon, KeyRound, Loader2, Copy } from "lucide-react";
import { User, Users } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import AccountPageSkeleton from "@/components/skeletons/AccountPageSkeleton";
import { toast } from "sonner";
import { StripeApi } from "@/api/stripe";

const ACCOUNT_CACHE_KEY = "account-page-cache";
const DEFAULT_ORIGIN_FALLBACK = "https://quantpulse.ai";

const toIsoOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const normalizeKeyValue = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

const PLAN_TIER_TO_SLUG = {
  free: "free",
  lite: "signals_lite",
  pro: "signals_pro",
  api: "signals_api",
};

const PLAN_SLUG_TO_TIER = {
  free: "free",
  signals_lite: "lite",
  signals_pro: "pro",
  signals_api: "api",
};

const normalizePlanKeyOptional = (value) => {
  const normalized = normalizeKeyValue(value);
  return normalized.length ? normalized : null;
};

const planSlugForTier = (tier) => PLAN_TIER_TO_SLUG[normalizeKeyValue(tier)] ?? "free";
const tierFromPlanSlug = (slug) => PLAN_SLUG_TO_TIER[normalizeKeyValue(slug)] ?? "free";
const normalizePlanKey = (value) => normalizePlanKeyOptional(value) ?? "free";
const normalizeBillingCycle = (value) => (normalizeKeyValue(value) === "annual" ? "annual" : "monthly");

// Presentation helpers
const PLAN_LABELS = {
  free: "Free",
  signals_lite: "Signals Lite",
  signals_pro: "Signals Pro",
  signals_api: "Signals API",
};

const TIER_LABELS = {
  free: "Free",
  lite: "Signals Lite",
  pro: "Signals Pro",
  api: "Signals API",
};

const formatPlanSlug = (slug) => PLAN_LABELS[normalizePlanKey(slug)] ?? slug;
const formatTier = (tier) => TIER_LABELS[normalizeKeyValue(tier)] ?? tier;
const formatCycle = (cycle) => (normalizeBillingCycle(cycle) === "annual" ? "Annual" : "Monthly");

const formatRenewalDate = (isoValue) => {
  if (!isoValue) return "N/A";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "N/A";
  const year = date.getUTCFullYear();
  if (year >= 9999) return "N/A";
  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
};

const DEFAULT_SUBSCRIPTION_SNAPSHOT = {
  planSlug: "free",
  billingCycle: "monthly",
  tier: "free",
  status: "trial",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  pendingChange: null,
  stripeSubscriptionId: null,
  stripeCustomerId: null,
  pendingScheduleId: null,
  scheduleId: null,
};

const buildSubscriptionSnapshot = (metadata) => {
  if (!metadata || typeof metadata !== "object") {
    return { ...DEFAULT_SUBSCRIPTION_SNAPSHOT };
  }

  const planSlug =
    normalizePlanKeyOptional(metadata.plan_slug ?? metadata.planSlug) ??
    planSlugForTier(metadata.subscription_tier ?? metadata.subscriptionTier ?? "free");
  const billingCycle = normalizeBillingCycle(metadata.billing_cycle ?? metadata.billingCycle ?? "monthly");
  const pendingPlanSlug = normalizePlanKeyOptional(
    metadata.subscription_pending_plan_slug ?? metadata.pending_plan_slug,
  );
  const pendingBillingCycle = metadata.subscription_pending_billing_cycle ?? metadata.pending_billing_cycle;
  const pendingEffective = metadata.subscription_pending_effective_date ?? metadata.pending_effective_date ?? null;

  const snapshot = {
    ...DEFAULT_SUBSCRIPTION_SNAPSHOT,
    planSlug,
    billingCycle,
    tier: tierFromPlanSlug(planSlug),
    status: metadata.subscription_status ?? metadata.subscriptionStatus ?? "trial",
    currentPeriodEnd: toIsoOrNull(metadata.current_period_end ?? metadata.currentPeriodEnd ?? null),
    cancelAtPeriodEnd: Boolean(metadata.subscription_cancel_at_period_end ?? metadata.cancel_at_period_end ?? false),
    pendingChange: pendingPlanSlug
      ? {
          planSlug: pendingPlanSlug,
          billingCycle: normalizeBillingCycle(pendingBillingCycle),
          effectiveDate: toIsoOrNull(pendingEffective),
        }
      : null,
    stripeSubscriptionId: metadata.stripe_subscription_id ?? metadata.stripeSubscriptionId ?? null,
    stripeCustomerId: metadata.stripe_customer_id ?? metadata.stripeCustomerId ?? null,
    pendingScheduleId: metadata.subscription_pending_schedule_id ?? metadata.pending_schedule_id ?? null,
    scheduleId: metadata.subscription_schedule_id ?? metadata.schedule_id ?? null,
  };

  return snapshot;
};

const upgradeLegacyCache = (legacy) => {
  if (!legacy || typeof legacy !== "object") return null;
  const user = legacy.user ?? null;
  const metadata = user ? (user.raw_user_meta_data ?? user.user_metadata ?? {}) : {};
  const rawPlanSlug = metadata.plan_slug ?? planSlugForTier(metadata.subscription_tier ?? "free");
  const normalizedPlanSlug = normalizePlanKey(rawPlanSlug);
  return {
    user,
    subscriptionSnapshot: {
      planSlug: normalizedPlanSlug,
      tier: tierFromPlanSlug(normalizedPlanSlug),
      billingCycle: metadata.billing_cycle ?? "monthly",
      status: metadata.subscription_status ?? "trial",
      currentPeriodEnd: toIsoOrNull(metadata.current_period_end ?? null),
      cancelAtPeriodEnd: Boolean(metadata.subscription_cancel_at_period_end ?? false),
      pendingChange: metadata.subscription_pending_plan_slug
        ? {
            planSlug: normalizePlanKey(metadata.subscription_pending_plan_slug),
            billingCycle: metadata.subscription_pending_billing_cycle ?? "monthly",
            effectiveDate: toIsoOrNull(metadata.subscription_pending_effective_date ?? null),
          }
        : null,
      stripeSubscriptionId: metadata.stripe_subscription_id ?? null,
      stripeCustomerId: metadata.stripe_customer_id ?? null,
      pendingScheduleId: metadata.subscription_pending_schedule_id ?? null,
      scheduleId: metadata.subscription_schedule_id ?? null,
    },
    apiKey: legacy.apiKey ?? "",
    hasApiKeyHash: Boolean(legacy.hasApiKeyHash ?? metadata.api_key_hash),
    preferences: legacy.preferences ?? {
      marketingOptIn: Boolean(metadata.marketing_opt_in ?? false),
      weeklySummary: Boolean(metadata.weekly_summary ?? false),
      productUpdates: Boolean(metadata.product_updates ?? false),
    },
  };
};

const loadAccountCache = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return upgradeLegacyCache(parsed);
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

export default function Account() {
  const cacheRef = useRef(loadAccountCache());
  const initialCache = cacheRef.current;

  const [user, setUser] = useState(initialCache?.user ?? null);
  const [loading, setLoading] = useState(!initialCache);
  const [marketingOptIn, setMarketingOptIn] = useState(initialCache?.preferences?.marketingOptIn ?? false);
  const [weeklySummary, setWeeklySummary] = useState(initialCache?.preferences?.weeklySummary ?? false);
  const [productUpdates, setProductUpdates] = useState(initialCache?.preferences?.productUpdates ?? false);
  const [apiKey, setApiKey] = useState(initialCache?.apiKey ?? "");
  const [hasStoredApiKey, setHasStoredApiKey] = useState(initialCache?.hasApiKeyHash ?? false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(null);
  const [copyStatus, setCopyStatus] = useState("idle");
  const [showPlainApiKey, setShowPlainApiKey] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const initialMetadata =
    initialCache?.user?.raw_user_meta_data ?? initialCache?.user?.user_metadata ?? null;
  const [subscription, setSubscription] = useState(() => {
    if (initialCache?.subscriptionSnapshot) {
      return initialCache.subscriptionSnapshot;
    }
    return buildSubscriptionSnapshot(initialMetadata);
  });
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);

  const saveBannerTimeout = useRef(null);

  const handleMetadataPatch = useCallback((patch) => {
    if (!patch) return;
    setUser((prev) => {
      if (!prev) return prev;
      const existingMeta = { ...(prev.raw_user_meta_data ?? prev.user_metadata ?? {}) };
      const nextMeta = { ...existingMeta, ...patch };
      setSubscription(buildSubscriptionSnapshot(nextMeta));
      return {
        ...prev,
        raw_user_meta_data: nextMeta,
        user_metadata: nextMeta,
      };
    });
  }, []);

  const initialPreferencesRef = useRef({
    marketingOptIn: initialCache?.preferences?.marketingOptIn ?? false,
    weeklySummary: initialCache?.preferences?.weeklySummary ?? false,
    productUpdates: initialCache?.preferences?.productUpdates ?? false,
  });

  const loadAccount = useCallback(
    async ({ silent = false } = {}) => {
      const shouldToggleLoading = !silent && !cacheRef.current;
      if (shouldToggleLoading) {
        setLoading(true);
      }
      try {
        const me = await User.me();
        if (!me) {
          setUser(null);
          setApiKey("");
          setHasStoredApiKey(false);
          initialPreferencesRef.current = {
            marketingOptIn: false,
            weeklySummary: false,
            productUpdates: false,
          };
          setMarketingOptIn(false);
          setWeeklySummary(false);
          setProductUpdates(false);
          cacheRef.current = null;
          persistAccountCache(null);
          if (shouldToggleLoading) setLoading(false);
          return;
        }

        setUser(me);
        const meta = me.raw_user_meta_data ?? me.user_metadata ?? {};
        setHasStoredApiKey(Boolean(meta.api_key_hash));
        const cachedApiKey = cacheRef.current?.apiKey ?? "";
        setApiKey(cachedApiKey || "");

        const prefs = {
          marketingOptIn: Boolean(meta.marketing_opt_in ?? false),
          weeklySummary: Boolean(meta.weekly_summary ?? false),
          productUpdates: Boolean(meta.product_updates ?? false),
        };
        initialPreferencesRef.current = prefs;
        setMarketingOptIn(prefs.marketingOptIn);
        setWeeklySummary(prefs.weeklySummary);
        setProductUpdates(prefs.productUpdates);

        let profile = null;
        try {
          const rows = await Users.filter({ user_id: me.id }, "-updated_at", 1);
          profile = rows?.[0] ?? null;
        } catch (profileError) {
          console.warn("Failed to load subscription profile", profileError);
        }

        const summarySource = profile
          ? {
              // Source exclusively from public.users when a profile row exists
              plan_slug: planSlugForTier(profile.subscription_tier ?? "free"),
              billing_cycle: profile.billing_cycle ?? null,
              status: profile.subscription_status ?? "trial",
              current_period_end: profile.current_period_end ? Date.parse(profile.current_period_end) : null,
              cancel_at_period_end: Boolean(profile.subscription_cancel_at_period_end ?? false),
              pending_plan_slug: profile.subscription_pending_plan_slug ?? null,
              pending_billing_cycle: profile.subscription_pending_billing_cycle ?? null,
              pending_effective_date: profile.subscription_pending_effective_date
                ? Date.parse(profile.subscription_pending_effective_date)
                : null,
              pending_schedule_id: profile.subscription_pending_schedule_id ?? null,
              schedule_id: null,
              id: profile.stripe_subscription_id ?? null,
            }
          : {
              plan_slug: meta.plan_slug ?? null,
              billing_cycle: meta.billing_cycle ?? null,
              status: meta.subscription_status ?? "trial",
              current_period_end: meta.current_period_end ? Date.parse(meta.current_period_end) : null,
              cancel_at_period_end: Boolean(meta.subscription_cancel_at_period_end ?? false),
              pending_plan_slug: meta.subscription_pending_plan_slug ?? null,
              pending_billing_cycle: meta.subscription_pending_billing_cycle ?? null,
              pending_effective_date: meta.subscription_pending_effective_date
                ? Date.parse(meta.subscription_pending_effective_date)
                : null,
              pending_schedule_id: meta.subscription_pending_schedule_id ?? null,
              schedule_id: null,
              id: meta.stripe_subscription_id ?? null,
            };

        setSubscription(buildSubscriptionSnapshot(summarySource));

        const metadataPatch = profile
          ? {
              ...meta,
              // Mirror public.users into local user metadata so UI remains consistent
              subscription_tier: profile.subscription_tier ?? meta.subscription_tier,
              subscription_status: profile.subscription_status ?? meta.subscription_status,
              billing_cycle: profile.billing_cycle ?? meta.billing_cycle,
              current_period_end: profile.current_period_end ?? meta.current_period_end,
              plan_started_at: profile.plan_started_at ?? meta.plan_started_at,
              stripe_customer_id: profile.stripe_customer_id ?? meta.stripe_customer_id,
              stripe_subscription_id: profile.stripe_subscription_id ?? meta.stripe_subscription_id,
              subscription_cancel_at_period_end:
                profile.subscription_cancel_at_period_end ?? meta.subscription_cancel_at_period_end ?? false,
              subscription_pending_plan_slug:
                profile.subscription_pending_plan_slug ?? meta.subscription_pending_plan_slug ?? null,
              subscription_pending_billing_cycle:
                profile.subscription_pending_billing_cycle ?? meta.subscription_pending_billing_cycle ?? null,
              subscription_pending_effective_date:
                profile.subscription_pending_effective_date ?? meta.subscription_pending_effective_date ?? null,
              subscription_pending_schedule_id:
                profile.subscription_pending_schedule_id ?? meta.subscription_pending_schedule_id ?? null,
            }
          : meta;

        handleMetadataPatch(metadataPatch);
      } catch (error) {
        console.error("Failed to load account details", error);
        setUser(null);
        setApiKey("");
        setHasStoredApiKey(false);
        initialPreferencesRef.current = {
          marketingOptIn: false,
          weeklySummary: false,
          productUpdates: false,
        };
        setMarketingOptIn(false);
        setWeeklySummary(false);
        setProductUpdates(false);
        cacheRef.current = null;
        persistAccountCache(null);
      } finally {
        if (shouldToggleLoading) {
          setLoading(false);
        }
      }
    },
    [handleMetadataPatch],
  );

  const pendingPlan = subscription?.pendingChange ?? null;

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const handleOpenBillingPortal = useCallback(async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : DEFAULT_ORIGIN_FALLBACK;
    const returnUrl = origin ? `${origin}/account?from=stripe_portal` : undefined;
    setBillingPortalLoading(true);
    try {
      const { url } = await StripeApi.createBillingPortalSession(
        returnUrl ? { return_url: returnUrl } : undefined,
      );
      if (url && typeof window !== "undefined") {
        window.location.assign(url);
        return;
      }
      toast.error("Unable to open Stripe portal", {
        description: "Stripe did not return a portal link.",
      });
    } catch (error) {
      const description = error?.message || error?.cause?.message || "Please try again.";
      toast.error("Unable to open Stripe portal", { description });
    } finally {
      setBillingPortalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("from");
    if (flag && flag.toLowerCase().startsWith("stripe")) {
      url.searchParams.delete("from");
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, document.title, next);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("from")) {
      url.searchParams.delete("from");
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, document.title, next);
    }
  }, []);

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

  useEffect(() => {
    const snapshot = user
      ? {
          user,
          subscriptionSnapshot: subscription,
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

  const handleGenerateApiKey = async () => {
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
          <h1 className="text-3xl font-bold mb-4">
            My <span className="gradient-text">Account</span>
          </h1>
          <p className="text-slate-400 mb-6">You’re not signed in. Sign in to manage your account and subscription.</p>
          <Link to={createPageUrl("GetStarted")}>
            <Button className="bg-emerald-500 hover:bg-emerald-400 rounded-md text-black">
              Go to sign in
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const subscriptionTier = subscription?.tier ?? "free";
  const subscriptionTierLabel = formatTier(subscriptionTier);
  const subscriptionStatus = subscription?.status ?? "trial";
  const billingCycleLabel = formatCycle(subscription?.billingCycle ?? "monthly");
  const currentPeriodEnd = subscription?.currentPeriodEnd ?? null;
  const subscriptionCancelAtPeriodEnd = Boolean(subscription?.cancelAtPeriodEnd);
  const pendingPlanLabel = pendingPlan?.planSlug ? formatPlanSlug(pendingPlan.planSlug) : null;
  const pendingCycleLabel = pendingPlan?.billingCycle ? formatCycle(pendingPlan.billingCycle) : null;
  const pendingEffectiveLabel = pendingPlan?.effectiveDate ? formatRenewalDate(pendingPlan.effectiveDate) : null;

  return (
    <div className="min-h-screen bg-slate-950 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="bg-slate-900 border border-slate-800 rounded-md">
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <UserIcon className="w-6 h-6 text-emerald-400" />
              My Account
            </h2>
            <p className="text-slate-400 mt-1">
              Subscription status, billing cycle, and upcoming changes at a glance.
            </p>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
              <div>
                <Label className="text-xs uppercase text-slate-500">Current tier</Label>
                <p className="font-semibold text-lg text-white">{subscriptionTierLabel}</p>
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500">Status</Label>
                <p className="font-semibold text-emerald-400 capitalize">{subscriptionStatus}</p>
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500">Billing cycle</Label>
                <p className="font-semibold text-lg text-white">{billingCycleLabel}</p>
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500">Next renewal</Label>
                <p className="font-semibold text-white">
                  {subscriptionCancelAtPeriodEnd ? "Cancels at period end" : formatRenewalDate(currentPeriodEnd)}
                </p>
                {subscriptionCancelAtPeriodEnd ? (
                  <p className="text-xs text-amber-300 mt-1">Cancellation is scheduled at period end.</p>
                ) : null}
              </div>
              <div>
                <Label className="text-xs uppercase text-slate-500">Stripe subscription</Label>
                <p className="font-mono text-slate-300 text-xs truncate">
                  {subscription?.stripeSubscriptionId ?? "Not active"}
                </p>
              </div>
            </div>

            {pendingPlanLabel ? (
              <div className="mt-2 border border-amber-400/50 bg-amber-500/10 rounded-md px-4 py-3 text-sm text-amber-100">
                Scheduled change to <span className="font-semibold">{pendingPlanLabel}</span>
                {pendingCycleLabel ? ` (${pendingCycleLabel})` : ""}
                {pendingEffectiveLabel ? ` on ${pendingEffectiveLabel}` : " at the next billing cycle"}.
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleOpenBillingPortal}
                disabled={billingPortalLoading}
                className="bg-indigo-600 hover:bg-indigo-500 rounded-md"
              >
                {billingPortalLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Opening portal…
                  </span>
                ) : (
                  "Manage billing"
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-md">
          <div className="p-6 border-b border-slate-800">
            <h3 className="flex items-center space-x-2 font-semibold text-white">
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
                <Dialog
                  open={apiKeyDialogOpen}
                  onOpenChange={(open) => {
                    setApiKeyDialogOpen(open);
                    if (!open) {
                      setApiKeyError(null);
                      setApiKeyLoading(false);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md border-blue-500 text-blue-400 hover:bg-blue-500/10"
                      onClick={() => setApiKeyError(null)}
                    >
                      {apiKey || hasStoredApiKey ? "Regenerate Key" : "Generate New Key"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-900 border border-slate-700 text-white">
                    <DialogHeader>
                      <DialogTitle>{apiKey ? "Regenerate API key" : "Generate API key"}</DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Generating a new key revokes the previous one immediately. Store the new key securely—this is the
                        only time it will be shown.
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
                        onClick={() => setApiKeyDialogOpen(false)}
                        disabled={apiKeyLoading}
                        className="rounded-md"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleGenerateApiKey}
                        disabled={apiKeyLoading}
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
                        variant="destructive"
                        size="sm"
                        className="rounded-md bg-red-600 hover:bg-red-500 text-white"
                      >
                        Revoke
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border border-slate-700 text-white">
                      <DialogHeader>
                        <DialogTitle>Revoke API key</DialogTitle>
                        <DialogDescription className="text-slate-400">
                          Revoking removes access immediately. You can generate a new key at any time.
                        </DialogDescription>
                      </DialogHeader>
                      {apiKeyError ? (
                        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                          {apiKeyError}
                        </div>
                      ) : null}
                      <DialogFooter className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setRevokeDialogOpen(false)}
                          disabled={apiKeyLoading}
                          className="rounded-md border-slate-700 text-black"
                        >
                          Keep key
                        </Button>
                        <Button
                          onClick={handleRevokeApiKey}
                          disabled={apiKeyLoading}
                          className="bg-red-600 hover:bg-red-500 rounded-md text-white"
                        >
                          {apiKeyLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Revoke key
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-md">
          <div className="p-6 border-b border-slate-800">
            <h3 className="font-semibold text-white">Preferences</h3>
            <p className="text-slate-400 text-sm mt-1">
              Control how we keep in touch and what updates you receive.
            </p>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="marketing" className="text-slate-200">
                  Marketing emails
                </Label>
                <p className="text-xs text-slate-400">Receive occasional updates, promotions, and news.</p>
              </div>
              <Switch id="marketing" checked={marketingOptIn} onCheckedChange={setMarketingOptIn} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="weekly" className="text-slate-200">
                  Weekly summary
                </Label>
                <p className="text-xs text-slate-400">Get a weekly digest of performance and signals.</p>
              </div>
              <Switch id="weekly" checked={weeklySummary} onCheckedChange={setWeeklySummary} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="product" className="text-slate-200">
                  Product updates
                </Label>
                <p className="text-xs text-slate-400">Be notified of new features and improvements.</p>
              </div>
              <Switch id="product" checked={productUpdates} onCheckedChange={setProductUpdates} />
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
