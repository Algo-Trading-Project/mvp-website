import React from "react";

export default function Status() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-3xl font-bold mb-3">Status</h1>
        <p className="text-slate-300">A live status page for data delivery (Dashboard / REST API / Webhooks) will appear here.</p>
        <p className="text-slate-400 mt-2">If you suspect an incident, contact support and include request IDs and timestamps.</p>
      </div>
    </div>
  );
}

