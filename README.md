# QuantPulse Dashboard

Vite + React application that renders the QuantPulse dashboard with a pluggable data layer. The UI can run entirely against local mocks for development, or point to your AWS API Gateway + Lambda endpoints for live metrics.

## Prerequisites

- Node.js 18 LTS or newer
- npm 9+

## Environment Configuration

1. Copy `.env.example` to `.env.local` (or `.env`) in the project root.
2. Set the following variables as needed:

   - `VITE_API_MODE`: `mock` (default) keeps everything local; set to `network` to call your API Gateway endpoints.
   - `VITE_API_BASE_URL`: Base HTTPS URL for the deployed API (required when `VITE_API_MODE=network`).
   - `VITE_API_TIMEOUT_MS`: Client-side request timeout in milliseconds (default `10000`).
   - `VITE_API_RETRY_COUNT`: Number of automatic retries for 5xx responses (default `1`).
   - `VITE_API_DEBUG`: Set to `true` to see verbose client logging in the console.

## Development Workflow

Install dependencies and start the dev server with mock data:

```bash
npm install
npm run dev
```

Build an optimized production bundle:

```bash
npm run build
```

## API Smoke Test

Run a lightweight integration check against whichever backend mode is configured via env vars:

```bash
npm run test:api
```

When `VITE_API_MODE` is `mock` the smoke test verifies the in-memory fixtures; when pointing at your API Gateway it exercises the live Lambda endpoints.
