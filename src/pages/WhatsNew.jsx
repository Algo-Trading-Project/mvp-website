import React from "react";

export default function WhatsNew() {
  const items = [
    { date: "2025-02-01", title: "Public OOS stats on Home + Bundles pricing", body: "Added IC/ICIR stats and centered bundles with dynamic grid." },
    { date: "2025-01-28", title: "Signals Repository", body: "Download daily and historical predictions; token filters and 14‑day recent list." },
  ];
  return (
    <div className="min-h-screen py-16 bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-6"><span className="gradient-text">What’s New</span></h1>
        <div className="space-y-4">
          {items.map((it) => (
            <div key={it.date} className="bg-slate-900 border border-slate-800 rounded-md p-5">
              <div className="text-slate-400 text-xs">{it.date}</div>
              <div className="text-white font-semibold">{it.title}</div>
              <p className="text-slate-300 text-sm mt-1">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}