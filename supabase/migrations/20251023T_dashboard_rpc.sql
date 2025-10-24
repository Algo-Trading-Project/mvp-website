-- RPCs for dashboard queries over daily_dashboard_metrics and predictions
-- These functions allow Edge Functions to run all calculations in SQL

-- Rolling IC (1d) over daily_dashboard_metrics
create or replace function rpc_rolling_ic(
  start_date date,
  end_date date,
  window integer default 30,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table(date date, value double precision)
language sql
stable
as $$
  select d.date,
         avg(d.cs_spearman_ic_1d) over (
           order by d.date
           rows between (window - 1) preceding and current row
         ) as value
  from daily_dashboard_metrics d
  where d.date between start_date and end_date
  order by d.date
  limit p_limit offset p_offset;
$$;

-- Rolling top-bottom decile spread (1d)
create or replace function rpc_rolling_spread(
  start_date date,
  end_date date,
  window integer default 30,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table(date date, value double precision)
language sql
stable
as $$
  select d.date,
         avg(d.cs_top_bottom_decile_spread_1d) over (
           order by d.date
           rows between (window - 1) preceding and current row
         ) as value
  from daily_dashboard_metrics d
  where d.date between start_date and end_date
  order by d.date
  limit p_limit offset p_offset;
$$;

-- Rolling 30d hit rate (ratio-of-sums over window)
create or replace function rpc_rolling_hit_rate(
  start_date date,
  end_date date,
  "window" integer default 30,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table(date date, value double precision)
language sql
stable
as $$
  select d.date,
         case when sum(d.total_count_1d) over (
                    order by d.date rows between ("window" - 1) preceding and current row
                  ) > 0
              then (sum(d.cs_hit_count_1d) over (
                      order by d.date rows between ("window" - 1) preceding and current row
                    ))::double precision
                   / nullif(sum(d.total_count_1d) over (
                              order by d.date rows between ("window" - 1) preceding and current row
                            ), 0)
              else null end as value
  from daily_dashboard_metrics d
  where d.date between start_date and end_date
  order by d.date
  limit p_limit offset p_offset;
$$;

-- Per-symbol Spearman IC across time using predictions table
-- Groups by base symbol (split_part before first underscore)
create or replace function rpc_symbol_ic(
  start_date date,
  end_date date,
  min_points integer default 30,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table(symbol text, spearman_ic double precision, observation_count integer)
language sql
stable
as $$
  with base as (
    select split_part(symbol_id, '_', 1) as symbol,
           predicted_returns_1,
           forward_returns_1
    from predictions
    where date between start_date and end_date
      and predicted_returns_1 is not null
      and forward_returns_1 is not null
  ), r as (
    select symbol,
           percent_rank() over (partition by symbol order by predicted_returns_1) as r_pred,
           percent_rank() over (partition by symbol order by forward_returns_1)  as r_ret
    from base
  )
  select symbol,
         corr(r_pred, r_ret) as spearman_ic,
         count(*) as observation_count
  from r
  group by symbol
  having count(*) >= min_points
  order by spearman_ic desc
  limit p_limit offset p_offset;
$$;

-- Median ADV 30 by prediction decile (v2) using predicted_returns_1
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
      ntile(10) over (partition by date order by predicted_returns_1) as cs_decile
    from predictions
    where date between start_date and end_date
      and predicted_returns_1 is not null
  ),
  vols as (
    select
      date,
      symbol_id,
      avg(volume) over (
        partition by symbol_id
        order by date rows between 29 preceding and current row
      ) as adv_30
    from ohlcv_1d
    where date between (start_date - interval '29 days')::date and end_date
  ),
  joined as (
    select p.cs_decile as decile, v.adv_30
    from preds p
    inner join vols v
      on p.date = v.date and p.symbol_id = v.symbol_id
  )
  select decile,
         percentile_cont(0.5) within group (order by adv_30) as median_adv_30
  from joined
  group by decile
  order by decile;
$$;
