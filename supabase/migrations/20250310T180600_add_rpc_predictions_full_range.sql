-- RPC to return full prediction rows for a date range (optionally filtered by tokens)
-- Bypasses PostgREST single-call row caps by using a stable SQL function.
create or replace function public.rpc_predictions_full_range(
  start_date date,
  end_date date,
  tokens text[] default null
)
returns table (
  date date,
  symbol_id text,
  y_pred double precision
)
language sql
stable
security invoker
set search_path = 'public'
as $$
  select
    p.date::date as date,
    p.symbol_id::text as symbol_id,
    p.y_pred::double precision as y_pred
  from public.predictions p
  where p.date >= start_date
    and p.date <= end_date
    and (
      tokens is null
      or coalesce(array_length(tokens, 1), 0) = 0
      or p.symbol_id = any(tokens)
      or split_part(p.symbol_id, '_', 1) = any(tokens)
    )
  order by p.date asc, p.symbol_id asc;
$$;

