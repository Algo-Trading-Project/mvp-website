import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_FUNCTION_URL,
  API_DEBUG,
} from "./config.js";
import { ApiError } from "./errors.js";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase environment variables are not fully configured. Dynamic data will fail without them.");
}

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      functions: SUPABASE_FUNCTION_URL ? { url: SUPABASE_FUNCTION_URL } : undefined,
    })
  : null;

const ensureClient = () => {
  if (!supabase) {
    throw new ApiError("Supabase client is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
};

const invokeFunction = (name) => async (payload = {}, { signal } = {}) => {
  const client = ensureClient();
  const { data, error } = await client.functions.invoke(name, {
    body: payload,
    signal,
  });
  if (error) {
    throw new ApiError(error.message || `Supabase function ${name} failed`, {
      status: error.status ?? 500,
      data: error,
    });
  }
  return data;
};

const createTableClient = (table) => ({
  async list({ select = "*", signal } = {}) {
    const client = ensureClient();
    let query = client.from(table).select(select);
    if (signal && query.abortSignal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) {
      throw new ApiError(`supabase.from(${table}).select failed`, { status: error.code, data: error });
    }
    return data ?? [];
  },
  async filter(criteria = {}, sortKey, limit, { signal } = {}) {
    const client = ensureClient();
    let query = client.from(table).select("*");
    Object.entries(criteria || {}).forEach(([column, value]) => {
      if (value === undefined || value === null) return;
      query = query.eq(column, value);
    });
    if (sortKey) {
      const ascending = !String(sortKey).startsWith("-");
      const column = ascending ? sortKey : String(sortKey).slice(1);
      query = query.order(column, { ascending });
    }
    if (limit) {
      query = query.limit(limit);
    }
    if (signal && query.abortSignal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) {
      throw new ApiError(`supabase.from(${table}).filter failed`, { status: error.code, data: error });
    }
    return data ?? [];
  },
  async create(payload, { signal } = {}) {
    const client = ensureClient();
    let query = client.from(table).insert(payload).select();
    if (signal && query.abortSignal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) {
      throw new ApiError(`supabase.from(${table}).insert failed`, { status: error.code, data: error });
    }
    return Array.isArray(data) ? data : data ? [data] : [];
  },
});

const authClient = {
  async me() {
    const client = ensureClient();
    const { data, error } = await client.auth.getUser();
    if (error) {
      if (API_DEBUG) console.warn("supabase.auth.getUser failed", error);
      return null;
    }
    return data.user ?? null;
  },
  async loginWithRedirect() {
    throw new ApiError("Supabase auth redirect is not implemented. Integrate Supabase Auth UI or OAuth flows as needed.");
  },
  async updateMyUserData() {
    throw new ApiError("Supabase auth profile updates are not implemented.");
  },
  async logout() {
    const client = ensureClient();
    const { error } = await client.auth.signOut();
    if (error) {
      throw new ApiError("Failed to sign out", { data: error });
    }
  },
};

const functionMap = {
  fetchMetrics: "fetch-metrics",
  getLatestPredictions: "get-latest-predictions",
  rollingIcPlot: "rolling-ic-plot",
  rollingSpreadPlot: "rolling-spread-plot",
  quintileReturnsPlot: "quintile-returns-plot",
  rollingHitRatePlot: "rolling-hit-rate-plot",
  icBySymbolPlot: "ic-by-symbol-plot",
  icDistributionPlot: "ic-distribution-plot",
  bootstrapIcDistributionPlot: "bootstrap-ic-distribution-plot",
  predictionsCoverage: "predictions-coverage",
};

const functionsClient = Object.fromEntries(
  Object.entries(functionMap).map(([logical, supabaseName]) => [logical, invokeFunction(supabaseName)])
);

const entityTableMap = {
  EmailCapture: "email_captures",
  ContactSubmission: "contact_submissions",
  predictions: "predictions",
  spot_ohlcv_1d: "spot_ohlcv_1d",
  symbol_ids: "symbol_ids",
  cross_sectional_metrics_1d: "cross_sectional_metrics_1d",
  monthly_performance_metrics: "monthly_performance_metrics",
};

const entitiesClient = Object.fromEntries(
  Object.entries(entityTableMap).map(([logical, table]) => [logical, createTableClient(table)])
);

export const base44 = {
  functions: functionsClient,
  entities: entitiesClient,
  auth: authClient,
  integrations: {},
};

export const apiRuntimeMode = "supabase";
