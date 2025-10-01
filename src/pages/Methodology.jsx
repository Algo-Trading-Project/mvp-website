import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import { LineChart, Ruler, RefreshCw, ShieldCheck } from "lucide-react";

const sections = [
  {
    icon: LineChart,
    title: "Universe & cadence",
    body: "~390 liquid crypto assets across major venues. Signals publish daily at 13:00 UTC after the market close used for training. We track versioned universes and note additions/removals in the change log.",
  },
  {
    icon: Ruler,
    title: "Metrics we publish",
    body: "Spearman information coefficient (IC), top–bottom decile spread, hit rate, and rolling statistics. All metrics are point-in-time, computed out-of-sample on data the model never saw during training.",
  },
  {
    icon: RefreshCw,
    title: "Model updates",
    body: "Models are retrained roughly every 6 weeks with walk-forward validation. We freeze feature schemas per version, publish release notes, and keep the three latest versions queryable for audits.",
  },
  {
    icon: ShieldCheck,
    title: "Point-in-time controls",
    body: "Data ingestion is PIT enforced—no future candles, no patched deltas. Predictions are timestamped, versioned, and stored before performance is calculated. Decile spreads use next-day mid-close marks net of 4 bps each side for friction.",
  },
];

const glossary = [
  {
    term: "Information Coefficient (IC)",
    definition: "Rank correlation between our predicted 1-day returns and the realized returns across the asset universe on the following day.",
  },
  {
    term: "Decile spread",
    definition: "Average performance of the top decile minus the bottom decile of ranked predictions, rebalanced daily with equal weights.",
  },
  {
    term: "Hit rate",
    definition: "Share of days where the top-decile basket outperformed the universe median.",
  },
];

export default function Methodology() {
  return (
    <div className="bg-slate-950 text-white min-h-screen">
      <header className="border-b border-slate-900 bg-slate-950/90">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-xs uppercase tracking-[0.4em] text-emerald-400 mb-4">Methodology</p>
          <h1 className="text-4xl font-bold mb-4">How QuantPulse measures and publishes performance</h1>
          <p className="text-slate-300 max-w-3xl">
            Quant desks need audit-ready evidence. This page explains our datasets, how we compute each metric, and where to find change logs so you can diligence the signal stack before going live.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link to={createPageUrl("Docs")}>Read the docs</Link>
            </Button>
            <Button asChild variant="outline" className="border-slate-700 text-slate-200">
              <Link to={createPageUrl("Dashboard?tab=regression")}>View live dashboard</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        <section>
          <h2 className="text-2xl font-semibold mb-6">Controls & assumptions</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {sections.map((section) => (
              <div key={section.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
                <section.icon className="w-6 h-6 text-emerald-400 mb-3" />
                <h3 className="text-lg font-semibold mb-2">{section.title}</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{section.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Metric glossary</h2>
          <div className="space-y-4">
            {glossary.map((item) => (
              <div key={item.term} className="border border-slate-800 rounded-lg bg-slate-900/40 p-4">
                <h3 className="text-base font-semibold mb-1">{item.term}</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{item.definition}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-slate-800 rounded-xl p-6 bg-slate-900/60">
          <h2 className="text-xl font-semibold mb-3">Update & versioning cadence</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            The public dashboards always show the latest model version. Each release is tagged (e.g., <code>model-v1.3</code>) and archived. When we retrain, we publish a changelog entry summarizing feature updates, retraining window, and validation statistics. Historical predictions remain queryable so your backtests stay consistent.
          </p>
        </section>

        <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Need deeper diligence?</h2>
          <p className="text-slate-300 text-sm mb-4">
            Enterprise plans include private walkthroughs of the ingestion pipeline, PIT audit reports, and sample execution playbooks. Reach out and we’ll line up the data you need to clear investment committee.
          </p>
          <Button asChild>
            <Link to={createPageUrl("Contact")}>Contact the team</Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
