-- Stored procedures to support edge function analytics
set search_path = public;

create or replace function rpc_symbol_expectancy(
  horizon text,
  direction text,
  start_date date,
  end_date date,
  min_obs integer default 5
) returns table(symbol text, avg_expectancy double precision, observation_count bigint)
language plpgsql
as $$
declare
  proba_column text;
  ret_column text;
begin
  if horizon not in ('1d', '7d') then
    raise exception 'Unsupported horizon %', horizon;
  end if;

  if direction not in ('long', 'short') then
    raise exception 'Unsupported direction %', direction;
  end if;

  proba_column := case
    when horizon = '7d' and direction = 'short' then 'y_pred_proba_7d_short'
    when horizon = '7d' then 'y_pred_proba_7d_long'
    when direction = 'short' then 'y_pred_proba_1d_short'
    else 'y_pred_proba_1d_long'
  end;

  ret_column := case horizon when '7d' then 'forward_returns_7' else 'forward_returns_1' end;

  return query execute format(
    'with scored as (
       select
         split_part(symbol_id, ''_'', 1) as symbol,
         case
           when $3 = ''long'' and (%1$s)::double precision >= 0.5 then (%2$s)::double precision
           when $3 = ''short'' and (%1$s)::double precision >= 0.5 then -(%2$s)::double precision
           else null
         end as expectancy
       from predictions
       where date::date between $1 and $2
         and %2$s is not null
     )
     select symbol,
            avg(expectancy) as avg_expectancy,
            count(*) as observation_count
       from scored
      where expectancy is not null
      group by symbol
      having count(*) >= $4
      order by avg_expectancy desc',
    proba_column,
    ret_column
  ) using start_date, end_date, direction, min_obs;
end;
$$;

create or replace function rpc_symbol_ic(
  horizon text,
  start_date date,
  end_date date,
  min_points integer default 10
) returns table(symbol text, spearman_ic double precision, observation_count bigint)
language sql
as $$
with base as (
  select
    split_part(symbol_id, ''_'', 1) as symbol
    date,
    case when horizon = '7d' then y_pred_7d else y_pred_1d end       as pred,
    case when horizon = '7d' then forward_returns_7 else forward_returns_1 end as ret
  from predictions
  where date between start_date and end_date
    and case when horizon = '7d' then y_pred_7d else y_pred_1d end is not null
    and case when horizon = '7d' then forward_returns_7 else forward_returns_1 end is not null
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


create or replace function rpc_expectancy_distribution_summary(
  field_name text,
  start_date date,
  end_date date
) returns table(mean double precision, std double precision, pos double precision)
language plpgsql
as $$
declare
  safe_field text;
begin
  safe_field := case field_name
    when 'cs_1d_expectancy' then field_name
    when 'cs_1d_long_expectancy' then field_name
    when 'cs_1d_short_expectancy' then field_name
    when 'cs_7d_expectancy' then field_name
    when 'cs_7d_long_expectancy' then field_name
    when 'cs_7d_short_expectancy' then field_name
    else null end;

  if safe_field is null then
    raise exception 'Unsupported field %', field_name;
  end if;

  return query execute format(
    'select avg((%1$s)::double precision) as mean,
            coalesce(stddev_pop((%1$s)::double precision), 0) as std,
            avg(case when (%1$s)::double precision > 0 then 1 else 0 end)::double precision as pos
       from cross_sectional_metrics_1d
      where date::date between $1 and $2
        and %1$s is not null',
    safe_field
  ) using start_date, end_date;
end;
$$;
