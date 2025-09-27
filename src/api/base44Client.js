import {
  mockPredictions,
  mockCrossSectionalMetrics,
  mockMonthlyPerformance,
  mockEmailCaptures,
  mockContactSubmissions
} from "./mockData";

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
  async filter(criteria = {}, sortKey, limit) {
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
  async list() {
    return clone(source);
  },
  async create(payload) {
    if (!allowCreate) {
      return { ...payload, id: randomId() };
    }
    const record = { ...payload, id: randomId() };
    source.push(record);
    return record;
  }
});

const getLatestPredictionDate = () => {
  return mockPredictions.reduce((latest, row) => (row.date > latest ? row.date : latest), "");
};

const buildHtml = (title, bodyLines) => `<!doctype html><html><head><meta charset="utf-8" />
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 16px; background: #0f172a; color: #e2e8f0; }
    h1 { font-size: 18px; margin-bottom: 12px; }
    p { margin: 6px 0; font-size: 14px; }
    ul { padding-left: 18px; }
    li { margin-bottom: 4px; }
    .highlight { color: #38bdf8; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${bodyLines}
</body>
</html>`;

const average = (values) => {
  const filtered = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!filtered.length) return null;
  const sum = filtered.reduce((acc, v) => acc + v, 0);
  return sum / filtered.length;
};

const stdDev = (values) => {
  const filtered = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (filtered.length <= 1) return 0;
  const mean = average(filtered);
  const variance = filtered.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (filtered.length - 1);
  return Math.sqrt(variance);
};

const countPositive = (values) => {
  const filtered = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!filtered.length) return 0;
  const positives = filtered.filter((v) => v > 0).length;
  return positives / filtered.length;
};

const pickDateRange = (start, end) => {
  if (!start && !end) return clone(mockCrossSectionalMetrics);
  return mockCrossSectionalMetrics.filter((row) => {
    const afterStart = start ? row.date >= start : true;
    const beforeEnd = end ? row.date <= end : true;
    return afterStart && beforeEnd;
  });
};

const mockAuthState = {
  currentUser: null
};

