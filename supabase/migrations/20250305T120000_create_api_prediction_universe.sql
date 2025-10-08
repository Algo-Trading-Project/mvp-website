create or replace function public.api_prediction_universe()
returns text[]
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    array_agg(symbol order by symbol),
    array[]::text[]
  )
  from (
    select distinct upper(trim(both from symbol_id)::text) as symbol
    from public.predictions
    where symbol_id is not null
      and length(trim(both from symbol_id)) > 0
  ) distinct_symbols;
$$;
