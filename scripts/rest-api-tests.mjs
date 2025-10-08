#!/usr/bin/env node

/**
 * REST API smoke tests for Supabase Edge Functions.
 *
 * Environment:
 *   REST_API_BASE_URL  - base URL to the deployed functions (e.g. https://xyz.functions.supabase.co)
 *   SUPABASE_FUNCTION_URL - fallback base URL (used if REST_API_BASE_URL not set)
 *   TEST_API_KEY       - QuantPulse product API key for the account used to auth requests
 *
 * Usage:
 *   TEST_API_KEY=... REST_API_BASE_URL=https://... npm run test:rest
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const defaultEnvPath = resolve(process.cwd(), "supabase/.env.example");
const envPath = process.env.REST_API_ENV_PATH || defaultEnvPath;

try {
  const file = readFileSync(envPath, "utf8");
  for (const line of file.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
} catch (error) {
  if (envPath !== defaultEnvPath) {
    console.warn(`Unable to read env file at ${envPath}:`, error.message);
  }
}

const derivedFunctionUrl = (() => {
  const explicit = process.env.SUPABASE_FUNCTION_URL;
  if (explicit) return explicit;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) return null;
  const trimmed = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl;
  return `${trimmed}/functions/v1/`;
})();

const baseUrl = process.env.REST_API_BASE_URL || derivedFunctionUrl;

const apiKey =
  process.env.TEST_API_KEY ||
  process.env.QUANTPULSE_TEST_API_KEY ||
  process.env.QP_TEST_API_KEY ||
  null;

const functionAuthToken =
  process.env.REST_API_AUTH_TOKEN ||
  process.env.SUPABASE_FUNCTION_BEARER ||
  process.env.SUPABASE_ANON_KEY ||
  null;

if (!baseUrl) {
  console.error(
    "Missing REST API base URL. Set REST_API_BASE_URL or SUPABASE_FUNCTION_URL (or SUPABASE_URL in supabase/.env.example).",
  );
  process.exit(1);
}

if (!apiKey) {
  console.error(
    "Missing product API key. Set TEST_API_KEY or QUANTPULSE_TEST_API_KEY (populate supabase/.env.example).",
  );
  process.exit(1);
}

const expectedApiKeyHash = createHash("sha256").update(apiKey).digest("hex");

const logApiKeyValidation = (label, metadata) => {
  const hash = metadata?.api_key_hash ?? null;
  const match = hash ? hash === expectedApiKeyHash : false;
  console.log(
    `[${label}] api_key_hash=${hash ?? "null"} match=${match ? "true" : "false"}`,
  );
  return { hash, match };
};

const results = [];

const capture = async (label, fn) => {
  const started = Date.now();
  try {
    const payload = await fn();
    results.push({ label, ok: true, duration: Date.now() - started, payload });
  } catch (error) {
    results.push({ label, ok: false, duration: Date.now() - started, error });
  }
};

const requestJson = async (path, params = {}) => {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (params.query) {
    for (const [key, value] of Object.entries(params.query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, value);
    }
  }

const headers = {
  "x-api-key": apiKey,
};
if (functionAuthToken) {
  headers.Authorization = `Bearer ${functionAuthToken}`;
}

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Non-JSON response (${response.status}): ${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    const message = json?.error || `Request failed with status ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.body = json;
    throw err;
  }

  return json;
};

let latestSnapshot = null;
let universeTokens = [];

await capture("GET /latest", async () => {
  const json = await requestJson("latest");
  if (!json || typeof json !== "object") {
    throw new Error("Missing JSON payload");
  }
  if (!Array.isArray(json.rows)) {
    throw new Error("Expected rows array");
  }
  if (json.rows.length === 0) {
    console.warn("Warning: /latest returned zero rows.");
  }
  logApiKeyValidation("/latest", json.metadata);
  latestSnapshot = json;
  return {
    rows: json.rows.length,
    date: json.date ?? null,
    sampleSymbol: json.rows[0]?.symbol_id ?? null,
    api_key_hash: json.metadata?.api_key_hash ?? null,
    api_key_match: json.metadata?.api_key_hash === expectedApiKeyHash,
  };
});

await capture("GET /universe", async () => {
  const json = await requestJson("universe");
  if (!json || typeof json !== "object") {
    throw new Error("Missing JSON payload");
  }
  if (!Array.isArray(json.tokens)) {
    throw new Error("Expected tokens array");
  }
  const rawTokens = json.tokens;
  const normalizedTokens = rawTokens.map((token) => String(token).trim().toUpperCase());
  universeTokens = normalizedTokens;
  const validation = logApiKeyValidation("/universe", json.metadata);
  if (process.env.DEBUG_REST_TESTS && latestSnapshot?.rows?.length) {
    const expectedRaw = String(latestSnapshot.rows[0].symbol_id ?? "").trim();
    console.log("Universe contains raw expected:", rawTokens.includes(expectedRaw));
  }
  if (process.env.DEBUG_REST_TESTS) {
    console.log("Universe sample tokens:", universeTokens.slice(0, 5));
  }
  if (latestSnapshot?.rows?.length) {
    const firstSymbol = String(latestSnapshot.rows[0].symbol_id ?? "")
      .trim()
      .toUpperCase();
    if (firstSymbol && !universeTokens.includes(firstSymbol)) {
      throw new Error(`Universe missing expected token ${firstSymbol}`);
    }
  }
  return {
    tokens: json.tokens.length,
    api_key_hash: validation.hash,
    api_key_match: validation.match,
  };
});

await capture("GET /predictions", async () => {
  const startDate = latestSnapshot?.date;
  const endDate = latestSnapshot?.date;
  if (!startDate || !endDate) {
    console.warn("Skipping narrow prediction checks – unable to infer latest date.");
  }

  const firstSymbolRaw = latestSnapshot?.rows?.[0]?.symbol_id ?? universeTokens?.[0] ?? null;
  const firstSymbol = firstSymbolRaw ? String(firstSymbolRaw).trim().toUpperCase() : null;
  const query = {
    start_date: startDate,
    end_date: endDate,
  };
  if (firstSymbolRaw) {
    query.tokens = firstSymbolRaw;
  }
  const json = await requestJson("predictions", { query });
  if (!json || typeof json !== "object") {
    throw new Error("Missing JSON payload");
  }
  if (!Array.isArray(json.rows)) {
    throw new Error("Expected rows array");
  }
  const validation = logApiKeyValidation("/predictions", json.metadata);
  if (firstSymbol) {
    const hasSymbol = json.rows.some(
      (row) => String(row.symbol_id ?? '').trim().toUpperCase() === firstSymbol,
    );
    if (!hasSymbol && json.rows.length) {
      throw new Error(`Filtered predictions response missing token ${firstSymbol}`);
    }
  }
  return {
    rows: json.rows.length,
    range: json.range ?? null,
    api_key_hash: validation.hash,
    api_key_match: validation.match,
  };
});

await capture("GET /ohlcv", async () => {
  const firstTokenRaw = latestSnapshot?.rows?.[0]?.symbol_id ?? universeTokens?.[0] ?? null;
  const token = firstTokenRaw ? String(firstTokenRaw).trim().toUpperCase() : null;
  const endDate = latestSnapshot?.date ?? null;
  if (!token || !endDate) {
    console.warn("Skipping OHLCV checks – cannot determine token/date from data.");
    return { skipped: true };
  }

  const json = await requestJson("ohlcv", {
    query: {
      token,
      start_date: endDate,
      end_date: endDate,
    },
  });
  if (!json || typeof json !== "object") {
    throw new Error("Missing JSON payload");
  }
  if (!Array.isArray(json.rows)) {
    throw new Error("Expected rows array");
  }
  const validation = logApiKeyValidation("/ohlcv", json.metadata);
  if (json.rows.length) {
    const first = json.rows[0];
    if (!["open", "high", "low", "close", "volume"].every((key) => key in first)) {
      throw new Error("OHLCV row missing expected keys");
    }
  }
  return {
    rows: json.rows.length,
    token,
    api_key_hash: validation.hash,
    api_key_match: validation.match,
  };
});

const failures = results.filter((r) => !r.ok);

results.forEach((result) => {
  if (result.ok) {
    console.log(`✅ ${result.label} (${result.duration}ms)`, result.payload);
  } else {
    console.error(`❌ ${result.label} (${result.duration}ms)`, result.error);
  }
});

if (failures.length) {
  console.error(`\n${failures.length} REST API checks failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll REST API checks passed.");
}
