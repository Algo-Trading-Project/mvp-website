import React from "react";
import { ShieldCheck, LineChart, Plug } from "lucide-react";

const DIFFERENTIATORS = [
  {
    icon: LineChart,
    title: "Live, auditable results",
    body: "Daily out‑of‑sample ranks and spreads—no curated backtests. Judge the system on what it does in public.",
  },
  {
    icon: ShieldCheck,
    title: "Point‑in‑time integrity",
    body: "Predictions are timestamped before outcomes. Ingestion is PIT and immutable—no restatements, no look‑ahead.",
  },
  {
    icon: Plug,
    title: "Built for integration",
    body: "CSV downloads, REST, and webhooks with stable schemas and a clear data dictionary.",
  },
];

export default function WhyDifferentSection() {
  return (
    <section className="bg-slate-950 py-16 border-t border-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">Why we’re different</h2>
          <p className="text-white mt-3 max-w-2xl mx-auto">
            QuantPulse is built for professional validation. We care about verifiable performance, predictable delivery, and zero-surprise data pipelines.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {DIFFERENTIATORS.map((item) => (
            <div key={item.title} className="p-6 rounded-lg border bg-slate-900/70 border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <item.icon className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-white">{item.title}</h3>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
