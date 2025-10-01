set search_path = public;

-- 1) IC by symbol (1d-only)
create or replace function rpc_symbol_ic(
  start_date date,
  end_date date,
  min_points integer default 10
) returns table(symbol text, spearman_ic double precision, observation_count bigint)
language sql
as $$
with base as (
  select
    split_part(symbol_id, '_', 1) as symbol,
    date,
    y_pred as pred,
    forward_returns_1 as ret
  from predictions
  where date between start_date and end_date
    and y_pred is not null
    and forward_returns_1 is not null
),
ranks as (
  select
    symbol,
    date,
    percent_rank() over (partition by symbol order by pred) as r_pred,
    percent_rank() over (partition by symbol order by ret)  as r_ret
  from base
)
select
  symbol,
  corr(r_pred::double precision, r_ret::double precision) as spearman_ic,
  count(*)::bigint                                         as observation_count
from ranks
group by symbol
having count(*) >= min_points
order by spearman_ic desc;
$$;

-- 2) Predictions coverage by month (1d-only)
create or replace function rpc_predictions_coverage(
  start_date date,
  end_date date
) returns table(month text, day_count bigint)
language sql
as $$
select to_char(date_trunc('month', date), 'YYYY-MM') as month,
       count(distinct date) as day_count
  from predictions
 where date between start_date and end_date
 group by 1
 order by 1;
$$;

-- 3) Cross-sectional regression metrics over a date range
create or replace function rpc_cross_sectional_metrics_time_series(
  start_date date,
  end_date date
) returns table(
  date date,
  cross_sectional_ic_1d double precision,
  rolling_30d_avg_ic double precision,
  cs_top_bottom_decile_spread double precision,
  rolling_30d_avg_top_bottom_decile_spread double precision,
  rolling_30d_hit_rate double precision
)
language sql
as $$
select
  date,
  nullif(cross_sectional_ic_1d, '')::double precision,
  nullif(rolling_30d_avg_ic, '')::double precision,
  nullif(cs_top_bottom_decile_spread, '')::double precision,
  nullif(rolling_30d_avg_top_bottom_decile_spread, '')::double precision,
  nullif(rolling_30d_hit_rate, '')::double precision
from cross_sectional_metrics_1d
where date between start_date and end_date
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
  nullif(p.y_pred, '')::double precision as y_pred
from predictions p
join latest l on p.date = l.max_date
where p.y_pred is not null
  and p.symbol_id is not null;
$$;
