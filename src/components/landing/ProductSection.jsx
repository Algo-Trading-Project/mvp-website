
import React from "react";
import { Database, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function ProductSection() {
  const cards = [
    {
      icon: Zap,
      title: "Alpha API (Quant Signals)",
      audience: "For traders & funds who want a ready-made edge",
      bullets: [
        "Daily predictions from our flagship 1‑day regression model",
        "Top/Bottom decile ranks and raw scores",
        "Designed for market‑neutral alpha (low beta to BTC)",
        "API access + daily files"
      ],
      cta: "Get the Alpha API",
    },
    {
      icon: Database,
      title: "Market Data API (Alpha‑Vetted)",
      audience: "For quants & teams that need reliable crypto data",
      bullets: [
        "Historical OHLCV (1m–1d) with rigorous normalization",
        "Coverage across major assets and venues",
        "Optional tick/trade feeds and snapshots",
        "Docs, schemas, and data dictionaries"
      ],
      cta: "Explore Plans",
    }
  ];

  return (
    <section className="py-16 bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold">How You Can Use It</h2>
          <p className="text-slate-300 mt-2">Subscribe to the proven Alpha API—or use the same alpha‑vetted Data API to build your own.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {cards.map((c, idx) => (
            <div key={idx} className="glass rounded-xl p-6 border border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                  <c.icon className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="text-xl font-semibold">{c.title}</h3>
              </div>
              <p className="text-slate-400 text-sm mb-4">{c.audience}</p>
              <ul className="space-y-2 text-slate-300 text-sm mb-6">
                {c.bullets.map((b, i) => <li key={i}>• {b}</li>)}
              </ul>
              <Link to={createPageUrl("Pricing")}>
                <Button className="bg-blue-600 hover:bg-blue-700 rounded-md">{c.cta}</Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
