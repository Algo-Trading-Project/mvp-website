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

-- Removed: rpc_rolling_hit_rate (replaced by direct reads from cross_sectional_metrics_1d.rolling_30d_hit_rate)

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

-- Median ADV 30 by prediction decile (capacity proxy)
create or replace function rpc_adv_by_decile(
  start_date date,
  end_date date
) returns table(decile int, median_adv_30 double precision)
language sql
stable
as $$
  with preds as (
    select
      date,
      symbol_id,
      ntile(10) over (partition by date order by y_pred) as cs_decile
    from predictions
    where date between start_date and end_date
  ),
  vols as (
    select
      date,
      symbol_id,
      avg(volume) over (partition by symbol_id order by date rows between 29 preceding and current row) as adv_30
    from ohlcv_1d
    where volume is not null
      and date between (start_date - interval '29 days')::date and end_date
  ),
  joined as (
    select p.cs_decile as decile, v.adv_30
    from preds p
    left join vols v on p.date = v.date and p.symbol_id = v.symbol_id
    where v.adv_30 is not null
  )
  select decile,
         percentile_cont(0.5) within group (order by adv_30) as median_adv_30
  from joined
  group by decile
  order by decile;
$$;