export const base44 = {
  entities: {
    EmailCapture: createMockEntity(mockEmailCaptures, { allowCreate: true }),
    ContactSubmission: createMockEntity(mockContactSubmissions, { allowCreate: true }),
    predictions: createMockEntity(mockPredictions),
    spot_ohlcv_1d: createMockEntity([]),
    symbol_ids: createMockEntity(
      Array.from(
        new Set(mockPredictions.map((row) => row.symbol_id))
      ).map((symbol_id) => ({ symbol_id }))
    ),
    cross_sectional_metrics_1d: createMockEntity(mockCrossSectionalMetrics),
    monthly_performance_metrics: createMockEntity(mockMonthlyPerformance)
  },
  functions: {
    async fetchMetrics() {
      return {
        data: {
          cross: clone(mockCrossSectionalMetrics),
          monthly: clone(mockMonthlyPerformance)
        }
      };
    },
    async getLatestPredictions() {
      const latestDate = getLatestPredictionDate();
      const rows = mockPredictions.filter((row) => row.date === latestDate);
      return { data: { date: latestDate, rows: clone(rows) } };
    },
    async rollingIcPlot({ horizon, start, end }) {
      const series = pickDateRange(start, end);
      const field = horizon === "7d" ? "rolling_30d_ema_ic_7d" : "rolling_30d_ema_ic_1d";
      const values = series.map((row) => row[field]);
      const mean = average(values);
      const html = buildHtml(
        `${horizon?.toUpperCase?.() || horizon} Rolling IC`,
        `<p>Showing ${series.length} points between <span class="highlight">${start || series[0]?.date || "start"}</span> and <span class="highlight">${end || series[series.length - 1]?.date || "end"}</span>.</p>
         <p>Average IC: <strong>${mean?.toFixed(3) ?? "n/a"}</strong></p>`
      );
      return { data: { html } };
    },
    async rollingSpreadPlot({ horizon, start, end }) {
      const series = pickDateRange(start, end);
      const field = horizon === "7d" ? "rolling_30d_ema_top_bottom_decile_spread_7d" : "rolling_30d_ema_top_bottom_decile_spread_1d";
      const values = series.map((row) => row[field]);
      const mean = average(values);
      const html = buildHtml(
        `${horizon?.toUpperCase?.() || horizon} Top/Bottom Decile Spread`,
        `<p>Mock chart summarising decile spread for ${series.length} days.</p>
         <p>Average spread: <strong>${mean?.toFixed(3) ?? "n/a"}</strong></p>`
      );
      return { data: { html } };
    },
    async icBySymbolPlot({ horizon, start, end }) {
      const field = horizon === "7d" ? "y_pred_7d" : "y_pred_1d";
      const dateFiltered = mockPredictions.filter((row) => {
        const afterStart = start ? row.date >= start : true;
        const beforeEnd = end ? row.date <= end : true;
        return afterStart && beforeEnd;
      });
      const grouped = dateFiltered.reduce((acc, row) => {
        const symbol = row.symbol_id.split("_")[0];
        if (!acc[symbol]) acc[symbol] = [];
        acc[symbol].push(row[field]);
        return acc;
      }, {});
      const scores = Object.entries(grouped).map(([symbol, vals]) => ({
        symbol,
        score: average(vals) ?? 0
      }));
      const sorted = scores.sort((a, b) => b.score - a.score);
      const top = sorted.slice(0, 5);
      const bottom = sorted.slice(-5).reverse();
      const listToHtml = (list) =>
        `<ul>${list.map((item) => `<li><strong>${item.symbol}</strong>: ${(item.score * 100).toFixed(2)}%</li>`).join("")}</ul>`;
      return {
        data: {
          html_top: buildHtml("Top Tokens by IC", listToHtml(top)),
          html_bottom: buildHtml("Bottom Tokens by IC", listToHtml(bottom))
        }
      };
    },
    async icDistributionPlot({ horizon, start, end }) {
      const field = horizon === "7d" ? "rolling_30d_ema_ic_7d" : "rolling_30d_ema_ic_1d";
      const series = pickDateRange(start, end);
      const values = series.map((row) => row[field]);
      const mean = average(values) ?? 0;
      const std = stdDev(values);
      const pos = countPositive(values);
      const html = buildHtml(
        "IC Distribution",
        `<p>Average IC: <strong>${mean.toFixed(3)}</strong></p>
         <p>Std Dev: <strong>${std.toFixed(3)}</strong></p>
         <p>Positive Days: <strong>${(pos * 100).toFixed(1)}%</strong></p>`
      );
      return { data: { html, summary: { mean, std, pos } } };
    },
    async bootstrapIcDistributionPlot({ horizon, start, end }) {
      const field = horizon === "7d" ? "rolling_30d_ema_ic_7d" : "rolling_30d_ema_ic_1d";
      const series = pickDateRange(start, end);
      const values = series.map((row) => row[field]);
      const mean = average(values) ?? 0;
      const spread = stdDev(values) * 1.96;
      const html = buildHtml(
        "Bootstrapped Mean IC",
        `<p>Mean IC: <strong>${mean.toFixed(3)}</strong></p>
         <p>Approx. 95% CI: <strong>[${(mean - spread).toFixed(3)}, ${(mean + spread).toFixed(3)}]</strong></p>`
      );
      return { data: { html, summary: { mean, ci_lower: mean - spread, ci_upper: mean + spread } } };
    },
    async getTokenPerformanceCharts({ horizon }) {
      const field = horizon === "7d" ? "y_pred_7d" : "y_pred_1d";
      const latest = getLatestPredictionDate();
      const latestRows = mockPredictions.filter((row) => row.date === latest);
      const sorted = [...latestRows].sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));
      const best = sorted.slice(0, 5);
      const worst = sorted.slice(-5).reverse();
      const toList = (rows) =>
        `<ul>${rows
          .map((row) => `<li><strong>${row.symbol_id.split("_")[0]}</strong>: ${(row[field] * 100).toFixed(1)}%</li>`)
          .join("")}</ul>`;
      return {
        data: {
          count: latestRows.length,
          html_top: buildHtml("Best Performing Tokens", toList(best)),
          html_bottom: buildHtml("Lagging Tokens", toList(worst))
        }
      };
    },
    async getDecilePerformanceChart() {
      const latest = getLatestPredictionDate();
      const html = buildHtml(
        "Decile Performance",
        `<p>Mock decile chart for predictions published on <span class="highlight">${latest}</span>.</p>
         <p>This placeholder highlights how the future Lambda will render charts.</p>`
      );
      return { data: { html, n: 10 } };
    }
  },
  integrations: {
    Core: {
      InvokeLLM: async () => ({ data: null }),
      SendEmail: async () => ({ data: null }),
      UploadFile: async () => ({ data: null }),
      GenerateImage: async () => ({ data: null }),
      ExtractDataFromUploadedFile: async () => ({ data: null }),
      CreateFileSignedUrl: async () => ({ data: null }),
      UploadPrivateFile: async () => ({ data: null })
    }
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
        subscription_level: "free"
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
          subscription_level: "free"
        };
      }
      mockAuthState.currentUser = { ...mockAuthState.currentUser, ...updates };
      return clone(mockAuthState.currentUser);
    },
    async logout() {
      mockAuthState.currentUser = null;
    }
  }
};
