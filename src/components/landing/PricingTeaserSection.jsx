import React from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function PricingTeaserSection() {
  const plans = [
    {
      name: "Lite",
      price: "$59",
      blurb: "Top/bottom deciles for majors. 24h delay.",
      href: createPageUrl("Pricing#lite"),
      cta: "Start with Lite",
    },
    {
      name: "Pro",
      price: "$139",
      blurb: "Full daily rankings for 391+ assets.",
      href: createPageUrl("Pricing#pro"),
      cta: "Choose Pro",
      popular: true,
    },
    {
      name: "Pro‑Developer",
      price: "$229",
      blurb: "Add API for light automation.",
      href: createPageUrl("Pricing#pro_dev"),
      cta: "Add Pro‑Dev",
    },
    {
      name: "API",
      price: "$449",
      blurb: "Full API for research & prod.",
      href: createPageUrl("Pricing#api"),
      cta: "Choose API",
    },
  ];

  return (
    <section className="py-16 bg-slate-950 border-t border-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white">Simple pricing</h2>
          <p className="text-white mt-2">Pick a plan and get started in minutes.</p>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          {plans.map((p) => (
            <div key={p.name} className={`rounded-xl border ${p.popular ? 'border-emerald-500/40' : 'border-slate-800'} bg-slate-900/60 p-5`}>
              {p.popular && (
                <div className="text-[10px] uppercase tracking-widest text-emerald-300 mb-2">Most Popular</div>
              )}
              <div className="text-white font-semibold">{p.name}</div>
              <div className="text-white text-2xl font-bold mt-1">{p.price}<span className="text-sm font-normal text-white/80">/mo</span></div>
              <div className="text-white text-sm mt-2 mb-4">{p.blurb}</div>
              <Link to={p.href}>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 rounded-md">{p.cta}</Button>
              </Link>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link to={createPageUrl("Pricing")} className="text-blue-300 hover:text-blue-200">Compare all features →</Link>
        </div>
      </div>
    </section>
  );
}
