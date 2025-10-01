import React from "react";
import { Code2, Download, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const codeExample = `curl -L https://your-api.quantpulse.ai/predictions/latest \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -o predictions.csv

python - <<'PY'
import pandas as pd

signals = pd.read_csv('predictions.csv')
longs = signals.nlargest(10, 'y_pred')['symbol']
shorts = signals.nsmallest(10, 'y_pred')['symbol']
print('Go long:', ', '.join(longs))
print('Short:', ', '.join(shorts))
PY`;

const steps = [
  {
    title: "1. Grab yesterday's file",
    description: "Download a free CSV with ~40 assets — no login required.",
    icon: Download,
    cta: {
      label: "Download sample CSV",
      href: "/sample-signals.csv",
      external: true,
    },
  },
  {
    title: "2. Call the API",
    description: "Use the auto-issued API key to stream the full universe at 13:00 UTC.",
    icon: Zap,
    cta: {
      label: "See API docs",
      href: "Docs",
    },
  },
  {
    title: "3. Backtest in minutes",
    description: "Copy the ready-made notebook snippet to rank, bucket, and plot PnL.",
    icon: Code2,
    cta: {
      label: "Open Quickstart",
      href: "GetStarted",
    },
  },
];

export default function QuickstartSection() {
  return (
    <section className="bg-slate-950 border-t border-slate-900 py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-10">
          <div className="lg:w-1/2">
            <h2 className="text-3xl font-semibold text-white mb-4">Try it in 5 minutes</h2>
            <p className="text-slate-300 mb-6">
              Ship an evaluation workflow without meetings or NDAs. Download a free sample, call the live API, and run a decile backtest in one sitting.
            </p>
            <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4 text-sm text-slate-200 font-mono overflow-x-auto">
              <pre className="whitespace-pre-wrap leading-relaxed">{codeExample}</pre>
            </div>
          </div>
          <div className="lg:w-1/2 grid sm:grid-cols-2 gap-6">
            {steps.map((step) => (
              <div key={step.title} className="bg-slate-900/60 border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
                <div>
                  <step.icon className="w-5 h-5 text-emerald-400 mb-3" />
                  <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-slate-300 mb-4">{step.description}</p>
                </div>
                {step.cta ? (
                  step.cta.external ? (
                    <Button asChild variant="secondary" size="sm" className="w-fit">
                      <a href={step.cta.href} target="_blank" rel="noreferrer">
                        {step.cta.label}
                      </a>
                    </Button>
                  ) : (
                    <Button asChild variant="secondary" size="sm" className="w-fit">
                      <Link to={createPageUrl(step.cta.href)}>{step.cta.label}</Link>
                    </Button>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
