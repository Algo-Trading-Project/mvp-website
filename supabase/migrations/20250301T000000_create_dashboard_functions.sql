-- Quintile average returns by predictions within a date range
create or replace function rpc_quintile_returns(
  start_date date,
  end_date date
) returns table(quintile int, avg_return_1d double precision)
language sql
stable
as $$
  with base as (
    select date, y_pred, forward_returns_1
    from predictions
    where date between start_date and end_date
      and y_pred is not null and forward_returns_1 is not null
  ),
  ranked as (
    select
      date,
      ntile(5) over (partition by date order by y_pred) - 1 as quintile,
      forward_returns_1
    from base
  ),
  per_date as (
    select date, quintile, avg(forward_returns_1) as avg_ret
    from ranked
    group by date, quintile
  )
  select quintile, avg(avg_ret) as avg_return_1d
  from per_date
  group by quintile
  order by quintile;
$$;

-- Rolling hit rate: sign match between prediction and 1d forward return
create or replace function rpc_rolling_hit_rate(
  start_date date,
  end_date date,
  "window" integer default 30
) returns table(date date, rate double precision)
language sql
stable
as $$
  with daily as (
    select date,
           avg(case when sign(y_pred) = sign(forward_returns_1) then 1 else 0 end)::double precision as daily_rate
    from predictions
    where date between start_date and end_date
      and y_pred is not null and forward_returns_1 is not null
    group by date
  ),
  shifted as (
    select date, lag(daily_rate) over (order by date) as lag_rate
    from daily
  )
  select date,
         avg(lag_rate) over (order by date rows between ("window" - 1) preceding and 1 preceding) as rate
  from shifted
  order by date;
$$;

-- 4) Latest cross-sectional regression metrics snapshot
create or replace function rpc_latest_cross_sectional_metrics()
returns table(
  date date,
  rolling_30d_avg_ic double precision,
  rolling_30d_avg_top_bottom_decile_spread double precision,
  rolling_30d_hit_rate double precision
)
language sql
as $$
select
  date,
  nullif(rolling_30d_avg_ic, '')::double precision,
  nullif(rolling_30d_avg_top_bottom_decile_spread, '')::double precision,
  nullif(rolling_30d_hit_rate, '')::double precision
from cross_sectional_metrics_1d
where rolling_30d_avg_ic is not null
   or rolling_30d_avg_top_bottom_decile_spread is not null
   or rolling_30d_hit_rate is not null
order by date desc
limit 1;
$$;

-- 5) Latest prediction snapshot for 1d regression model
create or replace function rpc_latest_predictions_snapshot()
returns table(
  date date,
  symbol_id text,
  y_pred double precision
)
language sql
as $$
with latest as (
  select max(date) as max_date
  from predictions
  where y_pred is not null
)
select
  p.date,
  p.symbol_id,
  p.y_pred
from predictions p
join latest l on p.date = l.max_date
where p.y_pred is not null
  and p.symbol_id is not null;
$$;

-- Optional: ensure corr() works with text-typed inputs by explicit casting in case schemas drift
-- (No-op if already double precision)
