import React from "react";
import { Database, BookOpen, ShieldCheck, Download, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function Data() {
  return (
    <div className="min-h-screen py-12 bg-slate-950">
      <div className="max-w-[1100px] mx-auto px-3 sm:px-4 lg:px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-md text-blue-300 text-sm">
            <Database className="w-4 h-4" />
            Data Platform
          </div>
          <h1 className="text-4xl font-bold mt-4">Your Data, <span className="gradient-text">Organized</span></h1>
          <p className="text-slate-300 mt-3 max-w-2xl mx-auto">
            Curated crypto datasets with clear schemas and examples. Build with confidence and integrate fast.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-md p-6">
            <div className="text-sm text-slate-400 mb-1">Coverage</div>
            <div className="text-lg font-semibold text-emerald-400">Multi‑year history</div>
            <p className="text-slate-400 text-sm mt-2">Market, on‑chain, derivatives, and microstructure features.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-6">
            <div className="text-sm text-slate-400 mb-1">Format</div>
            <div className="text-lg font-semibold text-blue-300">CSV & Parquet</div>
            <p className="text-slate-400 text-sm mt-2">Optimized for analysis and production pipelines.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-6">
            <div className="text-sm text-slate-400 mb-1">Transparency</div>
            <div className="text-lg font-semibold text-purple-300">Live OOS Metrics</div>
            <p className="text-slate-400 text-sm mt-2">Public dashboard showcasing real model performance.</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-md p-6 mt-8">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2"><BookOpen className="w-5 h-5 text-blue-400" /> What’s included</h2>
          <ul className="grid sm:grid-cols-2 gap-4 text-slate-300 text-sm">
            <li>• Historical datasets with versioned schemas</li>
            <li>• Data dictionary and feature descriptions</li>
            <li>• Daily downloads (scores, portfolios, returns)</li>
            <li>• Example notebooks and usage guides</li>
          </ul>
        </div>

        <div className="text-center mt-10">
          <Link to={createPageUrl("Pricing")}>
            <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-md px-8">
              View Pricing
            </Button>
          </Link>
          <Link to={createPageUrl("PerformancePublic")} className="ml-3">
            <Button variant="outline" className="rounded-md bg-white text-slate-900 hover:bg-slate-100">
              See Live Performance
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}