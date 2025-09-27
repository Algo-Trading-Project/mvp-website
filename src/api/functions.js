import { base44 } from "./base44Client.js";
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
  base44.functions.fetchMetrics
);
export const getLatestPredictions = wrapCall(
  "Failed to load latest predictions",
  base44.functions.getLatestPredictions
);
export const rollingIcPlot = wrapCall(
  "Failed to load rolling IC plot",
  base44.functions.rollingIcPlot
);
export const rollingSpreadPlot = wrapCall(
  "Failed to load rolling spread plot",
  base44.functions.rollingSpreadPlot
);
export const icBySymbolPlot = wrapCall(
  "Failed to load IC by symbol plot",
  base44.functions.icBySymbolPlot
);
export const icDistributionPlot = wrapCall(
  "Failed to load IC distribution plot",
  base44.functions.icDistributionPlot
);
export const bootstrapIcDistributionPlot = wrapCall(
  "Failed to load bootstrap IC distribution plot",
  base44.functions.bootstrapIcDistributionPlot
);
export const getTokenPerformanceCharts = wrapCall(
  "Failed to load token performance charts",
  base44.functions.getTokenPerformanceCharts
);
export const getDecilePerformanceChart = wrapCall(
  "Failed to load decile performance chart",
  base44.functions.getDecilePerformanceChart
);
export const rollingExpectancyPlot = wrapCall(
  "Failed to load rolling expectancy plot",
  base44.functions.rollingExpectancyPlot
);
export const bootstrapExpectancyDistributionPlot = wrapCall(
  "Failed to load bootstrap expectancy distribution plot",
  base44.functions.bootstrapExpectancyDistributionPlot
);
