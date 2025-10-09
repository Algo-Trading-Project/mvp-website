import React, { useState } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import "./docs.css";
import { createPageUrl } from "@/utils";
import spec from "@/docs/quantpulseOpenApi.js";
import { KeyRound, Globe, BookOpen, ArrowUpRight } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import atomDark from "react-syntax-highlighter/dist/esm/styles/prism/atom-dark";

const HERO_STEPS = [
  {
    icon: KeyRound,
    title: "QuantPulse API Key",
    description:
      "Generate from Account → API Access. Every request includes this value as `x-api-key`.",
    badge: "Header",
  },
  {
    icon: Globe,
    title: "Base URL",
    description:
      "All endpoints live under https://inqzohpvxfidvcphjnzf.supabase.co/functions/v1. Combine with the paths below.",
    badge: "Server",
  },
];

const sampleCurl = `curl -s --request GET \\
  --url "https://inqzohpvxfidvcphjnzf.supabase.co/functions/v1/latest" \\
  --header "x-api-key: YOUR_PRODUCT_API_KEY"`;

const ENDPOINT_SAMPLE_CONFIG = [
  {
    id: "latest",
    title: "Latest Predictions",
    method: "GET",
    path: "/latest",
    queryHint: "",
  },
  {
    id: "predictions",
    title: "Historical Predictions",
    method: "GET",
    path: "/predictions",
    queryHint: "?start_date=2025-08-31&end_date=2025-08-31&tokens=1000SATS_USDT_BINANCE",
  },
  {
    id: "ohlcv",
    title: "OHLCV",
    method: "GET",
    path: "/ohlcv",
    queryHint: "?token=1000SATS_USDT_BINANCE&start_date=2025-08-31&end_date=2025-08-31",
  },
  {
    id: "universe",
    title: "Universe",
    method: "GET",
    path: "/universe",
    queryHint: "",
  },
];

const buildCodeSamples = () => {
  const baseUrl = "https://inqzohpvxfidvcphjnzf.supabase.co/functions/v1";
  const pythonBaseHeaders = `headers = {
    "x-api-key": "YOUR_PRODUCT_API_KEY"
}`;
  const jsHeaders = `const headers = {
  "x-api-key": "YOUR_PRODUCT_API_KEY"
};`;

  const samples = {};

  ENDPOINT_SAMPLE_CONFIG.forEach((endpoint) => {
    const url = `${baseUrl}${endpoint.path}`;

    const curl = [
      `curl -s --request ${endpoint.method}`,
      `  --url "${url}${endpoint.queryHint}"`,
      `  --header "x-api-key: YOUR_PRODUCT_API_KEY"`,
    ]
      .filter(Boolean)
      .join("\n");

    let pythonSnippet = "";
    if (endpoint.id === "predictions") {
      pythonSnippet = `import requests

url = "${url}"
params = {
    "start_date": "2025-08-31",
    "end_date": "2025-08-31",
    "tokens": "1000SATS_USDT_BINANCE"
}
${pythonBaseHeaders}

response = requests.get(url, headers=headers, params=params)
print(response.json())`;
    } else if (endpoint.id === "ohlcv") {
      pythonSnippet = `import requests

url = "${url}"
params = {
    "token": "1000SATS_USDT_BINANCE",
    "start_date": "2025-08-31",
    "end_date": "2025-08-31"
}
${pythonBaseHeaders}

response = requests.get(url, headers=headers, params=params)
print(response.json())`;
    } else {
      pythonSnippet = `import requests

url = "${url}"
${pythonBaseHeaders}

response = requests.get(url, headers=headers)
print(response.json())`;
    }

    let jsSnippet = "";
    if (endpoint.id === "predictions") {
      jsSnippet = `const url = "${url}";
${jsHeaders}

const params = new URLSearchParams({
  start_date: "2025-08-31",
  end_date: "2025-08-31",
  tokens: "1000SATS_USDT_BINANCE"
});

const response = await fetch(\`\${url}?\${params.toString()}\`, {
  method: "${endpoint.method}",
  headers
});

const data = await response.json();
console.log(data);`;
    } else if (endpoint.id === "ohlcv") {
      jsSnippet = `const url = "${url}";
${jsHeaders}

const params = new URLSearchParams({
  token: "1000SATS_USDT_BINANCE",
  start_date: "2025-08-31",
  end_date: "2025-08-31"
});

const response = await fetch(\`\${url}?\${params.toString()}\`, {
  method: "${endpoint.method}",
  headers
});

const data = await response.json();
console.log(data);`;
    } else {
      jsSnippet = `const url = "${url}";
${jsHeaders}

const response = await fetch(url, {
  method: "${endpoint.method}",
  headers
});

const data = await response.json();
console.log(data);`;
    }

    samples[endpoint.id] = {
      curl,
      python: pythonSnippet,
      javascript: jsSnippet,
    };
  });

  return samples;
};

