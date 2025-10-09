
import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { User as UserIcon, KeyRound, CreditCard, Loader2, Copy, ShieldOff, Check } from 'lucide-react';
import { User } from '@/api/entities';
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import AccountPageSkeleton from "@/components/skeletons/AccountPageSkeleton";
import { toast } from "sonner";
import { StripeApi } from "@/api/stripe";

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

const PLAN_CATALOG = [
  {
    slug: "free",
    tier: "free",
    name: "Free",
    description: "Explore public dashboards and saved preferences without billing.",
    monthlyPrice: 0,
  },
  {
    slug: "signals_lite",
    tier: "lite",
    name: "Signals Lite",
    description: "Top/bottom deciles for majors with a 24h delay.",
    monthlyPrice: 59,
  },
  {
    slug: "signals_pro",
    tier: "pro",
    name: "Signals Pro",
    description: "Full daily ranks, history exports, and OOS analytics.",
    monthlyPrice: 139,
  },
  {
    slug: "signals_api",
    tier: "api",
    name: "Signals API",
    description: "Programmatic ranks, PIT retrieval, and higher limits.",
    monthlyPrice: 449,
  },
];

const BILLING_CYCLE_OPTIONS = [
  { key: "monthly", label: "Monthly" },
  { key: "annual", label: "Annual (save 15%)" },
];

const tierToPlanSlug = {
  free: "free",
  lite: "signals_lite",
  pro: "signals_pro",
  api: "signals_api",
};

const planSlugToTier = {
  free: "free",
  signals_lite: "lite",
  signals_pro: "pro",
  signals_api: "api",
};

const normalizeKey = (value) => String(value ?? "").toLowerCase();
const planSlugForTier = (tier) => tierToPlanSlug[normalizeKey(tier)] ?? "free";
const tierFromPlanSlug = (slug) => planSlugToTier[normalizeKey(slug)] ?? slug;

const formatRenewalDate = (isoValue) => {
  if (!isoValue) return "N/A";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "N/A";
  const year = date.getUTCFullYear();
  if (year >= 9999) return "N/A";
  return date.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" });
};

const isPaidPlanSlug = (slug) => slug && normalizeKey(slug) !== "free";

const formatUSD = (value) => {
  if (value === null || value === undefined) return "Custom";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch (error) {
    console.warn("Failed to format currency", error);
    return `$${value}`;
  }
};

const deriveAnnualPrice = (monthlyPrice) => {
  if (!monthlyPrice) return null;
  return Math.round(monthlyPrice * 12 * 0.85);
};

const getPlanPrice = (plan, billingCycle) => {
  if (!plan) return null;
  if (billingCycle === "annual") {
    return deriveAnnualPrice(plan.monthlyPrice);
  }
  return plan.monthlyPrice;
};

