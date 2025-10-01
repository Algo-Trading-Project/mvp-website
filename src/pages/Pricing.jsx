
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Check, Crown, Zap, Building, Loader2, Database } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { User } from "@/api/entities";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [isAuthed, setIsAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await User.me();
        setIsAuthed(true);
      } catch {
        setIsAuthed(false);
      }
      setAuthLoading(false);
    };
    checkAuth();
  }, []);

  // Stripe placeholders for some ML Signals tiers
  const stripeLinks = {
    "Signals Pro": {
      monthly: "https://buy.stripe.com/test_aFa9AS99J7Dnf3H2KI87K01",
      annual: "https://buy.stripe.com/test_00wcN471B2j3f3H2KI87K04",
    },
    "Signals API": {
      monthly: "https://buy.stripe.com/test_bJebJ03Ppg9T9Jn5WU87K00",
      annual: "https://buy.stripe.com/test_7sY7sK85FcXH2gVbhe87K03",
    },
    // New plans would need their own Stripe links here if they are directly purchasable
    // For now, if a plan name isn't in this map, it defaults to "Get Started" or "Contact Sales"
  };

  // Plans grouped by tabs
  const signalsRaw = [
    {
      name: "Signals Lite",
      icon: Zap,
      monthlyPrice: 59,
      description: "Top/bottom deciles for ~12 majors, 24h delay, email/Discord alerts, read‑only dashboard.",
      features: [
        "Top & bottom deciles for ~12 majors (CSV)",
        "24‑hour delay on files",
        "Email/Discord alerts on rebalance",
        "Schema: symbol_id, date, decile_rank_1d (top/bottom)",
        "Access to public OOS dashboard (read‑only)"
      ],
      cta: "Start with Lite",
    },
    {
      name: "Signals Pro",
      icon: Zap,
      monthlyPrice: 139,
      description: "Full daily ranks across ~391 assets, history downloads, fee‑adjusted deciles/turnover.",
      features: [
        "Full daily ranks/scores across ~391 assets",
        "12–24 months history downloads (CSV)",
        "Schema: symbol_id, date, y_pred, score_percentile",
        "Fee‑adjusted deciles, turnover & capacity metrics",
        "Access to OOS visuals & methodology"
      ],
      cta: "Choose Signals Pro",
      popular: true
    },
    {
      name: "Signals API",
      icon: Crown,
      monthlyPrice: 449,
      description: "Programmatic ranks/scores + optional weights, PIT retrieval, higher limits, webhooks.",
      features: [
        "Programmatic ranks/scores + optional weights",
        "Point‑in‑time retrieval & historical archives",
        "Schema: symbol_id, date, score, weight, confidence",
        "Higher rate limits + webhooks",
        "Versioned model cards & monitoring"
      ],
      cta: "Choose Signals API"
    },
    {
      name: "Team / Institution",
      icon: Building,
      monthlyPrice: null,
      customNote: "From $2,000+/mo",
      description: "Seats, custom universes/cadence, private endpoints, SLAs, PIT audit tooling.",
      features: [
        "Private endpoints & SLAs",
        "Custom universes & cadence",
        "Dedicated schema planning & onboarding",
        "PIT audit tooling & onboarding help",
        "Transact via AWS Marketplace / private offers"
      ],
      cta: "Contact Sales",
      contact: true
    }
  ];

  const dataRaw = [
    {
      name: "OHLCV Starter",
      icon: Database,
      monthlyPrice: 129,
      description: "EOD OHLCV for top 50 assets. Cleaned, normalized symbols/venues.",
      features: [
        "Daily OHLCV (EOD) for top 50 assets",
        "Normalized symbols & venues",
        "CSV downloads + documentation"
      ],
      cta: "Start Data Starter"
    },
    {
      name: "OHLCV Pro (1‑min bars)",
      icon: Database,
      monthlyPrice: 349,
      description: "1‑min + daily OHLCV for 150+ assets. Schema guarantees, bulk downloads.",
      features: [
        "1‑minute & daily OHLCV for 150+ assets",
        "Venue normalization & schema guarantees",
        "Bulk download tooling"
      ],
      cta: "Choose Data Pro",
      popular: true
    },
    {
      name: "OHLCV + Select Tick",
      icon: Database,
      monthlyPrice: 699,
      description: "Add curated tick/trade feeds for top venues. S3 pre‑signed or query‑in‑cloud.",
      features: [
        "Everything in Pro",
        "Curated tick/trade feeds for top venues",
        "S3 pre‑signed or query‑in‑cloud options"
      ],
      cta: "Choose Data + Tick"
    },
    {
      name: "Enterprise Data",
      icon: Building,
      monthlyPrice: null,
      customNote: "Custom",
      description: "Expanded tick + order‑book snapshots, custom retention/backfills, native sharing.",
      features: [
        "Expanded coverage & snapshots",
        "Custom pipelines and retention",
        "Warehouse/native sharing & SLAs"
      ],
      cta: "Contact Sales",
      contact: true
    }
  ];

  const bundlesRaw = [
    {
      name: "Starter Bundle",
      icon: Database,
      monthlyPrice: 199, // Signals Pro ($139) + OHLCV Starter ($129) = $268 → ~25% off
      description: "Signals Pro + OHLCV Starter at a clear discount.",
      features: [
        "Signals Pro (full ranks & history)",
        "OHLCV Starter (top 50 EOD)",
        "Email/Discord alerts + downloads"
      ],
      cta: "Choose Starter Bundle",
      popular: true
    },
    {
      name: "Pro Bundle",
      icon: Crown,
      monthlyPrice: 899, // Signals API ($449) + OHLCV Pro ($349) + Select Tick ($699) = $1,497 → ~40% off
      description: "Signals API + OHLCV Pro + Select Tick — desk‑level access.",
      features: [
        "Signals API (programmatic ranks/scores/weights)",
        "OHLCV Pro (1‑min + EOD)",
        "Curated tick/trade feeds + webhooks"
      ],
      cta: "Choose Pro Bundle"
    },
    {
      name: "Desk All‑Access",
      icon: Building,
      monthlyPrice: null,
      customNote: "Custom",
      description: "Custom bundles for teams and funds via AWS Marketplace/private offer.",
      features: [
        "Private endpoints & SLAs",
        "Custom universe & cadence",
        "Bulk history per data‑month + integration help"
      ],
      cta: "Contact Sales",
      contact: true
    }
  ];

  // Compute annual prices with 15% discount
  const addAnnual = (plans) =>
    plans.map(p => {
      const annual = p.monthlyPrice ? Math.round(p.monthlyPrice * 12 * 0.85) : null;
      return { ...p, price: p.monthlyPrice ? { monthly: p.monthlyPrice, annual } : null };
    });

  const signalsPlans = addAnnual(signalsRaw);
  const dataPlans = addAnnual(dataRaw);
  const bundlePlans = addAnnual(bundlesRaw);

  const getPrice = (plan) => (plan.price ? plan.price[billingCycle] : null);
  const getSavings = (plan) =>
    billingCycle === "annual" && plan.price ? plan.price.monthly * 12 - plan.price.annual : 0;

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
              <p className="text-slate-400 mb-6 text-sm px-2">{plan.description}</p>
              <div className="text-center mb-6 flex flex-col items-center justify-center min-h-[72px]">
                {plan.price ? (
                  <>
                    <span className="text-3xl font-extrabold text-white">
                      ${getPrice(plan)}
                    </span>
                    <span className="text-lg text-slate-400">
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
                    <div className="text-slate-400 text-sm mt-1">Contact us</div>
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
              <p className="text-[11px] text-slate-500 mb-3">Delivery: daily @ 13:00 UTC · Schema docs & asset list included with every plan.</p>
              {authLoading ? (
                <Button disabled className="w-full py-3 text-sm font-semibold bg-slate-700 text-slate-400 rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </Button>
              ) : plan.contact ? (
                <Link to={createPageUrl("Contact")} className="block">
                  <Button className="w-full py-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md">
                    {plan.cta}
                  </Button>
                </Link>
              ) : isAuthed && stripeLinks[plan.name]?.[billingCycle] ? (
                <a
                  href={stripeLinks[plan.name][billingCycle]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button className="w-full py-3 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md">
                    Subscribe
                  </Button>
                </a>
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
            Transparent, audited, ML‑driven crypto signals and a clean market‑data lake — priced for builders, quants, and teams.
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

        {/* Tabs */}
        <Tabs defaultValue="signals" className="space-y-8">
          <TabsList className="bg-slate-900 border border-slate-800 rounded-md">
            <TabsTrigger value="signals" className="data-[state=inactive]:text-white">ML Signals</TabsTrigger>
            <TabsTrigger value="data" className="data-[state=inactive]:text-white">Market Data</TabsTrigger>
            <TabsTrigger value="bundles" className="data-[state=inactive]:text-white">Bundles</TabsTrigger>
          </TabsList>

          <TabsContent value="signals">
            <PlanGrid plans={signalsPlans} />
          </TabsContent>

          <TabsContent value="data">
            <PlanGrid plans={dataPlans} />
          </TabsContent>

          <TabsContent value="bundles">
            <PlanGrid plans={bundlePlans} />
          </TabsContent>
        </Tabs>

        {/* Details */}
        <div className="mt-16 max-w-4xl mx-auto">
          <Accordion type="multiple" className="bg-slate-900 border border-slate-800 rounded-md divide-y divide-slate-800">
            <AccordionItem value="why">
              <AccordionTrigger className="px-4 text-left">Why Premium?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                <ol className="list-decimal list-inside space-y-2">
                  <li><strong>Proven edge, measured the way quants do.</strong> We report monthly Spearman rank IC, ICIR, fee‑adjusted decile performance, turnover, and drawdowns.</li>
                  <li><strong>No backfills that overwrite history.</strong> Every daily prediction file is snapshotted and published; histories are retained and auditable.</li>
                  <li><strong>Breadth + discipline.</strong> Hundreds of assets × daily/weekly re‑estimation → breadth that converts IC into realized IR (with costs accounted for).</li>
                  <li><strong>Data + Signals in one place.</strong> Clean OHLCV and tick history + daily alpha ranks/weights, so you can build, backtest, and go live without duct‑tape.</li>
                </ol>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="oos">
              <AccordionTrigger className="px-4 text-left">What’s on the OOS Dashboard (public)</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                <ul className="list-disc pl-5 space-y-2">
                  <li>Monthly rank IC (1d) with confidence bands</li>
                  <li>Decile long‑short curves (gross and fee/slippage‑adjusted)</li>
                  <li>Drawdowns & recovery time</li>
                  <li>Turnover and capacity notes (avg daily traded $/pair assumption)</li>
                  <li>Methodology card: factor families, training cadence, leakage tests, data handling, and quality checks</li>
                  <li>Audit artifacts: daily prediction file hash, timestamp, immutable ID</li>
                </ul>
                <p className="text-xs text-slate-500 mt-3">(Full ranks/weights and full history are gated to paid tiers.)</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="proof">
              <AccordionTrigger className="px-4 text-left">Proof Points</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                <ul className="list-disc pl-5 space-y-2">
                  <li>Consistency: ICIR ≥ 2 over multi‑year OOS periods</li>
                  <li>Tradability: we show fee/slippage‑adjusted decile spreads using conservative taker costs</li>
                  <li>No hindsight: retrieve any past prediction and check the published hash</li>
                  <li>Breadth: ~391 assets with coverage since 2019 (rolling universe handling documented)</li>
                  <li>Methodology transparency: clear leakage checks, data sanity, and retraining cadence</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="workflows">
              <AccordionTrigger className="px-4 text-left">Example Workflows</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-white mb-1">Signals Pro</h4>
                    <p>Export today’s top decile and create a market‑neutral basket with turnover caps.</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">Signals API</h4>
                    <p>Pull ranks at 00:05 UTC daily, join to your risk model, produce weights with sector/size constraints.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white">Data + Signals</p>
                    <p>Run an offline backtest using our OHLCV + tick to validate fee‑adjusted P&amp;L; go live from the same schema.</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="discounts">
              <AccordionTrigger className="px-4 text-left">Discounts & Terms</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                <ul className="list-disc pl-5 space-y-2">
                  <li>Annual: 15% off</li>
                  <li>Founder pricing: early adopters are grandfathered</li>
                  <li>One subscription per project/team; fair‑use rate limits apply</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq">
              <AccordionTrigger className="px-4 text-left">FAQ</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold text-white">Are these investment recommendations?</p>
                    <p>No. This is data & research for professional users. You control execution and risk.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white">What costs do you assume on the dashboard?</p>
                    <p>We publish the exact assumptions (e.g., taker bps, slippage model) and show both gross and cost‑adjusted curves.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white">How do I verify there’s no backfill?</p>
                    <p>Use our daily prediction archives to retrieve historical files and check the published hash.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-white">What about capacity?</p>
                    <p>We disclose turnover and notional assumptions by decile, plus sensitivity to rebalance frequency.</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="compliance">
              <AccordionTrigger className="px-4 text-left">Compliance & Risk</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 text-slate-300">
                <ul className="list-disc pl-5 space-y-2">
                  <li>For informational purposes only; not investment advice</li>
                  <li>Some assets may be restricted in certain jurisdictions; you’re responsible for compliance and tax</li>
                  <li>Past performance (including OOS) does not guarantee future results</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Compare Plans */}
        <div id="compare" className="mt-16 max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-white">Compare Plans</h3>
            <p className="text-slate-400 text-sm">Key limits and differences at a glance.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
              <div className="font-semibold mb-1">Lite / Starter</div>
              <ul className="text-slate-300 text-sm list-disc pl-5 space-y-1">
                <li>Email/Discord alerts</li>
                <li>EOD files with delay</li>
                <li>Basic rate limits</li>
              </ul>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
              <div className="font-semibold mb-1">Pro</div>
              <ul className="text-slate-300 text-sm list-disc pl-5 space-y-1">
                <li>Full ranks across universe</li>
                <li>12–24m history downloads</li>
                <li>Higher limits</li>
              </ul>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
              <div className="font-semibold mb-1">API / Desk</div>
              <ul className="text-slate-300 text-sm list-disc pl-5 space-y-1">
                <li>Programmatic access + webhooks</li>
                <li>Point‑in‑time retrieval</li>
                <li>SLAs & private endpoints (Desk)</li>
              </ul>
            </div>
          </div>
          <div className="text-center mt-6 text-sm text-slate-400">
            Have questions? <Link to={createPageUrl("Contact")} className="text-blue-400 hover:underline">Contact sales</Link>.
          </div>
        </div>

        {/* CTA buttons */}
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to={createPageUrl("GetStarted")}>
            <Button className="bg-blue-600 hover:bg-blue-700 rounded-md">Start 7‑day trial</Button>
          </Link>
          <Link to={createPageUrl("Dashboard?tab=regression")}>
            <Button variant="outline" className="rounded-md bg-white text-slate-900 border-slate-300 hover:bg-slate-100">See live OOS dashboard</Button>
          </Link>
          <Link to={createPageUrl("Docs")}>
            <Button variant="outline" className="rounded-md bg-white text-slate-900 border-slate-300 hover:bg-slate-100">API docs</Button>
          </Link>
          <Link to={createPageUrl("Contact")}>
            <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-md">Contact sales</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
