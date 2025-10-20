-- Create a minimal Stripe webhook event log for idempotency
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  processing_started_at timestamptz,
  processed_at timestamptz
);

-- Helpful index for housekeeping/inspection
create index if not exists stripe_webhook_events_received_at_idx
  on public.stripe_webhook_events (received_at desc);

-- No RLS required (service role client in functions bypasses RLS). If you enable RLS globally,
-- ensure service role or a dedicated policy can write to this table.

