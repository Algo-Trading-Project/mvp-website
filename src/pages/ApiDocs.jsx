import React from "react";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

export default function ApiDocs() {
  return (
    <div className="min-h-screen py-10 bg-slate-950 text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">API Documentation (Preview)</h1>
          <p className="text-slate-400 mt-2">This is a lightweight foundation for the public API. Endpoints shown below are examples — final paths may change at launch.</p>
        </div>

        <section className="bg-slate-900/60 border border-slate-800 rounded-lg p-5">
          <h2 className="text-xl font-semibold mb-2">Authentication</h2>
          <p className="text-slate-300 text-sm">Requests use a bearer token. Pass your API key in the <code>Authorization: Bearer &lt;key&gt;</code> header.</p>
        </section>

        <section className="bg-slate-900/60 border border-slate-800 rounded-lg p-5">
          <h2 className="text-xl font-semibold mb-2">Signals endpoint</h2>
          <pre className="bg-slate-950/70 border border-slate-800 rounded p-3 text-xs overflow-auto">{`GET /v1/signals?date=YYYY-MM-DD&universe=top100
Response 200
[
  { "symbol_id": "BTC_USDT_BINANCE", "rank": 1, "score": 0.0123 },
  { "symbol_id": "ETH_USDT_BINANCE", "rank": 2, "score": 0.0101 }
]`}</pre>
          <p className="text-slate-400 text-xs mt-2">Fields: <code>symbol_id</code> (string), <code>rank</code> (int, 1=best), <code>score</code> (float, model prediction).</p>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-5">
            <h3 className="font-semibold mb-2">Python</h3>
            <pre className="bg-slate-950/70 border border-slate-800 rounded p-3 text-xs overflow-auto">{`import requests

API_KEY = "your_key"
resp = requests.get(
  "https://api.quantpulse.ai/v1/signals",
  headers={"Authorization": f"Bearer {API_KEY}"},
  params={"date": "2025-08-25", "universe": "top100"}
)
resp.raise_for_status()
signals = resp.json()
print(signals[:5])`}</pre>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-5">
            <h3 className="font-semibold mb-2">Node.js</h3>
            <pre className="bg-slate-950/70 border border-slate-800 rounded p-3 text-xs overflow-auto">{`import fetch from "node-fetch";

const API_KEY = process.env.QP_API_KEY;
const url = new URL("https://api.quantpulse.ai/v1/signals");
url.searchParams.set("date", "2025-08-25");
url.searchParams.set("universe", "top100");

const res = await fetch(url, { headers: { Authorization: 'Bearer ' + API_KEY } });
if (!res.ok) throw new Error('HTTP ' + res.status);
const json = await res.json();
console.log(json.slice(0, 5));`}</pre>
          </div>
        </section>

        <section className="bg-slate-900/60 border border-slate-800 rounded-lg p-5">
          <h2 className="text-xl font-semibold mb-2">Quickstart Notebook</h2>
          <p className="text-slate-300 text-sm">A Colab/Jupyter notebook will be available at launch to fetch signals, compute deciles, and visualize performance. For now, see code samples above and our Methodology for metric definitions.</p>
          <p className="text-slate-400 text-xs mt-2">Have feedback? <Link to={createPageUrl("Contact")} className="text-blue-400 hover:underline">Contact us</Link>.</p>
        </section>
      </div>
    </div>
  );
}
