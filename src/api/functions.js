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
export const predictionsCoverage = wrapCall(
  "Failed to load predictions coverage",
  base44.functions.predictionsCoverage
);
