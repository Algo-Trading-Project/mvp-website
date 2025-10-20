import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_FUNCTION_URL,
  API_DEBUG,
} from "./config.js";
import { createPageUrl } from "@/utils";
import { ApiError } from "./errors.js";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase environment variables are not fully configured. Dynamic data will fail without them.");
}

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      functions: SUPABASE_FUNCTION_URL ? { url: SUPABASE_FUNCTION_URL } : undefined,
    })
  : null;

const FUNCTION_CACHE_PREFIX = "sb-fn-cache:";
const TABLE_CACHE_PREFIX = "sb-table-cache:";
const functionCacheMemory = new Map();
const tableCacheMemory = new Map();

const computeFunctionCacheKey = (name, payload) => {
  return `${name}:${stableSerialize(payload)}`;
};

const getSessionStorage = () => {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch (err) {
    if (API_DEBUG) console.warn("SessionStorage unavailable", err);
  }
  return null;
};

const stableSerialize = (value) => {
  if (value === undefined) return "undefined";
  const sorter = (key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce((acc, current) => {
          acc[current] = val[current];
          return acc;
        }, {});
    }
    return val;
  };
  return JSON.stringify(value, sorter);
};

const cloneData = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (err) {
      if (API_DEBUG) console.warn("structuredClone failed", err);
    }
  }
  return JSON.parse(JSON.stringify(value));
};

const getCacheEntry = (memoryMap, storagePrefix, key) => {
  if (!key) return null;
  if (memoryMap.has(key)) {
    return cloneData(memoryMap.get(key));
  }
  const storage = getSessionStorage();
  if (!storage) return null;
  const stored = storage.getItem(storagePrefix + key);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    memoryMap.set(key, parsed);
    return cloneData(parsed);
  } catch (err) {
    if (API_DEBUG) console.warn("Failed to parse cache entry", err);
    storage.removeItem(storagePrefix + key);
  }
  return null;
};

const setCacheEntry = (memoryMap, storagePrefix, key, value) => {
  if (!key) return;
  const cloned = cloneData(value);
  memoryMap.set(key, cloned);
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(storagePrefix + key, JSON.stringify(cloned));
  } catch (err) {
    if (API_DEBUG) console.warn("Failed to persist cache entry", err);
  }
};

const clearTableCache = (table) => {
  const pattern = `${table}:`;
  for (const key of Array.from(tableCacheMemory.keys())) {
    if (key.startsWith(pattern)) {
      tableCacheMemory.delete(key);
    }
  }
  const storage = getSessionStorage();
  if (!storage) return;
  const removal = [];
  for (let i = 0; i < storage.length; i++) {
    const storageKey = storage.key(i);
    if (storageKey && storageKey.startsWith(TABLE_CACHE_PREFIX)) {
      const raw = storageKey.slice(TABLE_CACHE_PREFIX.length);
      if (raw.startsWith(pattern)) {
        removal.push(storageKey);
      }
    }
  }
  removal.forEach((key) => storage.removeItem(key));
};

