import {
  mockPredictions,
  mockCrossSectionalMetrics,
  mockMonthlyPerformance,
  mockEmailCaptures,
  mockContactSubmissions,
} from "./mockData.js";

const randomId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

const clone = (value) => JSON.parse(JSON.stringify(value));

const sortRows = (rows, sortKey) => {
  if (!sortKey) return clone(rows);
  const direction = sortKey.startsWith("-") ? -1 : 1;
  const key = direction === -1 ? sortKey.slice(1) : sortKey;
  return clone(rows).sort((a, b) => {
    if (a[key] < b[key]) return -1 * direction;
    if (a[key] > b[key]) return direction;
    return 0;
  });
};

const createMockEntity = (source, { allowCreate = false } = {}) => ({
  async filter(criteria = {}, sortKey, limit, _options = {}) {
    let rows = clone(source);
    if (criteria && Object.keys(criteria).length) {
      rows = rows.filter((row) =>
        Object.entries(criteria).every(([key, value]) => {
          if (value === undefined || value === null || value === "") return true;
          return row[key] === value;
        })
      );
    }
    rows = sortRows(rows, sortKey);
    if (typeof limit === "number") {
      rows = rows.slice(0, limit);
    }
    return rows;
  },
  async list(_options = {}) {
    return clone(source);
  },
  async create(payload, _options = {}) {
    if (!allowCreate) {
      return { ...payload, id: randomId() };
    }
    const record = { ...payload, id: randomId() };
    source.push(record);
    return record;
  },
});

const earliestPredictionDate = mockPredictions.reduce(
  (min, row) => (row.date < min ? row.date : min),
  mockPredictions[0]?.date || "2025-01-01"
);

const getLatestPredictionDate = () =>
  mockPredictions.reduce((latest, row) => (row.date > latest ? row.date : latest), earliestPredictionDate);

const ensureRange = (start, end, dataset) => {
  if (!dataset.length) return { start, end };
  const minDate = dataset[0].date;
  const maxDate = dataset[dataset.length - 1].date;
  return {
    start: start || minDate,
    end: end || maxDate,
  };
};

const filterByDate = (rows, start, end) =>
  rows.filter((row) => (!start || row.date >= start) && (!end || row.date <= end));

const createHtmlMessage = (message) =>
  `<!DOCTYPE html><html><body style="margin:0;padding:16px;background:#0b1220;color:#e2e8f0;font-family:'Inter',system-ui,sans-serif">${message}</body></html>`;

