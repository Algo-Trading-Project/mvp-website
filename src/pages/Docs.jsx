
import React from 'react';
import {
  FileText,
  Database,
  TrendingUp,
  KeyRound,
  Code
} from 'lucide-react';
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const CodeBlock = ({ children, lang }) => (
  <div className="relative my-4">
    <pre className="bg-slate-950 text-slate-200 rounded-md p-4 text-sm overflow-x-auto border border-slate-700">
      <code>{children}</code>
    </pre>
    {lang && (
      <div className="absolute top-2 right-2 text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-sm">
        {lang}
      </div>
    )}
  </div>
);

export default function Docs() {
  return (
    <div className="min-h-screen py-8 bg-slate-950">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-2">
            <span className="gradient-text">API Documentation</span>
          </h1>
          <p className="text-slate-300">
            Integrate our alpha-vetted data and proven signals into your workflow.
          </p>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-8">
          {/* Sidebar TOC */}
          <aside className="hidden lg:block sticky top-24 h-max">
            <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
              <h3 className="text-sm font-semibold text-slate-200 mb-3">Table of Contents</h3>
              <nav className="space-y-2 text-sm">
                <a href="#overview" className="block text-slate-400 hover:text-white">Overview</a>
                <a href="#authentication" className="block text-slate-400 hover:text-white">Authentication</a>
                <a href="#rate-limits" className="block text-slate-400 hover:text-white">Rate Limits</a>
                <a href="#schemas" className="block text-slate-400 hover:text-white">Schemas</a>
                <a href="#data-api" className="block text-slate-400 hover:text-white">Data API</a>
                <a href="#signals-api" className="block text-slate-400 hover:text-white">Signals API</a>
                <a href="#quickstart" className="block text-slate-400 hover:text-white">Quickstart Code</a>
                <a href="#faq" className="block text-slate-400 hover:text-white">FAQ</a>
                <a href="#changelog" className="block text-slate-400 hover:text-white">Changelog</a>
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="space-y-8">
            <section id="overview" className="bg-slate-900 border border-slate-800 rounded-md">
              <div className="p-6 border-b border-slate-800">
                <h2 className="flex items-center space-x-2 text-xl font-semibold">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <span>Overview</span>
                </h2>
              </div>
              <div className="p-6 space-y-4 text-slate-300 text-sm leading-relaxed">
                <p>Our API is designed to be simple and powerful, providing access to two core products:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Data API:</strong> Access the clean, curated historical datasets that power our proprietary models. Perfect for research, backtesting, and building your own alpha.</li>
                  <li><strong>Signals API:</strong> Get daily predictions from our 1‑day regression model. Integrate our alpha directly into your trading strategies.</li>
                </ul>
                <p>The base URL for all endpoints is: <code className="bg-slate-800 text-amber-300 px-1 rounded-sm">https://api.quantpulse.ai/v1</code></p>
              </div>
            </section>

            <section id="authentication" className="bg-slate-900 border border-slate-800 rounded-md">
              <div className="p-6 border-b border-slate-800">
                <h2 className="flex items-center space-x-2 text-xl font-semibold">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                  <span>Authentication</span>
                </h2>
              </div>
              <div className="p-6 space-y-4 text-slate-300 text-sm leading-relaxed">
                <p>All API requests must be authenticated using a Bearer token. You can find your API key on your <Link to={createPageUrl('Account')} className="text-blue-400 hover:underline">Account page</Link>.</p>
                <p>Include your API key in the Authorization header of your request:</p>
                <CodeBlock>{"Authorization: Bearer YOUR_API_KEY"}</CodeBlock>
              </div>
            </section>

            <section id="rate-limits" className="bg-slate-900 border border-slate-800 rounded-md">
              <div className="p-6 border-b border-slate-800">
                <h2 className="text-xl font-semibold">Rate Limits</h2>
              </div>
              <div className="p-6 text-slate-300 text-sm leading-relaxed">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Lite: 60 requests/hour</li>
                  <li>Pro: 600 requests/hour</li>
                  <li>API: 3,000 requests/hour + webhooks</li>
                </ul>
                <p className="text-xs text-slate-500 mt-2">Contact us for custom limits on Team/Enterprise plans.</p>
              </div>
            </section>

            <section id="schemas" className="bg-slate-900 border border-slate-800 rounded-md">
              <div className="p-6 border-b border-slate-800">
                <h2 className="text-xl font-semibold">Schemas</h2>
              </div>
              <div className="p-6 text-slate-300 text-sm leading-relaxed">
                <p>Core objects returned by the API:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Prediction</strong>: {"{ date, symbol, rank, score, percentile }"}</li>
                  <li><strong>OHLCV</strong>: {"{ date, symbol, open, high, low, close, volume }"}</li>
                </ul>
              </div>
            </section>

            <section id="data-api" className="bg-slate-900 border border-slate-800 rounded-md">
              <div className="p-6 border-b border-slate-800">
                <h2 className="flex items-center space-x-2 text-xl font-semibold">
                  <Database className="w-5 h-5 text-cyan-400" />
                  <span>Data API</span>
                </h2>
              </div>
              <div className="p-6 space-y-4 text-slate-300 text-sm leading-relaxed">
                <h4 className="font-semibold text-base">Get Historical OHLCV</h4>
                <p><code className="bg-slate-800 text-emerald-300 px-1 rounded-sm">GET /data/ohlcv</code></p>
                <p>Retrieves historical daily OHLCV data for a given symbol.</p>
                <h5 className="font-semibold pt-2">Parameters</h5>
                <ul className="list-disc pl-5 space-y-1">
                  <li><code className="text-slate-200">symbol</code> (string, required): The ticker symbol (e.g., 'BTC-USD').</li>
                  <li><code className="text-slate-200">start_date</code> (string, optional): Start date in YYYY-MM-DD format.</li>
                  <li><code className="text-slate-200">end_date</code> (string, optional): End date in YYYY-MM-DD format.</li>
                </ul>
                <h5 className="font-semibold pt-2">Example Response</h5>
                <CodeBlock lang="JSON">{`[
  {
    "date": "2023-10-27",
    "open": 34150.5,
    "high": 34500.0,
    "low": 33800.0,
    "close": 34450.2,
    "volume": 25000.5
  },
  ...
]`}</CodeBlock>
              </div>
            </section>

            <section id="signals-api" className="bg-slate-900 border border-slate-800 rounded-md">
              <div className="p-6 border-b border-slate-800">
                <h2 className="flex items-center space-x-2 text-xl font-semibold">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                  <span>Signals API</span>
                </h2>
              </div>
              <div className="p-6 space-y-4 text-slate-300 text-sm leading-relaxed">
                <h4 className="font-semibold text-base">Get Latest Signals</h4>
                <p><code className="bg-slate-800 text-emerald-300 px-1 rounded-sm">GET /signals/latest</code></p>
                <p>Retrieves the latest daily signal outputs, including ranks and scores for all assets in the universe.</p>
                <h5 className="font-semibold pt-2">Example Response</h5>
                <CodeBlock lang="JSON">{`{
  "signal_date": "2023-10-28",
  "model_version": "1d_regression_v1.0",
  "signals": [
    {
      "symbol": "SOL-USD",
      "rank": 1,
      "score": 0.085,
      "percentile": 99.7
    },
    {
      "symbol": "AVAX-USD",
      "rank": 2,
      "score": 0.072,
      "percentile": 99.4
    },
    ...
  ]
}`}</CodeBlock>
              </div>
            </section>

            <section id="quickstart" className="bg-slate-900 border border-slate-800 rounded-md">
              <div className="p-6 border-b border-slate-800">
                <h2 className="flex items-center space-x-2 text-xl font-semibold">
                  <Code className="w-5 h-5 text-emerald-400" />
                  <span>Quickstart Code</span>
                </h2>
              </div>
              <div className="p-6 space-y-4 text-slate-300 text-sm leading-relaxed">
                <h4 className="font-semibold text-base">Python (Requests)</h4>
                <CodeBlock lang="Python">{`import requests

API_KEY = 'YOUR_API_KEY'
BASE_URL = 'https://api.quantpulse.ai/v1'

headers = {'Authorization': f'Bearer {API_KEY}'}
response = requests.get(f'{BASE_URL}/signals/latest', headers=headers)

if response.status_code == 200:
    print(response.json())
else:
    print(f"Error: {response.status_code}")`}</CodeBlock>

                <h4 className="font-semibold text-base">JavaScript (Fetch)</h4>
                <CodeBlock lang="JavaScript">{`const apiKey = 'YOUR_API_KEY';
const url = 'https://api.quantpulse.ai/v1/signals/latest';

fetch(url, {
  headers: {
    'Authorization': \`Bearer \${apiKey}\`
  }
})
.then(response => {
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
})
.then(data => console.log(data))
.catch(error => console.error('Fetch error:', error));`}</CodeBlock>
              </div>
            </section>
            
            <section id="faq" className="bg-slate-900 border border-slate-800 rounded-md">
              <div className="p-6 border-b border-slate-800">
                <h2 className="text-xl font-semibold">FAQ</h2>
              </div>
              <div className="p-6 text-slate-300 text-sm leading-relaxed">
                <p><strong>Do you backfill or overwrite history?</strong> No — every daily prediction is snapshotted and retained.</p>
                <p className="mt-2"><strong>How do you measure performance?</strong> Rank IC/ICIR with rolling windows, plus fee‑adjusted decile spreads.</p>
              </div>
            </section>

            <section id="changelog" className="bg-slate-900 border border-slate-800 rounded-md">
              <div className="p-6 border-b border-slate-800">
                <h2 className="text-xl font-semibold">Changelog</h2>
              </div>
              <div className="p-6 text-slate-300 text-sm leading-relaxed">
                <ul className="list-disc pl-5 space-y-1">
                  <li>[2025-02-01] Added pricing bundles and public OOS stats on Home.</li>
                  <li>[2025-01-28] Signals repository with date‑range downloads.</li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
