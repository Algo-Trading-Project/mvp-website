
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Check, X as XIcon, Crown, Zap, Building, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { StripeApi } from "@/api/stripe";
import { User } from "@/api/entities";
import { planSeatAvailability } from "@/api/functions";
// Removed tabs picker (signals only)
import { toast } from "sonner";

const AUTH_CACHE_KEY = "pricing-authed";

const loadAuthCache = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(AUTH_CACHE_KEY);
    if (raw === null) return null;
    return raw === "true";
  } catch (error) {
    console.warn("Failed to read pricing auth cache", error);
    return null;
  }
};

const persistAuthCache = (value) => {
  if (typeof window === "undefined") return;
  try {
    if (value === null) {
      window.sessionStorage?.removeItem(AUTH_CACHE_KEY);
    } else {
      window.sessionStorage?.setItem(AUTH_CACHE_KEY, value ? "true" : "false");
    }
  } catch (error) {
    console.warn("Failed to persist pricing auth cache", error);
  }
};

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState("monthly");
  const authCacheRef = useRef(loadAuthCache());
  const [isAuthed, setIsAuthed] = useState(authCacheRef.current ?? false);
  const [myTier, setMyTier] = useState(null);
  const [myStatus, setMyStatus] = useState(null);
  const [authChecked, setAuthChecked] = useState(!!authCacheRef.current);
  const [seats, setSeats] = useState({ pro_dev: null, api: null });
  const [seatsLoading, setSeatsLoading] = useState(true);

  // Always land at top when visiting Pricing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }
      catch { window.scrollTo(0, 0); }
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const me = await User.me();
        setIsAuthed(true);
        authCacheRef.current = true;
        persistAuthCache(true);
        const meta = (me && (me.user_metadata || me.raw_user_meta_data)) || {};
        const tier = String(meta.subscription_tier ?? meta.subscription_level ?? meta.plan_tier ?? '').toLowerCase();
        const status = String(meta.subscription_status ?? '').toLowerCase();
        setMyTier(tier || null);
        setMyStatus(status || null);
      } catch {
        setIsAuthed(false);
        authCacheRef.current = false;
        persistAuthCache(false);
        setMyTier(null);
        setMyStatus(null);
      }
      setAuthChecked(true);
    };
    if (!authChecked) {
      checkAuth();
    }
  }, [authChecked]);

  useEffect(() => {
    const loadSeats = async () => {
      try {
        setSeatsLoading(true);
        // Disable client-side cache so seats reflect latest subscriptions
        const info = await planSeatAvailability({ __cache: false });
        setSeats({ pro_dev: info?.pro_dev || null, api: info?.api || null });
      } catch {
        setSeats({ pro_dev: null, api: null });
      } finally {
        setSeatsLoading(false);
      }
    };
    loadSeats();
  }, []);

  // Plans grouped by tabs
  const signalsRaw = [
    {
      name: "Lite",
      icon: Zap,
      monthlyPrice: 59,
      description: "Prediction for 60 tokens. Manual downloads.",
      slug: "signals_lite",
      features: [
        "Predictions for top 60 tokens by 90-day ADV (CSV)",
        "Manual downloads: last 90 days",
        "No REST API access",
      ],
      cta: "Upgrade Now",
    },
    {
      name: "Pro",
      icon: Shield,
      monthlyPrice: 139,
      description: "Full‑universe predictions with 365‑day manual downloads. Email/Discord/Telegram alerting.",
      slug: "signals_pro",
      features: [
        "Predictions for the entire universe (~390 tokens)",
        "Manual downloads: last 365 days",
        "Email/Discord/Telegram alerts",
        "No REST API access",
      ],
      cta: "Upgrade Now",
      popular: true
    },
    {
      name: "Pro Developer",
      icon: Building,
      monthlyPrice: 229,
      description: "Lightweight API for live automation. 1‑year history.",
      slug: "signals_pro_dev",
      features: [
        "Predictions for the entire universe (~390 tokens)",
        "Manual downloads: last 365 days",
        "Email/Discord/Telegram alerts",
        { label: "REST API", bullets: ["/latest", "/universe", "/predictions (365‑day lookback)", "/ohlcv (365‑day lookback)"] },
      ],
      cta: "Upgrade Now",
    },
    {
      name: "API",
      icon: Crown,
      monthlyPrice: 449,
      description: "Full API for research / backtesting / production.",
      slug: "signals_api",
      features: [
        "Predictions for the entire universe (~390 tokens)",
        "Manual downloads: full history",
        "Email/Discord/Telegram alerts",
        { label: "REST API", bullets: ["/latest", "/universe", "/predictions (full history)", "/ohlcv (full history)"] },
        "Webhooks for near real‑time access to predictions and OHLCV data as it arrives",
      ],
      cta: "Upgrade Now"
    },
  ];

  // Market data and bundle plans removed (Signals only)

  // Compute annual prices with 15% discount
  const addAnnual = (plans) =>
    plans.map(p => {
      const annual = p.monthlyPrice ? Math.round(p.monthlyPrice * 12 * 0.85) : null;
      return { ...p, price: p.monthlyPrice ? { monthly: p.monthlyPrice, annual } : null };
    });

  const signalsPlans = addAnnual(signalsRaw);

  const getPrice = (plan) => (plan.price ? plan.price[billingCycle] : null);
  const getSavings = (plan) =>
    billingCycle === "annual" && plan.price ? plan.price.monthly * 12 - plan.price.annual : 0;

  const [checkoutLoading, setCheckoutLoading] = useState(null);

  const startCheckout = async (plan) => {
    if (!plan?.slug) {
      toast.error("This plan is not available for self-serve checkout yet.");
      return;
    }

    const cycle = billingCycle === "annual" ? "annual" : "monthly";
    const key = `${plan.slug}:${cycle}`;
    setCheckoutLoading(key);

    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "https://quantpulse.ai";
      const successUrl = `${origin}${createPageUrl("Pricing")}?status=success`;
      const cancelUrl = `${origin}${createPageUrl("Pricing")}?status=cancel`;

      // If the user already has an active subscription, route to billing portal
      const activeStatuses = new Set(["active", "trialing", "past_due"]);
      if (isAuthed && myStatus && activeStatuses.has(myStatus)) {
        const payload = { return_url: `${origin}${createPageUrl("Account")}` };
        const { url } = await StripeApi.createBillingPortalSession(payload);
        setCheckoutLoading(null);
        if (url && typeof window !== "undefined") {
          window.location.assign(url);
          return;
        }
        toast.error("Unable to open billing portal", { description: "Stripe did not return a portal link." });
        return;
      }

      const { url } = await StripeApi.createCheckoutSession({
        plan_slug: plan.slug,
        billing_cycle: cycle,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      setCheckoutLoading(null);

      if (url && typeof window !== "undefined") {
        window.location.assign(url);
        return;
      }

      toast.error("Checkout unavailable", {
        description: "Stripe did not return a checkout link.",
      });
    } catch (error) {
      const description = error?.message || error?.cause?.message || "Please try again or contact support.";
      toast.error("Unable to start checkout", { description });
      setCheckoutLoading(null);
    }
  };

  // Card renderer (shared)
  // Change grid columns dynamically so bundles (3 items) are centered
  const PlanGrid = ({ plans }) => {
    const lgCols = plans.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 ${lgCols} gap-6 place-items-stretch`}>
        {plans.map((plan, index) => (
          <div
            key={index}
            className={`relative bg-slate-900 rounded-md p-6 transform hover:scale-105 transition-transform duration-300 flex flex-col text-center
              ${plan.popular ? "border-2 border-indigo-500 scale-105" : "border border-slate-800"}`}
          >
            {/* Seats badge for Pro Developer and API (uniform style + skeleton) */}
            {(plan.slug === 'signals_pro_dev' || plan.slug === 'signals_api') && (
              seatsLoading ? (
                <div className="absolute top-2 right-2 px-2 py-1 rounded-md text-xs bg-slate-800 border border-slate-700">
                  <span className="inline-block h-3 w-20 bg-slate-700 rounded animate-pulse" />
                </div>
              ) : (
                (() => {
                  const data = plan.slug === 'signals_pro_dev' ? seats.pro_dev : seats.api;
                  if (!data) return null;
                  const left = Math.max(0, Number(data.left ?? 0));
                  return (
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700">
                      {left} seats left
                    </div>
                  );
                })()
              )
            )}
            {plan.popular && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-indigo-500 text-white text-xs font-semibold rounded-md shadow-lg">
                Most Popular
              </div>
            )}
            <div className="flex-grow">
              <div className="flex items-center justify-center mb-4 text-indigo-400">
                <plan.icon size={40} strokeWidth={1.5} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {plan.name}
              </h2>
              <p className="text-white mb-6 text-sm px-2">{plan.description}</p>
              <div className="text-center mb-6 flex flex-col items-center justify-center min-h-[72px]">
                {plan.price ? (
                  <>
                    <span className="text-3xl font-extrabold text-white">
                      ${getPrice(plan)}
                    </span>
                    <span className="text-lg text-white">
                      /{billingCycle === "monthly" ? "month" : "year"}
                    </span>
                    {billingCycle === "annual" && getSavings(plan) > 0 && (
                      <p className="text-green-400 mt-1 text-xs">Save ${getSavings(plan)} annually</p>
                    )}
                  </>
                ) : (
                  <div>
                    <span className="text-2xl font-extrabold text-white">
                      {plan.customNote || "Custom"}
                    </span>
                    <div className="text-white text-sm mt-1">Contact us</div>
                  </div>
                )}
              </div>
              <ul className="space-y-3 mb-8 text-left mx-auto max-w-[90%]">
                {plan.features.map((feature, idx) => {
                  const isObject = feature && typeof feature === 'object' && !Array.isArray(feature);
                  if (isObject) {
                    return (
                      <li key={idx} className="text-white text-sm">
                        <div className="flex items-start">
                          <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                          <span className="font-medium">{feature.label}</span>
                        </div>
                        {Array.isArray(feature.bullets) && feature.bullets.length > 0 && (
                          <ul className="list-disc pl-6 mt-1 space-y-1 text-slate-300 text-xs">
                            {feature.bullets.map((b, i) => (
                              <li key={i} className="leading-snug">{b}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  }
                  const text = String(feature);
                  const isNoApi = text.toLowerCase().startsWith('no rest api access');
                  const Icon = isNoApi ? XIcon : Check;
                  const iconColor = isNoApi ? 'text-red-500' : 'text-green-500';
                  return (
                    <li key={idx} className="flex items-start text-white text-sm">
                      <Icon className={`h-4 w-4 ${iconColor} mr-2 flex-shrink-0 mt-0.5`} />
                      <span>{text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="mt-auto">
              {(plan.slug === 'signals_pro_dev' || plan.slug === 'signals_api') && (
                <div className="text-slate-300 text-xs mb-4">
                  API access is limited to mitigate crowding and protect signal quality.
                </div>
              )}
              {plan.contact ? (
                <Link to={createPageUrl("Contact")} className="block">
                  <Button className="w-full py-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md">
                    {plan.cta}
                  </Button>
                </Link>
              ) : plan.slug && isAuthed ? (
                <Button
                  className="w-full py-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
                  onClick={() => startCheckout(plan)}
                  disabled={checkoutLoading === `${plan.slug}:${billingCycle}`}
                >
                  {checkoutLoading === `${plan.slug}:${billingCycle}` ? "Redirecting…" : plan.cta || "Subscribe"}
                </Button>
              ) : (
                <Link to={createPageUrl("GetStarted")} className="block">
                  <Button className="w-full py-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md">
                    {plan.cta}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen py-16 bg-slate-950">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
        {/* Intro */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-white mb-4">Pricing</h1>
          {/* Intro sentence removed per request */}
          {/* Billing Toggle */}
          <div className="flex items-center justify-center space-x-4 mt-8">
            <span className={`text-lg font-medium ${billingCycle === "monthly" ? "text-white" : "text-white/70"}`}>
              Monthly
            </span>
            <Switch
              checked={billingCycle === "annual"}
              onCheckedChange={() => setBillingCycle(billingCycle === "monthly" ? "annual" : "monthly")}
              className="data-[state=checked]:bg-indigo-600 data-[state=unchecked]:bg-gray-600 rounded-full"
            />
            <div className="flex items-center">
              <span className={`text-lg font-medium ${billingCycle === "annual" ? "text-white" : "text-white/70"}`}>
                Annually
              </span>
              <span className="ml-2 px-3 py-1 text-xs font-semibold bg-indigo-500 text-white rounded-md">
                Save 15%
              </span>
            </div>
          </div>
        </div>

        {/* Signals Only */}
        <div className="space-y-8">
          <PlanGrid plans={signalsPlans} />
        </div>

        {/* Details / FAQ */}
        <div className="mt-16 max-w-4xl mx-auto">
          <Accordion type="multiple" className="bg-slate-900 border border-slate-800 rounded-md divide-y divide-slate-800">
            <AccordionItem value="api-access">
              <AccordionTrigger className="px-4 text-left">What API access do plans include?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-white">
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Lite:</strong> No REST API access; CSV downloads only.</li>
                  <li><strong>Pro:</strong> No REST API access; full‑universe predictions with 365‑day manual downloads; alerts.</li>
                  <li><strong>Pro Developer:</strong> REST API: <code>/latest</code>, <code>/universe</code>, <code>/predictions</code> (365‑day lookback), <code>/ohlcv</code> (365‑day lookback).</li>
                  <li><strong>API:</strong> REST API: <code>/latest</code>, <code>/universe</code>, <code>/predictions</code> (full history), <code>/ohlcv</code> (full history); webhooks available.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="publishing">
              <AccordionTrigger className="px-4 text-left">When are predictions published?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-white">
                Once per day (UTC). Files are versioned for auditability.
              </AccordionContent>
            </AccordionItem>

            

            <AccordionItem value="universe">
              <AccordionTrigger className="px-4 text-left">What’s the universe and horizon?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-white">
                ≈390 liquid tokens. Horizons: 1‑day and 3‑day. Pro Developer focuses on 1‑day; API exposes both.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="verification">
              <AccordionTrigger className="px-4 text-left">How do I verify there’s no backfill?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                Files are fingerprinted; validate hashes in the dashboard archives.
              </AccordionContent>
            </AccordionItem>

            

            

            <AccordionItem value="support">
              <AccordionTrigger className="px-4 text-left">Support & SLAs</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                Pro and Pro‑Developer receive email support. API adds higher priority; SLAs and private endpoints are available via custom agreements.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Compare Plans section removed as redundant */}

        {/* Bottom CTA buttons removed per request */}
      </div>
    </div>
  );
}
