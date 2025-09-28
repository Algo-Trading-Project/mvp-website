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

## Supabase Edge Functions

The legacy Aurora-backed lambdas have been ported to Supabase Edge Functions under `supabase/functions`. Each function returns the same JSON payloads and Plotly HTML as before, but now connects directly to your Supabase Postgres instance.

### Required Secrets

Set the following secrets on your Supabase project (using the dashboard or CLI). All functions expect these environment variables:

- `SUPABASE_URL`: Project REST URL (e.g. `https://<project>.supabase.co`).
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for server-side auth checks.
- `SUPABASE_DB_URL`: Full Postgres connection string with SSL enabled. Use the pooled connection URL (append `?sslmode=require&pgbouncer=true`).
- `SUPABASE_DB_POOL_SIZE` *(optional)*: Override the default pool size (4) used by the edge runtime.

Example with the Supabase CLI:

```bash
supabase secrets set \
  SUPABASE_URL="https://<project>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
  SUPABASE_DB_URL="postgres://postgres:<password>@db.<project>.supabase.co:5432/postgres?sslmode=require&pgbouncer=true"
```

### Local Iteration

Copy `supabase/.env.example` to `supabase/.env.dev` and fill in your project credentials, then use the Supabase CLI to run an individual edge function locally (hot reloading included):

```bash
supabase functions serve decile-lift-plot --env-file supabase/.env.dev
```

Populate `supabase/.env.dev` with the same secrets listed above for local development.

### Deploying Functions

1. Authenticate once: `supabase login` and `supabase link --project-ref <project-ref>`.
2. Deploy an individual function:

   ```bash
   supabase functions deploy decile-lift-plot --project-ref <project-ref>
   ```

3. Or deploy everything in one shot:

   ```bash
   supabase functions deploy --project-ref <project-ref>
   ```

After deployment each function is available at `https://<project>.functions.supabase.co/<function-name>` and shares the same request/response contract as the previous AWS endpoints.
