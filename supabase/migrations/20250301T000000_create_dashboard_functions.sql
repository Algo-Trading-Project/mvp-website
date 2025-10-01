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
