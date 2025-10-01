# QuantPulse Dashboard

Vite + React application that renders the QuantPulse dashboard using Supabase Edge Functions for all analytics and lead-capture APIs.

## Prerequisites

- Node.js 18 LTS or newer
- npm 9+

## Environment Configuration

1. Copy `.env.example` to `.env.local` (or `.env`).
2. Provide the Supabase frontend credentials:

   - `VITE_SUPABASE_URL`: Your project URL (`https://<project>.supabase.co`).
   - `VITE_SUPABASE_ANON_KEY`: The anon/public key from **Project Settings → API**.
   - `VITE_SUPABASE_FUNCTION_URL` *(optional)*: Override the default function base (`${VITE_SUPABASE_URL}/functions/v1`).
   - `VITE_API_DEBUG`: Set to `true` for verbose client logging.

## Development Workflow

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Build an optimized production bundle:

```bash
npm run build
```

## Supabase Connectivity Test

Use the service-role secrets file to validate that the required RPCs exist and return data:

```bash
npm run test:supabase supabase/.env.dev
```

This invokes the database functions shown in the Supabase API docs (e.g. `rpc_symbol_ic`, `rpc_predictions_coverage`).

## Supabase Edge Functions

The legacy Aurora-backed lambdas have been ported to Supabase Edge Functions under `supabase/functions`. Each function returns the same JSON payloads and Plotly HTML as before, but now connects directly to your Supabase Postgres instance.

### Database helpers

Complex analytics now execute inside Postgres via stored procedures. The definitions live in `supabase/migrations/20250301T000000_create_dashboard_functions.sql`. Apply the migration once (SQL editor or `supabase db push`) so the RPC endpoints such as `rpc_symbol_ic`, `rpc_predictions_coverage` are available to the edge functions.

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

### Automated validation

Once the migration is applied you can confirm the RPCs and table access with:

```bash
npm run test:supabase supabase/.env.dev
```

The script exercises each stored procedure via the service-role key so you can catch schema mismatches before deploying edge functions.

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
