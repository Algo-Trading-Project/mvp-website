/*
 * Lightweight API client smoke test.
 *
 * Usage:
 *   VITE_API_MODE=mock npm run test:api
 *   VITE_API_MODE=network VITE_API_BASE_URL=https://... npm run test:api
 */

process.env.VITE_API_MODE = process.env.VITE_API_MODE || (process.env.VITE_API_BASE_URL ? "network" : "mock");

const {
  fetchMetrics,
  getLatestPredictions,
  rollingIcPlot,
  icDistributionPlot,
  bootstrapIcDistributionPlot,
  bootstrapExpectancyDistributionPlot,
  getTokenPerformanceCharts,
  getDecilePerformanceChart,
} = await import("../src/api/functions.js");

const results = [];

const capture = async (label, fn) => {
  const start = Date.now();
  try {
    const payload = await fn();
    const duration = Date.now() - start;
    results.push({ label, ok: true, duration, payload });
  } catch (error) {
    const duration = Date.now() - start;
    results.push({ label, ok: false, duration, error });
  }
};

await capture("fetchMetrics", async () => {
  const res = await fetchMetrics({});
  if (!res?.data) {
    throw new Error("Missing metrics payload");
  }
  return {
    crossRows: Array.isArray(res.data.cross) ? res.data.cross.length : 0,
    monthlyRows: Array.isArray(res.data.monthly) ? res.data.monthly.length : 0,
  };
});

await capture("getLatestPredictions", async () => {
  const res = await getLatestPredictions({});
  if (!res?.data) {
    throw new Error("Missing predictions payload");
  }
  return {
    date: res.data.date,
    rowCount: Array.isArray(res.data.rows) ? res.data.rows.length : 0,
  };
});

await capture("rollingIcPlot", async () => {
  const res = await rollingIcPlot({ horizon: "1d", start: "2025-02-01", end: "2025-02-10" });
  if (!res?.data?.html) throw new Error("Missing HTML");
  return { containsPlotly: res.data.html.includes("Plotly.newPlot"), points: res.data.points };
});

await capture("icDistributionPlot", async () => {
  const res = await icDistributionPlot({ horizon: "1d", start: "2025-02-01", end: "2025-02-10", bins: 15 });
  if (!res?.data?.html) throw new Error("Missing HTML");
  return { bins: res.data.bins, mean: res.data.summary?.mean ?? null };
});

await capture("bootstrapIcDistributionPlot", async () => {
  const res = await bootstrapIcDistributionPlot({ horizon: "1d", start: "2025-02-01", end: "2025-02-10", samples: 500 });
  if (!res?.data?.html) throw new Error("Missing HTML");
  return { mean: res.data.summary?.mean ?? null };
});

await capture("bootstrapExpectancyDistributionPlot", async () => {
  const res = await bootstrapExpectancyDistributionPlot({ horizon: "1d", direction: "long", start: "2025-02-01", end: "2025-02-10", samples: 500 });
  if (!res?.data?.html) throw new Error("Missing HTML");
  return { mean: res.data.summary?.mean ?? null };
});

await capture("getTokenPerformanceCharts", async () => {
  const res = await getTokenPerformanceCharts({ horizon: "1d", direction: "long", windowDays: 14, minObs: 3, topN: 5 });
  if (!res?.data?.html_top) throw new Error("Missing top chart");
  return { count: res.data.count };
});

await capture("getDecilePerformanceChart", async () => {
  const res = await getDecilePerformanceChart({ horizon: "1d", direction: "long", windowDays: 14 });
  if (!res?.data?.html) throw new Error("Missing decile HTML");
  return { n: res.data.n };
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
  console.error(`\n${failures.length} API smoke checks failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll API smoke checks passed.");
}
