import React from "react";

const logos = [
  { name: "Aurora Quant", label: "Aurora Quant", description: "Scaled a 220 bps market-neutral sleeve using QuantPulse in under 6 weeks." },
  { name: "Delta Labs", label: "Delta Labs", description: "Integrated the API to drive nightly rebalances with <2% turnover drift." },
  { name: "Nighthawk Research", label: "Nighthawk Research", description: "Validates discretionary trades against our universe-wide ranks." },
];

export default function SocialProofSection() {
  return (
    <section className="bg-slate-950 py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs uppercase tracking-[0.3em] text-slate-500 mb-6">Trusted by</p>
        <div className="grid md:grid-cols-3 gap-6">
          {logos.map((logo) => (
            <div key={logo.name} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center">
              <div className="text-lg font-semibold text-white mb-2">{logo.label}</div>
              <p className="text-sm text-slate-400 leading-relaxed">{logo.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
