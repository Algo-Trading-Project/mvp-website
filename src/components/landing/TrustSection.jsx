import React from "react";

export default function TrustSection() {
  const stats = [
    { label: "Assets Covered", value: "391+" },
    { label: "Cadence", value: "Daily @ 13:00 UTC" },
    { label: "Public OOS Since", value: "2019" },
  ];

  return (
    <section className="bg-slate-950 py-10 border-t border-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Trusted Signals</p>
          <h2 className="text-2xl font-semibold text-white mt-2">Trusted by data‑driven teams</h2>
        </div>

        {/* Quick stats row (swap with logos when available) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center">
              <div className="text-white text-xl font-bold">{s.value}</div>
              <div className="text-white text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

