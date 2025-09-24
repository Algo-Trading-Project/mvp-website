import React from "react";

export default function About() {
  return (
    <div className="min-h-screen py-16 bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3"><span className="gradient-text">About QuantPulse</span></h1>
          <p className="text-slate-300 max-w-2xl mx-auto">
            We build quant-grade crypto signals with a relentless focus on evidence, risk, and transparency.
          </p>
        </header>

        {/* Mission */}
        <section className="glass rounded-xl p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-3">Our Mission</h2>
          <p className="text-slate-300 leading-relaxed">
            Democratize institutional-quality alpha for crypto traders. We believe robust research
            and disciplined execution beat hype. QuantPulse ships daily, out-of-sample validated
            signals and analytics designed to be practical, auditable, and actionable.
          </p>
        </section>

        {/* Approach */}
        <section className="glass rounded-xl p-6">
          <h2 className="text-2xl font-semibold mb-3">Our Approach</h2>
          <p className="text-slate-300 leading-relaxed">
            We combine technical, on-chain, and market microstructure features into a multi-factor ML model.
            Our system is documented end-to-end with methodology and data formats available for review.
            We emphasize transparency through live, verifiable performance reporting.
          </p>
        </section>
      </div>
    </div>
  );
}