const CODE_SAMPLES = buildCodeSamples();

function CodeTabGroup({ endpointId }) {
  const [active, setActive] = useState("curl");
  const [copyLabel, setCopyLabel] = useState("Copy");
  const tabs = [
    { id: "curl", label: "cURL" },
    { id: "python", label: "Python" },
    { id: "javascript", label: "JavaScript" },
  ];

  const handleCopy = () => {
    const text = CODE_SAMPLES[endpointId][active];
    navigator.clipboard.writeText(text).then(() => {
      setCopyLabel("Copied");
      setTimeout(() => setCopyLabel("Copy"), 2000);
    });
  };

  const languageMap = {
    curl: "bash",
    python: "python",
    javascript: "javascript",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900/70 p-1 text-xs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-3 py-1 rounded-md transition-colors ${
                active === tab.id
                  ? "bg-blue-500 text-white"
                  : "text-slate-400 hover:text-white hover:bg-blue-500/10"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className="text-xs font-medium text-blue-200 hover:text-white border border-blue-500/40 rounded-md px-3 py-1 bg-blue-500/10 transition-colors"
        >
          {copyLabel}
        </button>
      </div>
      <SyntaxHighlighter
        language={languageMap[active]}
        style={atomDark}
        customStyle={{
          background: "rgba(15, 23, 42, 0.95)",
          borderRadius: "0.75rem",
          border: "1px solid #1e293b",
          padding: "1rem",
          fontSize: "0.85rem",
          margin: 0,
          marginTop: "1.25rem",
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono, 'Fira Code', monospace')" } }}
      >
        {CODE_SAMPLES[endpointId][active]}
      </SyntaxHighlighter>
    </div>
  );
}

export default function Docs() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20 lg:py-24">
          <div className="flex flex-col gap-10">
            <div className="space-y-6 max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">
                <BookOpen className="w-4 h-4" />
                API Reference
              </span>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
                QuantPulse <span className="gradient-text">Signals API</span>
              </h1>
              <p className="text-slate-300 text-lg leading-relaxed">
                Explore the REST surface for predictions, OHLCV, and the tradable universe. The Swagger
                panel below includes every endpoint, parameter, schema, and response code—mirroring the
                interface you would expect from SwaggerUI / OpenAPI tooling.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {HERO_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.title}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3 shadow-lg shadow-slate-950/40"
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="w-5 h-5 text-blue-300" />
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/80">
                        {step.badge}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold text-white">{step.title}</h2>
                    <p className="text-sm text-slate-400 leading-relaxed">{step.description}</p>
                  </div>
                );
              })}
            </div>
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                Run your first request via cURL (replace placeholders with your credentials):
              </p>
              <pre className="font-mono text-xs sm:text-sm bg-slate-900/70 border border-slate-800 rounded-lg px-4 py-3 overflow-x-auto text-slate-100">
                {sampleCurl}
              </pre>
              <p className="text-xs text-slate-500">
                Need help locating keys? See{" "}
                <a
                  href={createPageUrl("Account")}
                  className="text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"
                >
                  Account → API Access <ArrowUpRight className="w-3 h-3" />
                </a>{" "}
                or contact support@quantpulse.ai.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-10 lg:py-14">
        <div className="space-y-8 mb-10">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">
              <BookOpen className="w-4 h-4" />
              Code Examples
            </div>
            <h2 className="text-2xl font-semibold text-white">Quick examples by endpoint</h2>
            <p className="text-sm text-slate-400 max-w-3xl">
              Choose your preferred runtime—cURL, Python requests, or native fetch. Each snippet uses the
              single required header (`x-api-key`).
            </p>
          </div>
          <div className="grid gap-6">
            {ENDPOINT_SAMPLE_CONFIG.map((endpoint) => (
              <div
                key={endpoint.id}
                className="border border-slate-800 rounded-xl bg-slate-900/70 p-6 space-y-4 shadow-lg shadow-slate-950/40"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/80">
                      {endpoint.method} {endpoint.path}
                    </p>
                    <h3 className="text-lg text-white">{endpoint.title}</h3>
                  </div>
                </div>
                <CodeTabGroup endpointId={endpoint.id} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-xl shadow-slate-950/40 bg-slate-950">
          <SwaggerUI spec={spec} docExpansion="list" defaultModelsExpandDepth={0} />
        </div>
      </section>
    </div>
  );
}