const ensureClient = () => {
  if (!supabase) {
    throw new ApiError("Supabase client is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
};

const invokeFunction = (name) => async (payload = {}, { signal } = {}) => {
  const client = ensureClient();
  const shouldCache = payload.__cache !== false;
  const { __cache, ...requestPayload } = payload || {};
  const cacheKey = shouldCache ? computeFunctionCacheKey(name, requestPayload) : null;

  if (shouldCache) {
    const cached = getCacheEntry(functionCacheMemory, FUNCTION_CACHE_PREFIX, cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  const { data, error } = await client.functions.invoke(name, {
    body: requestPayload && Object.keys(requestPayload).length ? requestPayload : {},
    signal,
  });
  if (error) {
    throw new ApiError(error.message || `Supabase function ${name} failed`, {
      status: error.status ?? 500,
      data: error,
    });
  }
  if (shouldCache && data !== undefined) {
    setCacheEntry(functionCacheMemory, FUNCTION_CACHE_PREFIX, cacheKey, data);
  }
  return data;
};

const createTableClient = (table) => ({
  async list({ select = "*", signal } = {}) {
    const client = ensureClient();
    const cacheKey = !signal ? `${table}:list:${select}` : null;
    if (cacheKey) {
      const cached = getCacheEntry(tableCacheMemory, TABLE_CACHE_PREFIX, cacheKey);
      if (cached !== null) return cached;
    }
    let query = client.from(table).select(select);
    if (signal && query.abortSignal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) {
      throw new ApiError(`supabase.from(${table}).select failed`, { status: error.code, data: error });
    }
    const result = data ?? [];
    if (cacheKey) {
      setCacheEntry(tableCacheMemory, TABLE_CACHE_PREFIX, cacheKey, result);
    }
    return result;
  },
  async filter(criteria = {}, sortKey, limit, { signal } = {}) {
    const client = ensureClient();
    const cacheKey = !signal
      ? `${table}:filter:${stableSerialize({ criteria, sortKey, limit })}`
      : null;
    if (cacheKey) {
      const cached = getCacheEntry(tableCacheMemory, TABLE_CACHE_PREFIX, cacheKey);
      if (cached !== null) return cached;
    }
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
    const result = data ?? [];
    if (cacheKey) {
      setCacheEntry(tableCacheMemory, TABLE_CACHE_PREFIX, cacheKey, result);
    }
    return result;
  },
  async create(payload, { signal } = {}) {
    const client = ensureClient();
    let query = client.from(table).insert(payload).select();
    if (signal && query.abortSignal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) {
      throw new ApiError(`supabase.from(${table}).insert failed`, { status: error.code, data: error });
    }
    clearTableCache(table);
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
  async signUp({ email, password }) {
    if (!email || !password) throw new ApiError("Email and password required for sign up");
    const client = ensureClient();
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}${createPageUrl('AuthCallback')}`
      : undefined;
    const defaultMetadata = {
      subscription_tier: "free",
      subscription_status: "active",
      current_period_end: "9999-12-31T00:00:00Z",
      plan_started_at: "",
      marketing_opt_in: false,
      weekly_summary: false,
      product_updates: false,
    };
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: defaultMetadata,
      },
    });
    if (error) {
      throw new ApiError(error.message || "Failed to sign up", { status: error.status, data: error });
    }
    if (data?.user) {
      try {
        await client.auth.updateUser({ data: defaultMetadata });
      } catch (updateError) {
        if (API_DEBUG) console.warn("Failed to set default metadata", updateError);
      }
    }
    return data;
  },
  async signIn({ email, password }) {
    if (!email || !password) throw new ApiError("Email and password required for login");
    const client = ensureClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      throw new ApiError(error.message || "Failed to login", { status: error.status, data: error });
    }
    return data;
  },
  async resetPassword(email) {
    if (!email) throw new ApiError("Email required for password reset");
    const client = ensureClient();
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}${createPageUrl('AuthCallback')}`
      : undefined;
    const { data, error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      throw new ApiError(error.message || "Failed to send password reset email", { status: error.status, data: error });
    }
    return data;
  },
  async updatePassword(newPassword) {
    if (!newPassword) throw new ApiError("Password required");
    const client = ensureClient();
    const { data, error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      throw new ApiError(error.message || "Failed to update password", { status: error.status, data: error });
    }
    return data;
  },
  async updateMyUserData(updates) {
    const client = ensureClient();
    const { data, error } = await client.auth.updateUser({ data: updates });
    if (error) {
      throw new ApiError(error.message || "Failed to update user", { status: error.status, data: error });
    }
    return data;
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
  spreadDistributionPlot: "spread-distribution-plot",
  bootstrapSpreadDistributionPlot: "bootstrap-spread-distribution-plot",
  advByDecilePlot: "adv-by-decile-plot",
  predictionsCoverage: "predictions-coverage",
  listPredictionDates: "list-prediction-dates",
  predictionsRange: "predictions-range",
  backtestEquityCurvePlot: "backtest-equity-curve-plot",
  backtestRollingAlphaPlot: "backtest-rolling-alpha-plot",
  backtestBootstrapRobustnessPlot: "backtest-bootstrap-robustness-plot",
  checkEmailAvailability: "check-email-availability",
};

const functionsClient = Object.fromEntries(
  Object.entries(functionMap).map(([logical, supabaseName]) => [logical, invokeFunction(supabaseName)])
);

const entityTableMap = {
  predictions: "predictions",
  ohlcv_1d: "ohlcv_1d",
  cross_sectional_metrics_1d: "cross_sectional_metrics_1d",
  monthly_performance_metrics: "monthly_performance_metrics",
  users: "users",
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

export const getCachedFunctionResult = (name, payload = {}) => {
  const sanitized = { ...payload };
  delete sanitized.__cache;
  const key = computeFunctionCacheKey(name, sanitized);
  return getCacheEntry(functionCacheMemory, FUNCTION_CACHE_PREFIX, key);
};

export const getSupabaseClient = () => ensureClient();
