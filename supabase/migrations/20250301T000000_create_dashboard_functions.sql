-- Quintile average returns by predictions within a date range
create or replace function rpc_quintile_returns(
  start_date date,
  end_date date
) returns table(quintile int, avg_return_1d double precision)
language sql
stable
as $$
  with base as (
    select date, predicted_returns_1, forward_returns_1
    from predictions
    where date between start_date and end_date
      and predicted_returns_1 is not null and forward_returns_1 is not null
  ),
  ranked as (
    select
      date,
      ntile(5) over (partition by date order by predicted_returns_1) as quintile,
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

-- Horizon-aware quintile returns (1d or 3d)
create or replace function rpc_quintile_returns_v2(
  start_date date,
  end_date date,
  p_horizon text default '1d'
) returns table(quintile int, avg_return double precision)
language sql
stable
as $$
  with base as (
    select date,
           case when p_horizon='3d' then predicted_returns_3 else predicted_returns_1 end as pred,
           case when p_horizon='3d' then forward_returns_3 else forward_returns_1 end as fwd
    from predictions
    where date between start_date and end_date
      and (case when p_horizon='3d' then predicted_returns_3 else predicted_returns_1 end) is not null
      and (case when p_horizon='3d' then forward_returns_3 else forward_returns_1 end) is not null
  ), ranked as (
    select date,
           ntile(5) over (partition by date order by pred) as quintile,
           fwd
    from base
  ), per_date as (
    select date, quintile, avg(fwd) as avg_ret
    from ranked
    group by date, quintile
  )
  select quintile, avg(avg_ret) as avg_return
  from per_date
  group by quintile
  order by quintile;
$$;

-- Latest prediction snapshot (horizon-aware)
create or replace function rpc_latest_predictions_snapshot(
  p_horizon text default '1d'
)
returns table(
  date date,
  symbol_id text,
  predicted_return double precision
)
language sql
stable
as $$
with latest as (
  select max(date) as max_date
  from predictions
  where (case when p_horizon = '3d' then predicted_returns_3 else predicted_returns_1 end) is not null
)
select
  p.date,
  p.symbol_id,
  (case when p_horizon = '3d' then p.predicted_returns_3 else p.predicted_returns_1 end) as predicted_return
from predictions p
join latest l on p.date = l.max_date
where (case when p_horizon = '3d' then p.predicted_returns_3 else p.predicted_returns_1 end) is not null
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
  set statement_timeout = '0';
  with preds as (
    select
      date,
      symbol_id,
      ntile(10) over (partition by date order by predicted_returns_1) as cs_decile
    from predictions
    where date between start_date and end_date
  ),
  vols as (
    select
      date,
      symbol_id,
      avg(volume) over (partition by symbol_id order by date rows between 29 preceding and current row) as adv_30
    from ohlcv_1d
    where 
      date between (start_date - interval '29 days')::date and end_date
  ),
  joined as (
    select p.cs_decile as decile, v.adv_30
    from preds p inner join vols v 
    on p.date = v.date and p.symbol_id = v.symbol_id
  )
  
  select decile,
         percentile_cont(0.5) within group (order by adv_30) as median_adv_30
  from joined
  group by decile
  order by decile;
$$;
