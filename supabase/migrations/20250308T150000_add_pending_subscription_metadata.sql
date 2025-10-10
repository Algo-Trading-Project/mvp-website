-- Add pending subscription metadata columns to public.users
alter table public.users
  add column if not exists subscription_pending_plan_slug text,
  add column if not exists subscription_pending_billing_cycle text,
  add column if not exists subscription_pending_effective_date timestamptz,
  add column if not exists subscription_pending_schedule_id text;
create or replace function public.sync_user_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  hashed_key text := coalesce(meta ->> 'api_key_hash', '');
  subscription_tier text := coalesce(meta ->> 'subscription_tier', meta ->> 'subscription_level');
  subscription_status text := meta ->> 'subscription_status';
  billing_cycle text := meta ->> 'billing_cycle';
  current_period_end timestamptz := nullif(meta ->> 'current_period_end', '')::timestamptz;
  plan_started_at timestamptz := nullif(meta ->> 'plan_started_at', '')::timestamptz;
  last_login timestamptz := coalesce(nullif(meta ->> 'last_login', '')::timestamptz, new.last_sign_in_at);
  email_verified boolean := coalesce((meta ->> 'email_verified')::boolean, new.email_confirmed_at is not null);
  marketing_opt_in boolean := coalesce((meta ->> 'marketing_opt_in')::boolean, false);
  weekly_summary boolean := coalesce((meta ->> 'weekly_summary')::boolean, false);
  product_updates boolean := coalesce((meta ->> 'product_updates')::boolean, false);
  stripe_customer_id text := meta ->> 'stripe_customer_id';
  stripe_subscription_id text := meta ->> 'stripe_subscription_id';
  subscription_cancel_at_period_end boolean := coalesce((meta ->> 'subscription_cancel_at_period_end')::boolean, false);
  subscription_pending_plan_slug text := nullif(meta ->> 'subscription_pending_plan_slug', '');
  subscription_pending_billing_cycle text := nullif(meta ->> 'subscription_pending_billing_cycle', '');
  subscription_pending_effective_date timestamptz := nullif(meta ->> 'subscription_pending_effective_date', '')::timestamptz;
  subscription_pending_schedule_id text := nullif(meta ->> 'subscription_pending_schedule_id', '');
begin
  insert into public.users as u (
    user_id,
    api_key_hash,
    email,
    subscription_tier,
    subscription_status,
    billing_cycle,
    current_period_end,
    plan_started_at,
    last_login_at,
    email_verified,
    marketing_opt_in,
    weekly_summary,
    product_updates,
    stripe_customer_id,
    stripe_subscription_id,
    subscription_cancel_at_period_end,
    subscription_pending_plan_slug,
    subscription_pending_billing_cycle,
    subscription_pending_effective_date,
    subscription_pending_schedule_id,
    created_at,
    updated_at
  )
  values (
    new.id,
    hashed_key,
    new.email,
    subscription_tier,
    subscription_status,
    billing_cycle,
    current_period_end,
    plan_started_at,
    last_login,
    email_verified,
    marketing_opt_in,
    weekly_summary,
    product_updates,
    stripe_customer_id,
    stripe_subscription_id,
    subscription_cancel_at_period_end,
    subscription_pending_plan_slug,
    subscription_pending_billing_cycle,
    subscription_pending_effective_date,
    subscription_pending_schedule_id,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  )
  on conflict(user_id) do update set
    api_key_hash = excluded.api_key_hash,
    email = excluded.email,
    subscription_tier = excluded.subscription_tier,
    subscription_status = excluded.subscription_status,
    billing_cycle = excluded.billing_cycle,
    current_period_end = excluded.current_period_end,
    plan_started_at = excluded.plan_started_at,
    last_login_at = excluded.last_login_at,
    email_verified = excluded.email_verified,
    marketing_opt_in = excluded.marketing_opt_in,
    weekly_summary = excluded.weekly_summary,
    product_updates = excluded.product_updates,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    subscription_cancel_at_period_end = excluded.subscription_cancel_at_period_end,
    subscription_pending_plan_slug = excluded.subscription_pending_plan_slug,
    subscription_pending_billing_cycle = excluded.subscription_pending_billing_cycle,
    subscription_pending_effective_date = excluded.subscription_pending_effective_date,
    subscription_pending_schedule_id = excluded.subscription_pending_schedule_id,
    updated_at = excluded.updated_at;

  return new;
end;
$$;
