import React from "react";
import { ShieldCheck, LineChart, Plug } from "lucide-react";

const DIFFERENTIATORS = [
  {
    icon: LineChart,
    title: "Public, verifiable OOS",
    body: "We publish every rank, decile, and spread out-of-sample. No cherry-picked backtests—judge the model on live history only.",
  },
  {
    icon: ShieldCheck,
    title: "Point-in-time clean",
    body: "Signals are versioned, PIT-audited, and delivered after the book is closed—no look-ahead leakage or patched datasets.",
  },
  {
    icon: Plug,
    title: "Straightforward delivery",
    body: "Grab CSVs, hit the REST API, or stream webhooks. Schemas stay stable and every plan includes docs, data dictionary, and assets list.",
  },
];

export default function WhyDifferentSection() {
  return (
    <section className="bg-slate-950 py-16 border-t border-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">Why we’re different</h2>
          <p className="text-slate-300 mt-3 max-w-2xl mx-auto">
            QuantPulse is built for professional validation. We care about verifiable performance, predictable delivery, and zero-surprise data pipelines.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {DIFFERENTIATORS.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <item.icon className="w-6 h-6 text-emerald-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
