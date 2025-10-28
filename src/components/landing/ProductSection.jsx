
import React from "react";
import { ShieldCheck, LineChart, Plug, Bell } from "lucide-react";

export default function ProductSection() {
  const features = [
    {
      icon: ShieldCheck,
      title: "Transparent & reproducible",
      body: "Public OOS performance with stable schemas and point‑in‑time retrieval. Inspect methodology and verify claims.",
    },
    {
      icon: LineChart,
      title: "Daily ML alpha signals",
      body: "Predictive rankings for 391+ assets on 1‑day and 3‑day horizons, delivered after the book is closed.",
    },
    {
      icon: Plug,
      title: "Easy integration",
      body: "Download CSVs or use a simple REST API. Works with Python, Excel, or your bot.",
    },
    {
      icon: Bell,
      title: "Stay informed",
      body: "Optional email/Discord alerts when new signals drop or top decile shifts.",
    },
  ];

  return (
    <section className="bg-slate-950 py-16 border-t border-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white">Built for quants, by quants</h2>
          <p className="text-white mt-3 max-w-2xl mx-auto">
            Clear benefits, minimal friction. Get evidence you can trust and data you can use immediately.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <f.icon className="w-6 h-6 text-emerald-400 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-white leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