const plotlyPage = ({ traces, layout = {}, config = {} }) => {
  const baseLayout = {
    paper_bgcolor: "#0b1220",
    plot_bgcolor: "#0b1220",
  };
  const baseConfig = {
    responsive: true,
    displayModeBar: false,
    scrollZoom: true,
  };
  const tracesJson = JSON.stringify(traces);
  const layoutJson = JSON.stringify({ ...baseLayout, ...layout });
  const configJson = JSON.stringify({ ...baseConfig, ...config });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head><body><div id="chart"></div><script>const data=${tracesJson};const layout=${layoutJson};const config=${configJson};Plotly.newPlot('chart',data,layout,config);</script></body></html>`;
};

const statistics = (values) => {
  const filtered = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!filtered.length) {
    return { mean: 0, std: 0, positiveRatio: 0 };
  }
  const mean = filtered.reduce((acc, v) => acc + v, 0) / filtered.length;
  const variance =
    filtered.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / Math.max(1, filtered.length);
  const std = Math.sqrt(variance);
  const positiveRatio = filtered.filter((v) => v > 0).length / filtered.length;
  return { mean, std, positiveRatio };
};

const bootstrapMeans = (values, samples = 2000) => {
  const filtered = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!filtered.length) return null;
  const n = filtered.length;
  const runs = Math.max(1000, Math.min(samples, 5000));
  const results = [];
  for (let i = 0; i < runs; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const randomIndex = Math.floor(Math.random() * n);
      sum += filtered[randomIndex];
    }
    results.push(sum / n);
  }
  results.sort((a, b) => a - b);
  const mean = results.reduce((acc, v) => acc + v, 0) / results.length;
  const lower = results[Math.floor(0.005 * results.length)];
  const upper = results[Math.ceil(0.995 * results.length) - 1];
  return { samples: runs, values: results, mean, lower, upper };
};

const rankValues = (arr) => {
  const entries = arr
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < entries.length) {
    let j = i;
    let sum = 0;
    while (j < entries.length && entries[j].value === entries[i].value) {
      sum += j + 1;
      j++;
    }
    const rank = sum / (j - i);
    for (let k = i; k < j; k++) {
      ranks[entries[k].index] = rank;
    }
    i = j;
  }
  return ranks;
};

const spearmanCorrelation = (xs, ys) => {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const rankX = rankValues(xs);
  const rankY = rankValues(ys);
  const meanX = rankX.reduce((acc, v) => acc + v, 0) / rankX.length;
  const meanY = rankY.reduce((acc, v) => acc + v, 0) / rankY.length;
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < rankX.length; i++) {
    const dx = rankX[i] - meanX;
    const dy = rankY[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  if (!denomX || !denomY) return 0;
  return numerator / Math.sqrt(denomX * denomY);
};

const shiftDays = (dateStr, delta) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

const mockAuthState = {
  currentUser: null,
};

const makePlotResponse = (payload) => ({ data: payload });

export const mockClient = {
  entities: {
    EmailCapture: createMockEntity(mockEmailCaptures, { allowCreate: true }),
    ContactSubmission: createMockEntity(mockContactSubmissions, { allowCreate: true }),
    predictions: createMockEntity(mockPredictions),
    spot_ohlcv_1d: createMockEntity([]),
    symbol_ids: createMockEntity(
      Array.from(new Set(mockPredictions.map((row) => row.symbol_id))).map((symbol_id) => ({ symbol_id }))
    ),
    cross_sectional_metrics_1d: createMockEntity(mockCrossSectionalMetrics),
    monthly_performance_metrics: createMockEntity(mockMonthlyPerformance),
  },
  functions: {
    async fetchMetrics() {
      return { data: { cross: clone(mockCrossSectionalMetrics), monthly: clone(mockMonthlyPerformance) } };
    },
    async getLatestPredictions() {
      const latestDate = getLatestPredictionDate();
      const rows = mockPredictions.filter((row) => row.date === latestDate);
      return { data: { date: latestDate, rows: clone(rows) } };
    },
    async rollingIcPlot({ horizon = "1d", start, end, width = 980, height = 360 }) {
      const { start: s, end: e } = ensureRange(start, end, mockCrossSectionalMetrics);
      const series = filterByDate(mockCrossSectionalMetrics, s, e);
      if (!series.length) {
        return makePlotResponse({ html: createHtmlMessage("No IC data available in this range.") });
      }
      const field = horizon === "7d" ? "rolling_30d_ema_ic_7d" : "rolling_30d_ema_ic_1d";
      const x = series.map((row) => row.date);
      const y = series.map((row) => Number(row[field] ?? null));
      const trace = {
        x,
        y,
        type: "scatter",
        mode: "lines",
        line: { color: "#60a5fa", width: 2 },
        hovertemplate: "Date: %{x}<br>IC: %{y:.3f}<extra></extra>",
      };
      const layout = {
        margin: { l: 48, r: 20, t: 10, b: 30 },
        yaxis: {
          tickformat: ".3f",
          gridcolor: "#334155",
          tickfont: { color: "#94a3b8" },
          zeroline: true,
          zerolinecolor: "#475569",
        },
        xaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155" },
      };
      const html = plotlyPage({ traces: [trace], layout });
      return makePlotResponse({ html, points: series.length, width, height });
    },
    async rollingSpreadPlot({ horizon = "1d", start, end, width = 980, height = 360 }) {
      const { start: s, end: e } = ensureRange(start, end, mockCrossSectionalMetrics);
      const series = filterByDate(mockCrossSectionalMetrics, s, e);
      if (!series.length) {
        return makePlotResponse({ html: createHtmlMessage("No decile spread data available.") });
      }
      const field =
        horizon === "7d"
          ? "rolling_30d_ema_top_bottom_decile_spread_7d"
          : "rolling_30d_ema_top_bottom_decile_spread_1d";
      const x = series.map((row) => row.date);
      const y = series.map((row) => Number(row[field] ?? null));
      const trace = {
        x,
        y,
        type: "scatter",
        mode: "lines",
        line: { color: "#f59e0b", width: 2 },
        hovertemplate: "Date: %{x}<br>Spread (30d EMA): %{y:.2%}<extra></extra>",
      };
      const layout = {
        margin: { l: 48, r: 20, t: 10, b: 30 },
        yaxis: { tickformat: ".2%", gridcolor: "#334155", tickfont: { color: "#94a3b8" } },
        xaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155" },
      };
      const html = plotlyPage({ traces: [trace], layout });
      return makePlotResponse({ html, points: series.length, width, height });
    },
    async icBySymbolPlot({
      horizon = "1d",
      start,
      end,
      minPoints = 10,
      topN = 20,
      width = 980,
      height = 420,
    }) {
      const predField = horizon === "7d" ? "y_pred_7d" : "y_pred_1d";
      const retField = horizon === "7d" ? "forward_returns_7" : "forward_returns_1";
      const { start: s, end: e } = ensureRange(start, end, mockPredictions);
      const rows = filterByDate(mockPredictions, s, e);
      const grouped = new Map();
      for (const row of rows) {
        const symbol = row.symbol_id.split("_")[0];
        if (!grouped.has(symbol)) {
          grouped.set(symbol, { preds: [], returns: [] });
        }
        grouped.get(symbol).preds.push(Number(row[predField] ?? 0));
        grouped.get(symbol).returns.push(Number(row[retField] ?? 0));
      }
      const records = Array.from(grouped.entries())
        .map(([symbol, data]) => ({
          symbol,
          ic: spearmanCorrelation(data.preds, data.returns),
          count: data.preds.length,
        }))
        .filter((row) => row.count >= minPoints)
        .sort((a, b) => b.ic - a.ic);

      if (!records.length) {
        const empty = createHtmlMessage("Not enough signals to compute IC by symbol.");
        return makePlotResponse({ html_top: empty, html_bottom: empty });
      }

      const horizonLabel = horizon === "1d" ? "1-Day" : "7-Day";
      const makeBarPlot = (rows, title, color) => {
        const x = rows.map((row) => row.symbol);
        const y = rows.map((row) => row.ic);
        const colors = y.map(() => color);
        const traces = [
          {
            type: "bar",
            x,
            y,
            marker: { color: colors },
            hovertemplate: "IC: %{y:.3f}<br>Symbol: %{x}<extra></extra>",
          },
        ];
        const layout = {
          title: { text: `${title} (${horizonLabel})`, font: { color: "#e2e8f0", size: 14 }, x: 0.5 },
          margin: { l: 48, r: 20, t: 40, b: 80 },
          xaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155", tickangle: -45 },
          yaxis: {
            tickformat: ".3f",
            tickfont: { color: "#94a3b8" },
            gridcolor: "#334155",
            zeroline: true,
            zerolinecolor: "#475569",
          },
        };
        return plotlyPage({ traces, layout });
      };

      const topRows = records.slice(0, topN);
      const bottomRows = records.slice(-topN).reverse();
      return makePlotResponse({
        html_top: makeBarPlot(topRows, "Top 20 Tokens by IC", "#10b981"),
        html_bottom: makeBarPlot(bottomRows, "Bottom 20 Tokens by IC", "#ef4444"),
        count: records.length,
        width,
        height,
      });
    },
    async icDistributionPlot({ horizon = "1d", start, end, bins = 20 }) {
      const field = horizon === "7d" ? "cross_sectional_ic_7d" : "cross_sectional_ic_1d";
      const { start: s, end: e } = ensureRange(start, end, mockCrossSectionalMetrics);
      const series = filterByDate(mockCrossSectionalMetrics, s, e);
      const values = series.map((row) => Number(row[field])).filter((v) => Number.isFinite(v));
      if (!values.length) {
        return makePlotResponse({ html: createHtmlMessage("No IC values in selected range."), summary: null });
      }
      const { mean, std, positiveRatio } = statistics(values);
      const traces = [
        {
          type: "histogram",
          x: values,
          nbinsx: bins,
          marker: { color: "#60a5fa", line: { color: "#000000", width: 1 } },
          hovertemplate: "IC: %{x:.3f}<br>Count: %{y}<extra></extra>",
        },
      ];
      const layout = {
        margin: { l: 48, r: 20, t: 10, b: 30 },
        xaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155" },
        yaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155" },
        shapes: [
          { type: "line", x0: 0, x1: 0, y0: 0, y1: 1, yref: "paper", line: { color: "#ef4444", width: 2, dash: "dash" } },
          { type: "line", x0: mean, x1: mean, y0: 0, y1: 1, yref: "paper", line: { color: "#3b82f6", width: 2, dash: "dash" } },
        ],
      };
      const html = plotlyPage({ traces, layout });
      return makePlotResponse({
        html,
        summary: { mean, std, pos: positiveRatio },
        bins,
        start: s,
        end: e,
        total_points: values.length,
      });
    },
    async bootstrapIcDistributionPlot({ horizon = "1d", start, end, samples = 3000, bins = 20 }) {
      const field = horizon === "7d" ? "cross_sectional_ic_7d" : "cross_sectional_ic_1d";
      const { start: s, end: e } = ensureRange(start, end, mockCrossSectionalMetrics);
      const series = filterByDate(mockCrossSectionalMetrics, s, e);
      const values = series.map((row) => Number(row[field])).filter((v) => Number.isFinite(v));
      if (!values.length) {
        return makePlotResponse({ html: createHtmlMessage("No data available for bootstrap."), summary: null });
      }
      const bootstrap = bootstrapMeans(values, samples);
      const traces = [
        {
          type: "histogram",
          x: bootstrap.values,
          nbinsx: bins,
          marker: { color: "#8b5cf6", line: { color: "#000000", width: 1 } },
          hovertemplate: "Mean IC: %{x:.4f}<br>Count: %{y}<extra></extra>",
        },
      ];
      const layout = {
        margin: { l: 48, r: 20, t: 10, b: 30 },
        xaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155" },
        yaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155" },
        shapes: [
          {
            type: "line",
            x0: bootstrap.mean,
            x1: bootstrap.mean,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "#3b82f6", width: 2, dash: "dash" },
          },
        ],
      };
      const html = plotlyPage({ traces, layout });
      return makePlotResponse({
        html,
        summary: { mean: bootstrap.mean, ci_lower: bootstrap.lower, ci_upper: bootstrap.upper },
        samples: bootstrap.samples,
        points: values.length,
      });
    },
    async bootstrapExpectancyDistributionPlot({
      horizon = "1d",
      direction = "combined",
      start,
      end,
      samples = 3000,
      bins = 30,
    }) {
      const fieldLookup = {
        combined: horizon === "1d" ? "cs_1d_expectancy" : "cs_7d_expectancy",
        long: horizon === "1d" ? "cs_1d_long_expectancy" : "cs_7d_long_expectancy",
        short: horizon === "1d" ? "cs_1d_short_expectancy" : "cs_7d_short_expectancy",
      };
      const field = fieldLookup[direction] || fieldLookup.combined;
      const { start: s, end: e } = ensureRange(start, end, mockCrossSectionalMetrics);
      const series = filterByDate(mockCrossSectionalMetrics, s, e);
      const values = series.map((row) => Number(row[field])).filter((v) => Number.isFinite(v));
      if (!values.length) {
        return makePlotResponse({ html: createHtmlMessage("No expectancy data for selection."), summary: null });
      }
      const bootstrap = bootstrapMeans(values, samples);
      const traces = [
        {
          type: "histogram",
          x: bootstrap.values,
          nbinsx: bins,
          marker: { color: "#8b5cf6", line: { color: "#000000", width: 1 } },
          hovertemplate: "Mean Expectancy: %{x:.4f}<br>Count: %{y}<extra></extra>",
        },
      ];
      const layout = {
        margin: { l: 48, r: 20, t: 10, b: 30 },
        xaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155" },
        yaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155" },
        shapes: [
          {
            type: "line",
            x0: bootstrap.mean,
            x1: bootstrap.mean,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: "#3b82f6", width: 2, dash: "dash" },
          },
        ],
      };
      const html = plotlyPage({ traces, layout });
      return makePlotResponse({
        html,
        summary: { mean: bootstrap.mean, ci_lower: bootstrap.lower, ci_upper: bootstrap.upper },
        samples: bootstrap.samples,
        points: values.length,
      });
    },
    async getTokenPerformanceCharts({
      horizon = "1d",
      direction = "long",
      windowDays = 30,
      minObs = 5,
      topN = 20,
      start,
      end,
    }) {
      const latest = getLatestPredictionDate();
      if (!latest) {
        const empty = createHtmlMessage("No prediction data available.");
        return makePlotResponse({ html_top: empty, html_bottom: empty, count: 0 });
      }
      const resolvedEnd = end || latest;
      const resolvedStart = start || shiftDays(resolvedEnd, -(windowDays - 1));
      const predField = horizon === "7d" ? "y_pred_7d" : "y_pred_1d";
      const retField = horizon === "7d" ? "forward_returns_7" : "forward_returns_1";

      const filtered = filterByDate(mockPredictions, resolvedStart, resolvedEnd).filter((row) => {
        if (direction === "long") return Number(row[predField]) > 0;
        if (direction === "short") return Number(row[predField]) < 0;
        return true;
      });

      const grouped = new Map();
      for (const row of filtered) {
        const symbol = row.symbol_id.split("_")[0];
        if (!grouped.has(symbol)) {
          grouped.set(symbol, []);
        }
        grouped.get(symbol).push(Number(row[retField] ?? 0));
      }

      const aggregates = Array.from(grouped.entries())
        .map(([symbol, returns]) => ({
          symbol,
          avg_expectancy: returns.reduce((acc, v) => acc + v, 0) / returns.length,
          observation_count: returns.length,
        }))
        .filter((row) => row.observation_count >= minObs)
        .sort((a, b) => b.avg_expectancy - a.avg_expectancy);

      if (!aggregates.length) {
        const empty = createHtmlMessage("Not enough qualifying signals for this configuration.");
        return makePlotResponse({ html_top: empty, html_bottom: empty, count: 0 });
      }

      const horizonLabel = horizon === "1d" ? "1-Day" : "7-Day";
      const directionLabel = direction === "combined" ? "" : ` • ${direction.charAt(0).toUpperCase() + direction.slice(1)}`;

      const makeBarPlot = (rows, title, color) => {
        const x = rows.map((row) => row.symbol);
        const y = rows.map((row) => row.avg_expectancy);
        const heading = `${title} (${horizonLabel}${directionLabel})`;
        const traces = [
          {
            type: "bar",
            x,
            y,
            marker: { color },
            hovertemplate: "Expectancy: %{y:.2%}<br>Symbol: %{x}<extra></extra>",
          },
        ];
        const layout = {
          title: { text: heading, font: { color: "#e2e8f0", size: 14 }, x: 0.5 },
          margin: { l: 48, r: 20, t: 40, b: 80 },
          xaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155", tickangle: -45 },
          yaxis: {
            tickformat: ".2%",
            tickfont: { color: "#94a3b8" },
            gridcolor: "#334155",
            zeroline: true,
            zerolinecolor: "#475569",
          },
        };
        return plotlyPage({ traces, layout });
      };

      const topRows = aggregates.slice(0, topN);
      const bottomRows = aggregates.slice(-topN).reverse();
      return makePlotResponse({
        html_top: makeBarPlot(topRows, "Top 20 Tokens by Expectancy", "#10b981"),
        html_bottom: makeBarPlot(bottomRows, "Bottom 20 Tokens by Expectancy", "#ef4444"),
        count: aggregates.length,
        range_start: resolvedStart,
        range_end: resolvedEnd,
      });
    },
    async getDecilePerformanceChart({ horizon = "1d", direction = "long", windowDays = 30, start, end }) {
      const latest = getLatestPredictionDate();
      if (!latest) {
        return makePlotResponse({ html: createHtmlMessage("No data for decile performance."), n: 0 });
      }
      const resolvedEnd = end || latest;
      const resolvedStart = start || shiftDays(resolvedEnd, -(windowDays - 1));
      const predField = horizon === "7d" ? "y_pred_7d" : "y_pred_1d";
      const retField = horizon === "7d" ? "forward_returns_7" : "forward_returns_1";

      const dateGroups = new Map();
      for (const row of filterByDate(mockPredictions, resolvedStart, resolvedEnd)) {
        if (!dateGroups.has(row.date)) {
          dateGroups.set(row.date, []);
        }
        dateGroups.get(row.date).push(row);
      }

      const decileReturns = Array.from({ length: 10 }, () => []);
      dateGroups.forEach((rowsForDate) => {
        const sorted = [...rowsForDate].sort((a, b) => {
          if (direction === "short") {
            return Number(a[predField]) - Number(b[predField]);
          }
          return Number(b[predField]) - Number(a[predField]);
        });
        const n = sorted.length;
        if (!n) return;
        sorted.forEach((row, index) => {
          const decile = Math.min(9, Math.floor((index / n) * 10));
          decileReturns[decile].push(Number(row[retField] ?? 0));
        });
      });

      const x = Array.from({ length: 10 }, (_, i) => `Decile ${i + 1}`);
      const y = decileReturns.map((values) =>
        values.length ? values.reduce((acc, v) => acc + v, 0) / values.length : 0
      );
      const totalObservations = decileReturns.reduce((acc, values) => acc + values.length, 0);
      if (!totalObservations) {
        return makePlotResponse({ html: createHtmlMessage("Not enough observations to compute deciles."), n: 0 });
      }

      const traces = [
        {
          type: "bar",
          x,
          y,
          marker: { color: "#8b5cf6" },
          hovertemplate: "Avg Return: %{y:.2%}<br>%{x}<extra></extra>",
        },
      ];
      const layout = {
        margin: { l: 48, r: 20, t: 20, b: 40 },
        xaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155" },
        yaxis: {
          tickformat: ".2%",
          tickfont: { color: "#94a3b8" },
          gridcolor: "#334155",
          zeroline: true,
          zerolinecolor: "#475569",
        },
      };
      const html = plotlyPage({ traces, layout });
      return makePlotResponse({ html, n: totalObservations, range_start: resolvedStart, range_end: resolvedEnd });
    },
    async rollingExpectancyPlot({
      horizon = "1d",
      direction = "combined",
      start,
      end,
      width = 980,
      height = 360,
    }) {
      const fieldMap = {
        combined: horizon === "1d" ? "rolling_avg_1d_expectancy" : "rolling_avg_7d_expectancy",
        long: horizon === "1d" ? "rolling_avg_1d_long_expectancy" : "rolling_avg_7d_long_expectancy",
        short: horizon === "1d" ? "rolling_avg_1d_short_expectancy" : "rolling_avg_7d_short_expectancy",
      };
      const field = fieldMap[direction] || fieldMap.combined;
      const { start: s, end: e } = ensureRange(start, end, mockCrossSectionalMetrics);
      const series = filterByDate(mockCrossSectionalMetrics, s, e);
      if (!series.length) {
        return makePlotResponse({ html: createHtmlMessage("No expectancy data available."), points: 0 });
      }
      const x = series.map((row) => row.date);
      const y = series.map((row) => Number(row[field] ?? 0));
      const colorMap = { combined: "#22d3ee", long: "#10b981", short: "#ef4444" };
      const trace = {
        x,
        y,
        type: "scatter",
        mode: "lines",
        line: { color: colorMap[direction] || "#22d3ee", width: 2 },
        hovertemplate: `${direction.charAt(0).toUpperCase() + direction.slice(1)}: %{y:.2%}<br>Date: %{x}<extra></extra>`,
      };
      const layout = {
        margin: { l: 48, r: 20, t: 10, b: 30 },
        yaxis: { tickformat: ".2%", gridcolor: "#334155", tickfont: { color: "#94a3b8" } },
        xaxis: { tickfont: { color: "#94a3b8" }, gridcolor: "#334155" },
        legend: { font: { color: "#94a3b8" }, bgcolor: "rgba(0,0,0,0)" },
      };
      const html = plotlyPage({ traces: [trace], layout });
      return makePlotResponse({ html, points: series.length, width, height });
    },
  },
  auth: {
    async me() {
      if (mockAuthState.currentUser) return clone(mockAuthState.currentUser);
      throw new Error("Not authenticated");
    },
    async loginWithRedirect(callback) {
      mockAuthState.currentUser = {
        id: "mock-user",
        email: "demo@example.com",
        full_name: "Demo User",
        subscription_level: "free",
      };
      if (typeof callback === "function") {
        callback();
      }
      return clone(mockAuthState.currentUser);
    },
    async updateMyUserData(updates = {}) {
      if (!mockAuthState.currentUser) {
        mockAuthState.currentUser = {
          id: "mock-user",
          email: "demo@example.com",
          full_name: "Demo User",
          subscription_level: "free",
        };
      }
      mockAuthState.currentUser = { ...mockAuthState.currentUser, ...updates };
      return clone(mockAuthState.currentUser);
    },
    async logout() {
      mockAuthState.currentUser = null;
    },
  },
};
