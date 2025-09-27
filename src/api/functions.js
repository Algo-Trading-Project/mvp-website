import { base44 } from "./base44Client";

export const fetchMetrics = base44.functions.fetchMetrics;
export const getLatestPredictions = base44.functions.getLatestPredictions;
export const rollingIcPlot = base44.functions.rollingIcPlot;
export const rollingSpreadPlot = base44.functions.rollingSpreadPlot;
export const icBySymbolPlot = base44.functions.icBySymbolPlot;
export const icDistributionPlot = base44.functions.icDistributionPlot;
export const bootstrapIcDistributionPlot = base44.functions.bootstrapIcDistributionPlot;
export const getTokenPerformanceCharts = base44.functions.getTokenPerformanceCharts;
export const getDecilePerformanceChart = base44.functions.getDecilePerformanceChart;