export default function Account() {
  const cacheRef = useRef(loadAccountCache());
  const [user, setUser] = useState(cacheRef.current?.user ?? null);
  const [subscription, setSubscription] = useState(cacheRef.current?.subscription ?? null);
  const [loading, setLoading] = useState(!cacheRef.current);

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
  const [showPlainApiKey, setShowPlainApiKey] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState(cacheRef.current?.subscriptionTier ?? "free");
  const [subscriptionStatus, setSubscriptionStatus] = useState(cacheRef.current?.subscriptionStatus ?? "trial");
  const [billingCycleLabel, setBillingCycleLabel] = useState(cacheRef.current?.billingCycle ?? "monthly");
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(cacheRef.current?.currentPeriodEnd ?? null);
  const [subscriptionCancelAtPeriodEnd, setSubscriptionCancelAtPeriodEnd] = useState(
    cacheRef.current?.subscriptionCancelAtPeriodEnd ?? false,
  );
  const [planChangeLoading, setPlanChangeLoading] = useState(false);
  const [planChangeError, setPlanChangeError] = useState(null);
  const [planChangeSuccess, setPlanChangeSuccess] = useState(null);
  const [planSelectionCycle, setPlanSelectionCycle] = useState(() => normalizeKey(cacheRef.current?.billingCycle ?? "monthly"));
  const [planSelectionSlug, setPlanSelectionSlug] = useState(() => cacheRef.current?.planSlug ?? planSlugForTier(cacheRef.current?.subscriptionTier ?? "free"));
  const [cancelLoading, setCancelLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState(null);
  const [planHighlight, setPlanHighlight] = useState(false);
  const saveBannerTimeout = useRef(null);
  const planManagerRef = useRef(null);
  const metadataSnapshot = useMemo(() => {
    if (!user) return {};
    return user.raw_user_meta_data ?? user.user_metadata ?? {};
  }, [user]);

  const applySubscriptionSnapshot = (snapshot) => {
    if (!snapshot) return;
    if (snapshot.plan_slug) {
      const normalized = normalizeKey(snapshot.plan_slug);
      setPlanSelectionSlug(normalized);
      setSubscriptionTier(tierFromPlanSlug(normalized));
    }
    if (snapshot.billing_cycle) {
      const normalizedCycle = normalizeKey(snapshot.billing_cycle);
      setBillingCycleLabel(normalizedCycle);
      setPlanSelectionCycle(normalizedCycle);
    }
    if (snapshot.status) {
      setSubscriptionStatus(snapshot.status);
    }
    if (typeof snapshot.cancel_at_period_end === "boolean") {
      setSubscriptionCancelAtPeriodEnd(snapshot.cancel_at_period_end);
    }
    if (snapshot.current_period_end) {
      const iso = typeof snapshot.current_period_end === "number"
        ? new Date(snapshot.current_period_end).toISOString()
        : (() => {
            const parsed = Date.parse(snapshot.current_period_end);
            return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
          })();
      if (iso) {
        setCurrentPeriodEnd(iso);
      }
    }
  };

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
        const resolvedTier = String(meta?.subscription_tier ?? me?.subscription_level ?? "free");
        const resolvedCycle = String(meta?.billing_cycle ?? "monthly").toLowerCase();
        const resolvedPlanSlug = String(meta?.plan_slug ?? planSlugForTier(resolvedTier)).toLowerCase();
        setSubscriptionTier(resolvedTier);
        setSubscriptionStatus(String(meta?.subscription_status ?? "trial"));
        setBillingCycleLabel(resolvedCycle);
        setCurrentPeriodEnd(meta?.current_period_end ?? null);
        setSubscriptionCancelAtPeriodEnd(Boolean(meta?.subscription_cancel_at_period_end ?? false));
        setPlanSelectionCycle(resolvedCycle);
        setPlanSelectionSlug(resolvedPlanSlug);
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
      } catch (error) {
        console.error("Failed to load account details", error);
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
        setSubscriptionTier("free");
        setSubscriptionStatus("trial");
        setBillingCycleLabel("monthly");
        setCurrentPeriodEnd(null);
      }
      setLoading(false);
    };
    checkUser();
  }, []);

  useEffect(() => {
    setPlanSelectionSlug(planSlugForTier(subscriptionTier));
  }, [subscriptionTier]);

  useEffect(() => {
    setPlanSelectionCycle(String(billingCycleLabel ?? "monthly").toLowerCase());
  }, [billingCycleLabel]);

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


  const applySubscriptionResponse = (subscriptionPayload, message) => {
    if (subscriptionPayload) {
      applySubscriptionSnapshot(subscriptionPayload);
      setUser((prev) => {
        if (!prev) return prev;
        const existingMeta = { ...(prev.raw_user_meta_data ?? prev.user_metadata ?? {}) };
        const nextMeta = {
          ...existingMeta,
          subscription_tier: tierFromPlanSlug(subscriptionPayload.plan_slug ?? existingMeta.subscription_tier),
          billing_cycle: subscriptionPayload.billing_cycle ?? existingMeta.billing_cycle,
          subscription_status: subscriptionPayload.status ?? existingMeta.subscription_status,
          current_period_end: subscriptionPayload.current_period_end
            ? new Date(subscriptionPayload.current_period_end).toISOString()
            : existingMeta.current_period_end,
          subscription_cancel_at_period_end: subscriptionPayload.cancel_at_period_end ?? existingMeta.subscription_cancel_at_period_end,
          plan_slug: subscriptionPayload.plan_slug ?? existingMeta.plan_slug,
        };
        return {
          ...prev,
          raw_user_meta_data: nextMeta,
          user_metadata: nextMeta,
        };
      });
    }
    setPlanChangeError(null);
    if (message) {
      setPlanChangeSuccess(message);
      setTimeout(() => setPlanChangeSuccess(null), 3500);
    }
  };

  const handlePlanChange = async () => {
    if (!planSelectionSlug) {
      setPlanChangeError("Select a plan to continue.");
      return;
    }
    const normalizedSelection = normalizeKey(planSelectionSlug);
    const selectionIsPaid = isPaidPlanSlug(normalizedSelection);
    const sameSelection = normalizedSelection === currentPlanSlug && planSelectionCycle === normalizedCurrentCycle;

    if (!selectionIsPaid && !hasActiveSubscription) {
      setPlanChangeError("You're already on the Free tier.");
      return;
    }
    if (sameSelection) {
      setPlanChangeError("You're already on this plan.");
      return;
    }

    if (!hasActiveSubscription && selectionIsPaid) {
      setPlanChangeLoading(true);
      try {
        const origin = typeof window !== "undefined" ? window.location.origin : "https://quantpulse.ai";
        const successUrl = `${origin}${createPageUrl("Account")}?status=success`;
        const cancelUrl = `${origin}${createPageUrl("Account")}?status=cancel`;
        const { url } = await StripeApi.createCheckoutSession({
          plan_slug: normalizedSelection,
          billing_cycle: planSelectionCycle,
          success_url: successUrl,
          cancel_url: cancelUrl,
        });
        if (typeof window !== "undefined" && url) {
          window.location.href = url;
        }
      } catch (error) {
        const message = error?.message || error?.cause?.message || "Unable to start checkout.";
        setPlanChangeError(message);
        toast.error("Checkout unavailable", { description: message });
      } finally {
        setPlanChangeLoading(false);
      }
      return;
    }

    if (hasActiveSubscription && !selectionIsPaid) {
      setPlanChangeLoading(true);
      try {
        const result = await StripeApi.cancelSubscription({ cancel_now: false });
        applySubscriptionResponse(result?.subscription, "Subscription will cancel at period end.");
        toast.success("Cancellation scheduled");
      } catch (error) {
        const message = error?.message || error?.cause?.message || "Unable to schedule cancellation.";
        setPlanChangeError(message);
        toast.error("Cancel failed", { description: message });
      } finally {
        setPlanChangeLoading(false);
      }
      return;
    }

    setPlanChangeLoading(true);
    try {
      const result = await StripeApi.changeSubscriptionPlan({
        plan_slug: normalizedSelection,
        billing_cycle: planSelectionCycle,
      });
      applySubscriptionResponse(result?.subscription, "Subscription updated.");
      toast.success("Subscription updated");
    } catch (error) {
      const message = error?.message || error?.cause?.message || "Unable to update subscription.";
      setPlanChangeError(message);
      toast.error("Plan update failed", { description: message });
    } finally {
      setPlanChangeLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!hasActiveSubscription) {
      toast.error("No active subscription to cancel.");
      return;
    }
    setCancelLoading(true);
    try {
      const result = await StripeApi.cancelSubscription({ cancel_now: false });
      applySubscriptionResponse(result?.subscription, "Subscription will cancel at period end.");
      toast.success("Cancellation scheduled");
    } catch (error) {
      const message = error?.message || error?.cause?.message || "Unable to cancel subscription.";
      toast.error("Cancel failed", { description: message });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleResumeSubscription = async () => {
    if (!hasActiveSubscription) {
      toast.error("No active subscription to resume.");
      return;
    }
    setResumeLoading(true);
    try {
      const result = await StripeApi.resumeSubscription();
      applySubscriptionResponse(result?.subscription, "Subscription resumed.");
      toast.success("Subscription resumed");
    } catch (error) {
      const message = error?.message || error?.cause?.message || "Unable to resume subscription.";
      toast.error("Resume failed", { description: message });
    } finally {
      setResumeLoading(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    if (!hasActiveSubscription) {
      toast.error("Billing portal unavailable", { description: "Upgrade to a paid plan to manage billing in Stripe." });
      return;
    }
    setPortalError(null);
    setPortalLoading(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "https://quantpulse.ai";
      const { url } = await StripeApi.createBillingPortalSession({
        return_url: `${origin}${createPageUrl("Account")}`,
      });
      if (typeof window !== "undefined" && url) {
        window.location.href = url;
      }
    } catch (error) {
      const message = error?.message || error?.cause?.message || "Unable to open billing portal.";
      setPortalError(message);
      toast.error("Billing portal unavailable", { description: message });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleManageBillingClick = () => {
    setPlanChangeError(null);
    setPlanChangeSuccess(null);
    planManagerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPlanHighlight(true);
    window.setTimeout(() => setPlanHighlight(false), 1800);
  };

  const currentPlanSlug = planSlugForTier(subscriptionTier);
  const isFreeTier = normalizeKey(subscriptionTier) === "free";
  const nextRenewalLabel = isFreeTier ? "N/A" : formatRenewalDate(currentPeriodEnd);
  const normalizedCurrentCycle = normalizeKey(billingCycleLabel);
  const activeSubscriptionId =
    metadataSnapshot?.stripe_subscription_id ?? subscription?.stripe_subscription_id ?? null;
  const hasActiveSubscription = Boolean(activeSubscriptionId);
  const selectionIsPaidPlan = isPaidPlanSlug(planSelectionSlug);
  const samePlanSelected = planSelectionSlug === currentPlanSlug && planSelectionCycle === normalizedCurrentCycle;
  const planChangeButtonLabel =
    !hasActiveSubscription && selectionIsPaidPlan ? "Start paid plan" : selectionIsPaidPlan ? "Update subscription" : "Schedule cancellation";
  const planChangeDisabled =
    planChangeLoading ||
    samePlanSelected ||
    (!hasActiveSubscription && !selectionIsPaidPlan);
  const cancelActionsDisabled = cancelLoading || !hasActiveSubscription || subscriptionCancelAtPeriodEnd;
  const resumeActionsDisabled = resumeLoading || !hasActiveSubscription || !subscriptionCancelAtPeriodEnd;
  const portalDisabled = !hasActiveSubscription || portalLoading;



  useEffect(() => {
    const snapshot = user
      ? {
          user,
          subscription,
          apiKey,
          hasApiKeyHash: hasStoredApiKey,
          subscriptionTier,
          subscriptionStatus,
          billingCycle: billingCycleLabel,
          currentPeriodEnd,
          subscriptionCancelAtPeriodEnd,
          planSlug: planSelectionSlug,
          preferences: {
            marketingOptIn,
            weeklySummary,
            productUpdates,
          },
        }
      : null;
    cacheRef.current = snapshot;
    persistAccountCache(snapshot);
  }, [
    user,
    subscription,
    apiKey,
    hasStoredApiKey,
    subscriptionTier,
    subscriptionStatus,
    billingCycleLabel,
    currentPeriodEnd,
    subscriptionCancelAtPeriodEnd,
    planSelectionSlug,
    marketingOptIn,
    weeklySummary,
    productUpdates,
  ]);

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
    setPlanChangeError(null);
    setPlanChangeSuccess(null);
  }, [planSelectionSlug, planSelectionCycle]);

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
            <div className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-sm text-slate-400">Plan</Label>
                  <p className="font-semibold text-lg capitalize">{subscriptionTier || "free"}</p>
                </div>
                <div>
                  <Label className="text-sm text-slate-400">Status</Label>
                  <p className="font-semibold text-emerald-400 capitalize">{subscriptionStatus || "trial"}</p>
                </div>
                <div>
                  <Label className="text-sm text-slate-400">Billing cycle</Label>
                  <p className="font-semibold text-lg capitalize">{billingCycleLabel || "monthly"}</p>
                </div>
                <div>
                  <Label className="text-sm text-slate-400">Next renewal</Label>
                  <p className="font-semibold">{nextRenewalLabel}</p>
                </div>
              </div>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 rounded-md"
                onClick={handleManageBillingClick}
              >
                Manage billing
              </Button>
              <p className="text-xs text-slate-500">
                Manage your subscription below without leaving the app. Changes sync with Stripe automatically.
              </p>
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

          </div>
        </div>

        {/* Subscription controls */}
        <div
          ref={planManagerRef}
          className={cn(
            "bg-slate-900 border border-slate-800 rounded-md md:col-span-2",
            planHighlight && "ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-950",
          )}
        >
          <div className="p-6 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="flex items-center space-x-2 font-semibold">
                <CreditCard className="w-5 h-5 text-indigo-400" />
                <span>Manage subscription</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">Update plans or schedule cancellations without leaving the app.</p>
            </div>
            <div className="flex gap-2">
              {BILLING_CYCLE_OPTIONS.map((option) => {
                const active = planSelectionCycle === option.key;
                return (
                  <Button
                    key={option.key}
                    variant={active ? "default" : "outline"}
                    className={cn(
                      "rounded-md text-xs",
                      active ? "bg-indigo-600 hover:bg-indigo-500" : "border-slate-700 text-slate-300",
                    )}
                    onClick={() => setPlanSelectionCycle(option.key)}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="p-6 space-y-5">
            <RadioGroup value={planSelectionSlug} onValueChange={setPlanSelectionSlug} className="grid gap-3 md:grid-cols-4">
              {PLAN_CATALOG.map((plan) => {
                const isSelected = planSelectionSlug === plan.slug;
                const isCurrent =
                  currentPlanSlug === plan.slug && (plan.slug === "free" || normalizedCurrentCycle === planSelectionCycle);
                const price = getPlanPrice(plan, planSelectionCycle);
                const inputId = `plan-${plan.slug}-${planSelectionCycle}`;
                const priceLabel =
                  price === null ? "Contact sales" : price === 0 ? "Free" : `${formatUSD(price)} / ${planSelectionCycle === "annual" ? "year" : "month"}`;
                return (
                  <div key={plan.slug}>
                    <RadioGroupItem value={plan.slug} id={inputId} className="peer sr-only" />
                    <label
                      htmlFor={inputId}
                      className={cn(
                        "block rounded-md border px-4 py-3 text-left transition-all cursor-pointer bg-slate-950",
                        isSelected
                          ? "border-indigo-500 shadow-[0_0_0_1px_rgba(99,102,241,0.4)]"
                          : "border-slate-800 hover:border-slate-700",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{plan.name}</p>
                          <p className="text-xs text-slate-400">{plan.description}</p>
                        </div>
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
                            isSelected ? "border-indigo-400 bg-indigo-500/20" : "border-slate-600",
                          )}
                        >
                          {isSelected ? <Check className="h-3 w-3 text-indigo-300" /> : null}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-100">{priceLabel}</span>
                        {isCurrent ? (
                          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Current</span>
                        ) : null}
                      </div>
                    </label>
                  </div>
                );
              })}
            </RadioGroup>
            {planChangeError ? (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                {planChangeError}
              </div>
            ) : null}
            {planChangeSuccess ? (
              <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
                {planChangeSuccess}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handlePlanChange}
                disabled={planChangeDisabled}
                className="bg-indigo-600 hover:bg-indigo-500 rounded-md"
              >
                {planChangeLoading ? "Working…" : planChangeButtonLabel}
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenBillingPortal}
                disabled={portalDisabled}
                className="rounded-md border-slate-700 text-slate-200"
              >
                {portalLoading ? "Opening…" : "Open Stripe portal"}
              </Button>
            </div>
            {portalError ? (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                {portalError}
              </div>
            ) : null}
            {!hasActiveSubscription ? (
              <div className="text-xs text-slate-500">
                You’re on the Free tier. Select a paid plan and click “Start paid plan” to launch Stripe checkout.
              </div>
            ) : null}
            <div className="border-t border-slate-800 pt-4 space-y-3">
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="rounded-md border-slate-700 text-slate-200"
                  onClick={handleCancelSubscription}
                  disabled={cancelActionsDisabled || subscriptionStatus === "canceled" || subscriptionCancelAtPeriodEnd}
                >
                  {cancelLoading ? "Working…" : "Cancel subscription"}
                </Button>
                {subscriptionCancelAtPeriodEnd && (
                  <Button
                    variant="outline"
                    className="rounded-md border-slate-700 text-slate-200"
                    onClick={handleResumeSubscription}
                    disabled={resumeActionsDisabled}
                  >
                    {resumeLoading ? "Resuming…" : "Resume subscription"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Plan updates apply instantly for active subscriptions. Cancelling keeps access until your billing period ends, then returns you to Free.
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
