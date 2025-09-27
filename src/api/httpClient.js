import { API_BASE_URL, API_TIMEOUT_MS, API_RETRY_COUNT, API_DEBUG } from "./config.js";
import { ApiError } from "./errors.js";

const ensureBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is not configured for network mode.");
  }
};

const stripSlashes = (value) => value.replace(/\/+$/, "");
const ensureLeadingSlash = (value) => (value.startsWith("/") ? value : `/${value}`);

const buildUrl = (path) => {
  ensureBaseUrl();
  const base = stripSlashes(API_BASE_URL);
  const normalised = ensureLeadingSlash(path);
  return `${base}${normalised}`;
};

const parseBody = async (response) => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
};

const createTimeoutError = () => {
  if (typeof DOMException === "function") {
    return new DOMException("Request timed out", "TimeoutError");
  }
  const error = new Error("Request timed out");
  error.name = "TimeoutError";
  return error;
};

const withTimeout = (timeoutMs, signal) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(createTimeoutError()), timeoutMs);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    }
  }
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timeoutId),
  };
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (path, { method = "POST", body, headers, query, signal, retry = API_RETRY_COUNT } = {}) => {
  const url = new URL(buildUrl(path));
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.append(key, String(value));
    });
  }

  const payload = body === undefined ? undefined : JSON.stringify(body);
  const finalHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };

  let attempt = 0;
  let lastError;

  while (attempt <= retry) {
    const { signal: combinedSignal, dispose } = withTimeout(API_TIMEOUT_MS, signal);
    try {
      const response = await fetch(url, { method, body: payload, headers: finalHeaders, signal: combinedSignal, credentials: "include" });
      dispose();

      if (response.ok) {
        const data = await parseBody(response);
        return data;
      }

      const errorPayload = await parseBody(response);
      const error = new ApiError(`Request failed with status ${response.status}`, {
        status: response.status,
        data: errorPayload,
        requestId: response.headers.get("x-amzn-requestid") || response.headers.get("x-request-id") || undefined,
      });

      if (API_DEBUG) {
        console.warn("API error", { path, status: response.status, errorPayload });
      }

      if (response.status >= 500 && attempt < retry) {
        attempt += 1;
        await delay(Math.min(200 * attempt, 1000));
        continue;
      }
      throw error;
    } catch (error) {
      dispose();
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        lastError = new ApiError("Request was aborted", { cause: error });
      } else if (error instanceof ApiError) {
        throw error;
      } else {
        lastError = new ApiError("Network request failed", { cause: error });
      }

      if (attempt < retry) {
        attempt += 1;
        await delay(Math.min(200 * attempt, 1000));
        continue;
      }
      throw lastError || error;
    }
  }

  throw lastError || new ApiError("Unknown API error");
};

const entityRoutes = {
  EmailCapture: "email-captures",
  ContactSubmission: "contact-submissions",
  predictions: "predictions",
  spot_ohlcv_1d: "spot-ohlcv-1d",
  symbol_ids: "symbol-ids",
  cross_sectional_metrics_1d: "cross-sectional-metrics-1d",
  monthly_performance_metrics: "monthly-performance-metrics",
};

const createEntityClient = (resource) => ({
  async list({ query, signal } = {}) {
    return request(`/entities/${resource}`, { method: "GET", query, signal });
  },
  async filter(criteria = {}, sortKey, limit, { signal } = {}) {
    return request(`/entities/${resource}/filter`, {
      method: "POST",
      body: { criteria, sort: sortKey, limit },
      signal,
    });
  },
  async create(payload, { signal } = {}) {
    return request(`/entities/${resource}`, { method: "POST", body: payload, signal });
  },
});

const functionRoutes = {
  fetchMetrics: "fetchMetrics",
  getLatestPredictions: "getLatestPredictions",
  rollingIcPlot: "rollingIcPlot",
  rollingSpreadPlot: "rollingSpreadPlot",
  icBySymbolPlot: "icBySymbolPlot",
  icDistributionPlot: "icDistributionPlot",
  bootstrapIcDistributionPlot: "bootstrapIcDistributionPlot",
  bootstrapExpectancyDistributionPlot: "bootstrapExpectancyDistributionPlot",
  getTokenPerformanceCharts: "getTokenPerformanceCharts",
  getDecilePerformanceChart: "getDecilePerformanceChart",
  rollingExpectancyPlot: "rollingExpectancyPlot",
};

const createFunctionInvoker = (name) => async (payload = {}, options = {}) => {
  return request(`/functions/${name}`, { method: "POST", body: payload, signal: options.signal });
};

const authClient = {
  async me({ signal } = {}) {
    return request("/auth/me", { method: "GET", signal });
  },
  async loginWithRedirect({ returnTo, signal } = {}) {
    return request("/auth/login", { method: "POST", body: { returnTo }, signal });
  },
  async updateMyUserData(updates = {}, { signal } = {}) {
    return request("/auth/me", { method: "PATCH", body: updates, signal });
  },
  async logout({ signal } = {}) {
    return request("/auth/logout", { method: "POST", signal });
  },
};

const integrationsClient = {
  Core: {
    InvokeLLM: async (payload = {}, options = {}) => request("/integrations/core/invoke-llm", { method: "POST", body: payload, signal: options.signal }),
    SendEmail: async (payload = {}, options = {}) => request("/integrations/core/send-email", { method: "POST", body: payload, signal: options.signal }),
    UploadFile: async (payload = {}, options = {}) => request("/integrations/core/upload-file", { method: "POST", body: payload, signal: options.signal }),
    GenerateImage: async (payload = {}, options = {}) => request("/integrations/core/generate-image", { method: "POST", body: payload, signal: options.signal }),
    ExtractDataFromUploadedFile: async (payload = {}, options = {}) => request("/integrations/core/extract-data", { method: "POST", body: payload, signal: options.signal }),
    CreateFileSignedUrl: async (payload = {}, options = {}) => request("/integrations/core/create-signed-url", { method: "POST", body: payload, signal: options.signal }),
    UploadPrivateFile: async (payload = {}, options = {}) => request("/integrations/core/upload-private-file", { method: "POST", body: payload, signal: options.signal }),
  },
};

export const httpClient = {
  entities: Object.fromEntries(
    Object.entries(entityRoutes).map(([logicalName, resource]) => [logicalName, createEntityClient(resource)])
  ),
  functions: Object.fromEntries(
    Object.entries(functionRoutes).map(([logicalName, route]) => [logicalName, createFunctionInvoker(route)])
  ),
  integrations: integrationsClient,
  auth: authClient,
};

export { request };
