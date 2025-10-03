import React from "react";

export default function Contact() {
  return (
    <div className="min-h-screen py-16 bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <h1 className="text-3xl font-bold"><span className="gradient-text">Contact</span></h1>
        <p className="text-slate-300 text-sm leading-relaxed">
          We’re a small team and manage inbound requests through email. For access,
          enterprise features, or anything urgent, reach us directly at
          <a href="mailto:team@quantpulse.ai" className="text-blue-400 hover:underline ml-1">team@quantpulse.ai</a>.
        </p>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-3 text-sm text-slate-300">
          <div>
            <span className="font-semibold text-slate-100">Support window</span>: 09:00–18:00 UTC, Monday–Friday. We try to respond within one business day.
          </div>
          <div>
            <span className="font-semibold text-slate-100">What to include</span>: a short description of your use case, the email associated with your Supabase account (if different), and any specific data you need.
          </div>
          <div>
            <span className="font-semibold text-slate-100">Security note</span>: never email secrets or API keys. For access provisioning we’ll follow up with a secure channel if needed.
          </div>
        </div>
      </div>
    </div>
  );
}
