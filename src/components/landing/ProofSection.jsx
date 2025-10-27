import React from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { CheckCircle2, LineChart, ShieldCheck, Database } from "lucide-react";

export default function ProofSection() {
  return (
    <section className="bg-slate-900 py-20 sm:py-28 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-5 gap-10 items-start">
          {/* Left: narrative + checklist */}
          <div className="md:col-span-3">
            <p className="font-semibold text-blue-400">Proof, Not Promises</p>
            <h2 className="text-3xl sm:text-4xl font-bold mt-2">See it working — in the open</h2>
            <p className="mt-4 text-white text-lg max-w-xl">
              Live performance, public verification, and downloadable history. Validate the edge on your terms.
            </p>
            <ul className="mt-6 space-y-3 text-white">
              <li className="flex items-start gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" /> Public dashboard with rolling IC, spreads, drawdowns, and more</li>
              <li className="flex items-start gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" /> Out‑of‑sample metrics only — no cherry‑picked backtests</li>
              <li className="flex items-start gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" /> Download yesterday’s predictions to run your own checks</li>
              <li className="flex items-start gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" /> Immutable archives, stable schemas, and consistent delivery</li>
            </ul>
            <div className="mt-8 flex gap-3">
              <Link to={createPageUrl("Dashboard?tab=regression")}>
                <Button size="lg" className="bg-white text-slate-900 hover:bg-slate-100 rounded-lg">View Live Performance</Button>
              </Link>
              <Link to={createPageUrl("GetStarted")}>
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700 rounded-lg">Get Started</Button>
              </Link>
            </div>
          </div>

          {/* Right: stacked preview tiles (visual novelty vs. 3-up grid) */}
          <div className="md:col-span-2 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center gap-2 mb-2 text-white">
                <LineChart className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold">Live OOS Dashboard</span>
              </div>
              <p className="text-sm text-white">Rolling IC, decile spreads, hit‑rate, and robustness plots — updated daily.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center gap-2 mb-2 text-white">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold">Verifiable OOS</span>
              </div>
              <p className="text-sm text-white">Signals are published after the book is closed and archived for audit.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center gap-2 mb-2 text-white">
                <Database className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold">Downloadable History</span>
              </div>
              <p className="text-sm text-white">Grab yesterday’s predictions to validate methodology in your own stack.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
