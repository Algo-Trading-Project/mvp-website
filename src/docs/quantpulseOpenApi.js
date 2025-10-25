const OPEN_API_VERSION = "3.0.3";
const SERVER_URL = "https://inqzohpvxfidvcphjnzf.supabase.co/functions/v1";

const spec = {
  openapi: OPEN_API_VERSION,
  info: {
    title: "QuantPulse Signals API",
    version: "1.0.0",
    description:
      "Programmatic access to QuantPulse predictions, historical signals, OHLCV reference data and the supported universe. " +
      "All requests require a QuantPulse product API key supplied as the `x-api-key` header. Tokens are scoped to the user and enforce plan entitlements.",
    contact: {
      name: "QuantPulse Support",
      email: "support@quantpulse.ai",
      url: "https://quantpulse.ai",
    },
    termsOfService: "https://quantpulse.ai/terms",
    license: {
      name: "Commercial",
      url: "https://quantpulse.ai/license",
    },
  },
  servers: [
    {
      url: SERVER_URL,
      description: "Production",
    },
  ],
  tags: [
    {
      name: "Predictions",
      description: "Model outputs and historical predictions.",
    },
    {
      name: "Reference Data",
      description: "Supporting metadata and OHLCV time-series.",
    },
  ],
  externalDocs: {
    description: "QuantPulse product documentation",
    url: "https://quantpulse.ai",
  },
  security: [{ QuantPulseApiKey: [] }],
  components: {
    securitySchemes: {
      QuantPulseApiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "Per-user QuantPulse product API key. Generate and manage from Account → API Access.",
      },
    },
    schemas: {
      PredictionRow: {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          symbol_id: { type: "string", description: "Instrument identifier (e.g., BTC_USDT_BINANCE)." },
          predicted_returns_1: { type: "number", nullable: true, description: "1-day predicted return (if requested)." },
          predicted_returns_3: { type: "number", nullable: true, description: "3-day predicted return (if requested)." },
        },
        required: ["date", "symbol_id"],
      },
      OHLCVRow: {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          symbol_id: { type: "string" },
          open: { type: "number", nullable: true },
          high: { type: "number", nullable: true },
          low: { type: "number", nullable: true },
          close: { type: "number", nullable: true },
          volume: { type: "number", nullable: true },
        },
        required: ["date", "symbol_id"],
      },
      LatestResponse: {
        type: "object",
        properties: {
          date: { type: "string", format: "date", nullable: true },
          count: { type: "integer" },
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/PredictionRow" },
          },
        },
        required: ["count", "data"],
      },
      PredictionsResponse: {
        type: "object",
        properties: {
          start_date: { type: "string", format: "date" },
          end_date: { type: "string", format: "date" },
          tokens: {
            type: "array",
            items: { type: "string" },
            nullable: true,
          },
          count: { type: "integer" },
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/PredictionRow" },
          },
        },
        required: ["start_date", "end_date", "count", "data"],
      },
      OhlcvResponse: {
        type: "object",
        properties: {
          start_date: { type: "string", format: "date" },
          end_date: { type: "string", format: "date" },
          tokens: { type: "array", items: { type: "string" }, nullable: true },
          count: { type: "integer" },
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/OHLCVRow" },
          },
        },
        required: ["start_date", "end_date", "count", "data"],
      },
      UniverseResponse: {
        type: "object",
        properties: {
          count: { type: "integer" },
          data: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["count", "data"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
          api_key_hash: { type: "string", nullable: true },
          match: { type: "boolean", nullable: true },
        },
      },
    },
    parameters: {
      StartDate: {
        name: "start_date",
        in: "query",
        required: true,
        schema: { type: "string", format: "date" },
        description: "Inclusive start date in YYYY-MM-DD format.",
      },
      EndDate: {
        name: "end_date",
        in: "query",
        required: true,
        schema: { type: "string", format: "date" },
        description: "Inclusive end date in YYYY-MM-DD format.",
      },
      Tokens: {
        name: "tokens",
        in: "query",
        required: false,
        schema: { type: "string" },
        description:
          "Comma-separated base tickers (e.g., `BTC,ETH`). Internally expands to full symbol identifiers for filtering.",
      },
      Horizon: {
        name: "horizon",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Prediction horizon: `1d`, `3d`, or `both`. Defaults to `1d`.",
      },
    },
  },
  paths: {
    "/latest": {
      get: {
        tags: ["Predictions"],
        summary: "Latest prediction snapshot",
        description: "Returns all prediction rows for the most recent processed date.",
        parameters: [
          { $ref: "#/components/parameters/Horizon" },
        ],
        responses: {
          200: {
            description: "Snapshot retrieved.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LatestResponse" },
              },
            },
          },
      401: {
        description: "Missing or invalid QuantPulse API key.",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
        },
      },
          403: {
            description: "Invalid QuantPulse API key.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
        },
        security: [{ QuantPulseApiKey: [] }],
      },
    },
    "/predictions": {
      get: {
        tags: ["Predictions"],
        summary: "Historical predictions",
        description:
          "Retrieve prediction rows between two dates. Filter to specific instruments by supplying a comma-separated token list.",
        parameters: [
          { $ref: "#/components/parameters/StartDate" },
          { $ref: "#/components/parameters/EndDate" },
          { $ref: "#/components/parameters/Tokens" },
          { $ref: "#/components/parameters/Horizon" },
        ],
        responses: {
          200: {
            description: "Predictions returned.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PredictionsResponse" },
              },
            },
          },
          400: {
            description: "Invalid or missing query parameters.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
      401: {
        description: "Missing or invalid QuantPulse API key.",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
        },
      },
          403: {
            description: "Invalid QuantPulse API key.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
        },
        security: [{ QuantPulseApiKey: [] }],
      },
    },
    "/ohlcv": {
      get: {
        tags: ["Reference Data"],
        summary: "Daily OHLCV series",
        description: "Retrieve normalized OHLCV values for one or more tokens across a date range.",
        parameters: [
          { $ref: "#/components/parameters/Tokens" },
          { $ref: "#/components/parameters/StartDate" },
          { $ref: "#/components/parameters/EndDate" },
        ],
        responses: {
          200: {
            description: "OHLCV data returned.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OhlcvResponse" },
              },
            },
          },
          400: {
            description: "Missing or invalid dates.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
      401: {
        description: "Missing or invalid QuantPulse API key.",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
        },
      },
          403: {
            description: "Invalid QuantPulse API key.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
        },
        security: [{ QuantPulseApiKey: [] }],
      },
    },
    "/universe": {
      get: {
        tags: ["Reference Data"],
        summary: "Prediction universe",
        description: "Obtain the canonical list of instruments supported by QuantPulse predictions.",
        responses: {
          200: {
            description: "Universe list returned.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UniverseResponse" },
              },
            },
          },
      401: {
        description: "Missing or invalid QuantPulse API key.",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
        },
      },
          403: {
            description: "Invalid QuantPulse API key.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
        },
        security: [{ QuantPulseApiKey: [] }],
      },
    },
  },
};

export default spec;
