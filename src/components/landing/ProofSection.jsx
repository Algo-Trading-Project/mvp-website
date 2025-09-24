import React from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Zap, ShieldCheck, Download } from "lucide-react";

export default function ProofSection() {
  return (
    <section className="bg-slate-900 py-20 sm:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="font-semibold text-blue-400">Proof, Not Promises</p>
          <h2 className="text-3xl sm:text-4xl font-bold mt-2">Alpha You Can Verify</h2>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-400">
            We’re tired of black boxes. Our performance is public, with downloadable historical predictions so you can run your own analysis.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-8">
          <div className="bg-slate-800/50 p-8 rounded-lg text-center">
            <Zap className="mx-auto h-10 w-10 text-amber-400" />
            <h3 className="mt-6 text-lg font-semibold">Live Performance</h3>
            <p className="mt-2 text-slate-400">
              Track our models’ live alpha and beta on our public dashboard, updated daily.
            </p>
          </div>
          <div className="bg-slate-800/50 p-8 rounded-lg text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-emerald-400" />
            <h3 className="mt-6 text-lg font-semibold">Out-of-Sample</h3>
            <p className="mt-2 text-slate-400">
              All performance metrics are calculated on data the model has never seen. No backtests.
            </p>
          </div>
          <div className="bg-slate-800/50 p-8 rounded-lg text-center">
            <Download className="mx-auto h-10 w-10 text-cyan-400" />
            <h3 className="mt-6 text-lg font-semibold">Downloadable History</h3>
            <p className="mt-2 text-slate-400">
              Get free access to yesterday's full signal dataset to verify our methodology.
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link to={createPageUrl("Dashboard?tab=regression")}>
            <Button size="lg" className="bg-white text-slate-900 hover:bg-slate-100 rounded-lg">
              View Full Live Performance
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}