
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Check, Crown, Zap, Building, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { User } from "@/api/entities";
import { StripeApi } from "@/api/stripe";
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
  const [authChecked, setAuthChecked] = useState(!!authCacheRef.current);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await User.me();
        setIsAuthed(true);
        authCacheRef.current = true;
        persistAuthCache(true);
      } catch {
        setIsAuthed(false);
        authCacheRef.current = false;
        persistAuthCache(false);
      }
      setAuthChecked(true);
    };
    if (!authChecked) {
      checkAuth();
    }
  }, [authChecked]);

  // Plans grouped by tabs
  const signalsRaw = [
    {
      name: "Signals Lite",
      icon: Zap,
      monthlyPrice: 59,
      description: "Top/bottom deciles for ~12 majors. 24h delay. Read‑only dashboard.",
      slug: "signals_lite",
      features: [
        "CSV ranks for top 60 tokens by ADV",
        "90 days download history (CSV)",
        "Email/Discord alerts on rebalance",
        "No API access",
      ],
      cta: "Start with Lite",
    },
    {
      name: "Signals Pro",
      icon: Shield,
      monthlyPrice: 139,
      description: "Full daily ranks across ~391 assets with history downloads and OOS analytics.",
      slug: "signals_pro",
      features: [
        "Full daily ranks/scores across ~391 assets",
        "12–24 months CSV history downloads",
        "OOS dashboard, fee‑adjusted deciles & methodology",
        "No API access",
      ],
      cta: "Choose Signals Pro",
      popular: true
    },
    {
      name: "Pro‑Developer (Add‑on)",
      icon: Building,
      monthlyPrice: 229,
      description: "Lightweight API for live automation without history. Add‑on to Pro.",
      slug: "signals_pro_dev",
      features: [
        "API: /latest predictions (current release)",
        "API: /universe (read)",
        "API: /ohlcv (≤30‑day lookback)",
        "Tight limits: ≤2 calls/day to /latest",
      ],
      cta: "Add Pro‑Developer",
    },
    {
      name: "Signals API",
      icon: Crown,
      monthlyPrice: 449,
      description: "Full API for research/backtests and production. High limits.",
      slug: "signals_api",
      features: [
        "API: /predictions (full history)",
        "API: /latest, /universe, /ohlcv (full)",
        "Point‑in‑time retrieval (PIT) archives",
        "Higher rate limits & multiple keys",
      ],
      cta: "Choose Signals API"
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
              <p className="text-slate-300 mb-6 text-sm px-2">{plan.description}</p>
              <div className="text-center mb-6 flex flex-col items-center justify-center min-h-[72px]">
                {plan.price ? (
                  <>
                    <span className="text-3xl font-extrabold text-white">
                      ${getPrice(plan)}
                    </span>
                    <span className="text-lg text-slate-300">
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
                    <div className="text-slate-300 text-sm mt-1">Contact us</div>
                  </div>
                )}
              </div>
              <ul className="space-y-3 mb-8 text-left mx-auto max-w-[90%]">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start text-slate-300 text-sm">
                    <Check className="h-4 w-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-auto">
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
          <p className="text-slate-300 max-w-3xl mx-auto">
            Transparent, automated, ML‑driven crypto signals — priced for builders, quants, and teams.
          </p>
          {/* Billing Toggle */}
          <div className="flex items-center justify-center space-x-4 mt-8">
            <span className={`text-lg font-medium ${billingCycle === "monthly" ? "text-white" : "text-slate-400"}`}>
              Monthly
            </span>
            <Switch
              checked={billingCycle === "annual"}
              onCheckedChange={() => setBillingCycle(billingCycle === "monthly" ? "annual" : "monthly")}
              className="data-[state=checked]:bg-indigo-600 data-[state=unchecked]:bg-gray-600 rounded-full"
            />
            <div className="flex items-center">
              <span className={`text-lg font-medium ${billingCycle === "annual" ? "text-white" : "text-slate-400"}`}>
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
              <AccordionTrigger className="px-4 text-left">What API access do I get on each plan?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Lite:</strong> No API access. CSVs for ~12 majors (24h delay).</li>
                  <li><strong>Pro (no add‑on):</strong> No API access. Full ranks + history via CSV and dashboard.</li>
                  <li><strong>Pro‑Developer (add‑on):</strong> API access to <code>/latest</code> predictions (current release, rate‑limited), <code>/universe</code> (read), and <code>/ohlcv</code> with short lookback (≤30 days).</li>
                  <li><strong>API:</strong> Full API, including <code>/predictions</code> historical range, <code>/latest</code>, <code>/universe</code>, and <code>/ohlcv</code> with higher limits.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="publishing">
              <AccordionTrigger className="px-4 text-left">When are predictions published?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                Predictions publish once per day (UTC). Each file is snapshotted and versioned so archives remain immutable and auditable.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="accumulation">
              <AccordionTrigger className="px-4 text-left">Can Pro‑Developer users reconstruct history over time?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                Over time, <code>/latest</code> responses can be accumulated. That’s an intentional trade‑off: Pro‑Developer enables light automation; anyone who needs immediate backfill for research/backtests should use the API tier.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="universe">
              <AccordionTrigger className="px-4 text-left">What’s the universe and horizon?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                We cover ~391 liquid assets with daily cadence. Horizons on the dashboard are 1‑day and 3‑day; Pro‑Developer focuses on <code>1d</code>; API exposes all available horizons.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="verification">
              <AccordionTrigger className="px-4 text-left">How do I verify there’s no backfill?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                Every prediction file is fingerprinted; retrieve historical files and validate the published hash in the dashboard archives.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dashboard">
              <AccordionTrigger className="px-4 text-left">What’s on the public OOS dashboard?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                Monthly IC, fee‑adjusted decile performance, rolling metrics (IC, spreads, hit‑rate), robustness checks, and distribution plots.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="limits">
              <AccordionTrigger className="px-4 text-left">How do rate limits work?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                Pro‑Developer uses strict caps (e.g., ≤2 calls/day for <code>/latest</code>, single key/concurrency). API tier has significantly higher limits and multiple keys.
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

        {/* Compare Plans */}
        <div id="compare" className="mt-16 max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-white">Compare Plans</h3>
            <p className="text-slate-300 text-sm">Key limits and differences at a glance.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
              <div className="font-semibold mb-1">Lite</div>
              <ul className="text-slate-300 text-sm list-disc pl-5 space-y-1">
                <li>CSV ranks for top 60 tokens by ADV</li>
                <li>90 days history (CSV)</li>
                <li>No API access; alerts + read‑only dashboard</li>
              </ul>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
              <div className="font-semibold mb-1">Pro (no add‑on)</div>
              <ul className="text-slate-300 text-sm list-disc pl-5 space-y-1">
                <li>CSV downloads</li>
                <li>No API access</li>
                <li>OOS dashboard + history files</li>
              </ul>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
              <div className="font-semibold mb-1">Pro‑Developer</div>
              <ul className="text-slate-300 text-sm list-disc pl-5 space-y-1">
                <li>API: /latest predictions (rate‑limited)</li>
                <li>API: /universe read</li>
                <li>API: /ohlcv ≤30‑day lookback</li>
              </ul>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
              <div className="font-semibold mb-1">API</div>
              <ul className="text-slate-300 text-sm list-disc pl-5 space-y-1">
                <li>API: /predictions full history</li>
                <li>API: /latest, /universe, /ohlcv full</li>
                <li>High limits + multiple keys</li>
              </ul>
            </div>
          </div>
          {/* Contact sales note removed per request */}
        </div>

        {/* CTA buttons */}
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to={createPageUrl("GetStarted")}>
            <Button className="bg-blue-600 hover:bg-blue-700 rounded-md">Start 7‑day trial</Button>
          </Link>
          <Link to={createPageUrl("Dashboard?tab=regression")}>
            <Button variant="outline" className="rounded-md bg-white text-slate-900 border-slate-300 hover:bg-slate-100">See live OOS dashboard</Button>
          </Link>
          <Link to={createPageUrl("Contact")}>
            <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-md">Contact sales</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
