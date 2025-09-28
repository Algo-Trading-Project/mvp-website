-- Stored procedures to support edge function analytics
set search_path = public;

create or replace function rpc_decile_lift(
  horizon text,
  direction text,
  start_date date,
  end_date date
) returns table(decile integer, avg_return double precision, n bigint)
language plpgsql
as $$
declare
  pred_column text;
  ret_column text;
  order_multiplier int := 1;
begin
  pred_column := case horizon when '7d' then 'y_pred_7d' else 'y_pred_1d' end;
  ret_column := case horizon when '7d' then 'forward_returns_7' else 'forward_returns_1' end;

  if coalesce(direction, 'long') = 'short' then
    order_multiplier := -1;
  end if;

  return query execute format(
    'with ranked as (
       select
         ntile(10) over (
           order by (%1$s)::double precision * %2$s
         ) as decile,
         (%3$s)::double precision as ret
       from predictions
       where date::date between $1 and $2
         and %1$s is not null
         and %3$s is not null
     )
     select decile, avg(ret) as avg_return, count(*) as n
     from ranked
     group by decile
     order by decile',
    pred_column,
    order_multiplier,
    ret_column
  )
  using start_date, end_date;
end;
$$;

create or replace function rpc_decile_performance(
  horizon text,
  direction text,
  start_date date,
  end_date date
) returns table(decile integer, avg_return double precision, n bigint)
language plpgsql
as $$
declare
  pred_column text;
  ret_column text;
  order_direction text;
begin
  pred_column := case horizon when '7d' then 'y_pred_7d' else 'y_pred_1d' end;
  ret_column := case horizon when '7d' then 'forward_returns_7' else 'forward_returns_1' end;
  order_direction := case when coalesce(direction, 'long') = 'short' then 'asc' else 'desc' end;

  return query execute format(
    'with ranked as (
       select
         ntile(10) over (
           partition by date
           order by %1$s %4$s
         ) as decile,
         (%2$s)::double precision as ret
       from predictions
       where date::date between $1 and $2
         and %1$s is not null
         and %2$s is not null
     )
     select decile, avg(ret) as avg_return, count(*) as n
     from ranked
     group by decile
     order by decile',
    pred_column,
    ret_column,
    order_direction,
    order_direction
  )
  using start_date, end_date;
end;
$$;

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
  pred_column text;
  ret_column text;
  filter_clause text := 'TRUE';
begin
  pred_column := case horizon when '7d' then 'y_pred_7d' else 'y_pred_1d' end;
  ret_column := case horizon when '7d' then 'forward_returns_7' else 'forward_returns_1' end;

  if coalesce(direction, 'combined') = 'long' then
    filter_clause := format('(%s)::double precision > 0', pred_column);
  elsif coalesce(direction, 'combined') = 'short' then
    filter_clause := format('(%s)::double precision < 0', pred_column);
  end if;

  return query execute format(
    'select split_part(symbol_id, ''_'', 1) as symbol,
            avg((%1$s)::double precision) as avg_expectancy,
            count(*) as observation_count
       from predictions
      where date::date between $1 and $2
        and %1$s is not null
        and %2$s is not null
        and %3$s
      group by split_part(symbol_id, ''_'', 1)
      having count(*) >= $3
      order by avg_expectancy desc',
    ret_column,
    pred_column,
    filter_clause
  ) using start_date, end_date, min_obs;
end;
$$;

create or replace function rpc_symbol_ic(
  horizon text,
  start_date date,
  end_date date,
  min_points integer default 10
) returns table(symbol text, spearman_ic double precision, observation_count bigint)
language plpgsql
as $$
declare
  pred_column text;
  ret_column text;
begin
  pred_column := case horizon when '7d' then 'y_pred_7d' else 'y_pred_1d' end;
  ret_column := case horizon when '7d' then 'forward_returns_7' else 'forward_returns_1' end;

  return query execute format(
    'with ranked_data as (
       select
         split_part(symbol_id, ''_'', 1) as symbol,
         date,
         rank() over (
           partition by date
           order by %1$s::double precision
         ) as pred_rank,
         rank() over (
           partition by date
           order by %2$s::double precision
         ) as ret_rank
       from predictions
       where date::date between $1 and $2
         and %1$s is not null
         and %2$s is not null
    )
     select symbol,
            corr(pred_rank::double precision, ret_rank::double precision) as spearman_ic,
            count(*) as observation_count
       from ranked_data
      group by symbol
     having count(*) >= $3
     order by spearman_ic desc',
    pred_column,
    ret_column
  ) using start_date, end_date, min_points;
end;
$$;

create or replace function rpc_predictions_coverage(
  p_start_date date,
  p_end_date date
) returns table(month text, day_count bigint)
language sql
as $$
  select to_char(date_trunc('month', date::date), 'YYYY-MM') as month,
         count(*)::bigint as day_count
    from predictions
   where date::date between coalesce(p_start_date, (select min(date::date) from predictions))
                 and coalesce(p_end_date, (select max(date::date) from predictions))
   group by 1
   order by 1;
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
