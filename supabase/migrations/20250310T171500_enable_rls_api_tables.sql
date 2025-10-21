-- Enable RLS and add minimal SELECT policies for product API tables
-- Entitlement predicate: authenticated users with active subscriptions and a current period end in the future

-- predictions
alter table if exists public.predictions enable row level security;
drop policy if exists predictions_select_entitled on public.predictions;
create policy predictions_select_entitled
  on public.predictions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.user_id = auth.uid()
        and u.subscription_status = 'active'
    )
  );

-- ohlcv_1d
alter table if exists public.ohlcv_1d enable row level security;
drop policy if exists ohlcv_select_entitled on public.ohlcv_1d;
create policy ohlcv_select_entitled
  on public.ohlcv_1d
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.user_id = auth.uid()
        and u.subscription_status = 'active'
    )
  );

-- Note:
-- 1) Service role queries (Edge Functions using service key) bypass RLS.
-- 2) API endpoints that impersonate the user via createAuthedClient(user_id)
--    will be subject to these policies.
-- 3) You can extend entitlements later (date range limits, token whitelists)
--    in the Edge Functions; policies here are intentionally minimal.

-- public.users: enable RLS and allow each authenticated user to read their own row
alter table if exists public.users enable row level security;
drop policy if exists users_select_own on public.users;
create policy users_select_own
  on public.users
  for select
  to authenticated
  using (user_id = auth.uid());
