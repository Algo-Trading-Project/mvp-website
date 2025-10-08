const OPEN_API_VERSION = "3.0.3";
const SERVER_URL = "https://inqzohpvxfidvcphjnzf.supabase.co/functions/v1";

const spec = {
  openapi: OPEN_API_VERSION,
  info: {
    title: "QuantPulse Signals API",
    version: "1.0.0",
    description:
      "Programmatic access to QuantPulse predictions, historical signals, OHLCV reference data and the supported universe. " +
      "All requests require both the QuantPulse product API key (`x-api-key`) and the Supabase anon key supplied as a bearer token.",
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
  security: [{ QuantPulseApiKey: [], SupabaseAnonKey: [] }],
  components: {
    securitySchemes: {
      QuantPulseApiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "Per-user QuantPulse product API key. Generate and manage from Account → API Access.",
      },
      SupabaseAnonKey: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
        description:
          "Supabase anon key sent as `Authorization: Bearer <SUPABASE_ANON_KEY>`. The anon key is public and included in onboarding materials.",
      },
    },
    schemas: {
      Metadata: {
        type: "object",
        properties: {
          user_id: { type: "string", format: "uuid" },
          subscription_tier: { type: "string" },
          api_key_hash: { type: "string", description: "SHA-256 hash of the provided API key." },
          api_key_valid: { type: "boolean" },
        },
        required: ["user_id", "subscription_tier", "api_key_hash", "api_key_valid"],
      },
      PredictionRow: {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          symbol_id: { type: "string", description: "Instrument identifier (e.g., BTC_USDT_BINANCE)." },
          y_pred: { type: "number", nullable: true, description: "Prediction score (higher implies stronger signal)." },
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
          rows: {
            type: "array",
            items: { $ref: "#/components/schemas/PredictionRow" },
          },
          metadata: { $ref: "#/components/schemas/Metadata" },
        },
        required: ["count", "rows", "metadata"],
      },
      PredictionsResponse: {
        type: "object",
        properties: {
          range: {
            type: "object",
            properties: {
              start_date: { type: "string", format: "date" },
              end_date: { type: "string", format: "date" },
            },
            required: ["start_date", "end_date"],
          },
          tokens: {
            type: "array",
            items: { type: "string" },
            nullable: true,
          },
          count: { type: "integer" },
          rows: {
            type: "array",
            items: { $ref: "#/components/schemas/PredictionRow" },
          },
          metadata: { $ref: "#/components/schemas/Metadata" },
        },
        required: ["range", "count", "rows", "metadata"],
      },
      OhlcvResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          range: {
            type: "object",
            properties: {
              start_date: { type: "string", format: "date" },
              end_date: { type: "string", format: "date" },
            },
            required: ["start_date", "end_date"],
          },
          count: { type: "integer" },
          rows: {
            type: "array",
            items: { $ref: "#/components/schemas/OHLCVRow" },
          },
          metadata: { $ref: "#/components/schemas/Metadata" },
        },
        required: ["token", "range", "count", "rows", "metadata"],
      },
      UniverseResponse: {
        type: "object",
        properties: {
          count: { type: "integer" },
          tokens: {
            type: "array",
            items: { type: "string" },
          },
          metadata: { $ref: "#/components/schemas/Metadata" },
        },
        required: ["count", "tokens", "metadata"],
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
          "Comma-separated list of instrument identifiers (e.g., `BTC_USDT_BINANCE,ETH_USDT_BINANCE`).",
      },
      Limit: {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 200000 },
        description: "Maximum rows to return. Defaults to 200,000.",
      },
      TokenParam: {
        name: "token",
        in: "query",
        required: true,
        schema: { type: "string" },
        description: "Instrument identifier (e.g., `BTC_USDT_BINANCE`).",
      },
    },
  },
  paths: {
    "/latest": {
      get: {
        tags: ["Predictions"],
        summary: "Latest prediction snapshot",
        description: "Returns all prediction rows for the most recent processed date.",
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
            description: "Missing Supabase bearer header.",
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
        security: [{ QuantPulseApiKey: [], SupabaseAnonKey: [] }],
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
          { $ref: "#/components/parameters/Limit" },
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
            description: "Missing Supabase bearer header.",
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
        security: [{ QuantPulseApiKey: [], SupabaseAnonKey: [] }],
      },
    },
    "/ohlcv": {
      get: {
        tags: ["Reference Data"],
        summary: "Daily OHLCV series",
        description: "Retrieve normalized OHLCV values for a token across a date range.",
        parameters: [
          { $ref: "#/components/parameters/TokenParam" },
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
            description: "Missing token or dates.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
          401: {
            description: "Missing Supabase bearer header.",
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
        security: [{ QuantPulseApiKey: [], SupabaseAnonKey: [] }],
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
            description: "Missing Supabase bearer header.",
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
        security: [{ QuantPulseApiKey: [], SupabaseAnonKey: [] }],
      },
    },
  },
};

export default spec;
