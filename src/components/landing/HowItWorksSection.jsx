
import React from "react";
import { Cpu, Zap, Rocket } from "lucide-react";

export default function HowItWorksSection() {
  const steps = [
    {
      icon: Cpu,
      title: "1. We Collect & Prepare",
      description: "We collect and process data across many sources to power our research and feature engineering."
    },
    {
      icon: Zap,
      title: "2. We Train & Publish",
      description: "We generate daily ML signals on 1‑day and 3‑day horizons."
    },
    {
      icon: Rocket,
      title: "3. You Build & Execute",
      description: "Use the REST API or manually download our data, then plug into your own systems and research."
    }
  ];

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">
            A Simple, Powerful Workflow
          </h2>
          <p className="text-white text-lg mb-12">
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
              <p className="text-white">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
