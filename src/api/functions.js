import { supabaseApi } from "./supabaseClient.js";
import { ApiError } from "./errors.js";

const wrapCall = (label, fn) => async (payload = {}, options = {}) => {
  try {
    return await fn(payload, options);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ApiError(`${label}: ${error.message}`, {
        status: error.status,
        data: error.data,
        requestId: error.requestId,
        cause: error,
      });
    }
    throw new ApiError(label, { cause: error });
  }
};

export const fetchMetrics = wrapCall(
  "Failed to fetch metrics",
  supabaseApi.functions.fetchMetrics
);
export const getLatestPredictions = wrapCall(
  "Failed to load latest predictions",
  supabaseApi.functions.getLatestPredictions
);
export const rollingIcPlot = wrapCall(
  "Failed to load rolling IC plot",
  supabaseApi.functions.rollingIcPlot
);
export const rollingSpreadPlot = wrapCall(
  "Failed to load rolling spread plot",
  supabaseApi.functions.rollingSpreadPlot
);
export const quintileReturnsPlot = wrapCall(
  "Failed to load quintile returns plot",
  supabaseApi.functions.quintileReturnsPlot
);
export const rollingHitRatePlot = wrapCall(
  "Failed to load rolling hit rate plot",
  supabaseApi.functions.rollingHitRatePlot
);
export const backtestEquityCurvePlot = wrapCall(
  "Failed to load backtest equity curve",
  supabaseApi.functions.backtestEquityCurvePlot
);
export const backtestRollingAlphaPlot = wrapCall(
  "Failed to load backtest rolling alpha/beta",
  supabaseApi.functions.backtestRollingAlphaPlot
);
export const backtestBootstrapRobustnessPlot = wrapCall(
  "Failed to load bootstrap robustness plot",
  supabaseApi.functions.backtestBootstrapRobustnessPlot
);
export const icBySymbolPlot = wrapCall(
  "Failed to load IC by symbol plot",
  supabaseApi.functions.icBySymbolPlot
);
export const icDistributionPlot = wrapCall(
  "Failed to load IC distribution plot",
  supabaseApi.functions.icDistributionPlot
);
export const bootstrapIcDistributionPlot = wrapCall(
  "Failed to load bootstrap IC distribution plot",
  supabaseApi.functions.bootstrapIcDistributionPlot
);
export const spreadDistributionPlot = wrapCall(
  "Failed to load spread distribution plot",
  supabaseApi.functions.spreadDistributionPlot
);
export const bootstrapSpreadDistributionPlot = wrapCall(
  "Failed to load bootstrap spread distribution plot",
  supabaseApi.functions.bootstrapSpreadDistributionPlot
);
export const checkEmailAvailability = wrapCall(
  "Failed to check email availability",
  supabaseApi.functions.checkEmailAvailability
);
export const advByDecilePlot = wrapCall(
  "Failed to load ADV by decile plot",
  supabaseApi.functions.advByDecilePlot
);
export const predictionsCoverage = wrapCall(
  "Failed to load predictions coverage",
  supabaseApi.functions.predictionsCoverage
);

export const listPredictionDates = wrapCall(
  "Failed to list prediction dates",
  supabaseApi.functions.listPredictionDates
);

export const predictionsRange = wrapCall(
  "Failed to load predictions range",
  supabaseApi.functions.predictionsRange
);

export const getLiteTokens = wrapCall(
  "Failed to load Lite token list",
  supabaseApi.functions.liteTokens
);

export const sampleSignals = wrapCall(
  "Failed to download sample signals",
  supabaseApi.functions.sampleSignals
);

export const rawDaily = wrapCall(
  "Failed to load raw daily metrics",
  supabaseApi.functions.rawDaily
);

// RPC: range summary metrics from daily_dashboard_metrics
export const rangeSummary = wrapCall(
  "Failed to load range summary",
  supabaseApi.rpc.rangeSummary
);
