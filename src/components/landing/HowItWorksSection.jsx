
import React from "react";
import { Cpu, Zap, Rocket } from "lucide-react";

export default function HowItWorksSection() {
  const steps = [
    {
      icon: Cpu,
      title: "1. We Collect & Normalize Data",
      description: "Clean OHLCV (1m–1d) and optional tick/trade feeds across major assets and venues."
    },
    {
      icon: Zap,
      title: "2. We Train & Publish Signals",
      description: "Daily ML signals with public OOS verification—ranks, scores, and decile spreads."
    },
    {
      icon: Rocket,
      title: "3. You Build & Execute",
      description: "Access via APIs and files—use signals directly or build systems on our data."
    }
  ];

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">
            A Simple, Powerful Workflow
          </h2>
          <p className="text-slate-300 text-lg mb-12">
            We do the heavy lifting so you can focus on execution.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 text-center">
          {steps.map((step, index) => (
            <div key={index} className="p-8 glass rounded-xl">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <step.icon className="w-8 h-8 text-blue-300" />
              </div>
              <h3 className="font-semibold text-xl mb-3">{step.title}</h3>
              <p className="text-slate-400">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
