-- Parameterized equity curve using daily_dashboard_metrics spreads
create or replace function rpc_equity_curve(
  start_date date,
  end_date date,
  p_horizon text default '1d',
  p_top_pct double precision default 0.1,
  daily_fee double precision default 0.003,
  p_limit integer default 100000,
  p_offset integer default 0
) returns table(date date, equity double precision)
language sql
stable
as $$
  with base as (
    select
      d.date,
      (
        case when p_horizon = '3d' then
          case when p_top_pct <= 0.05 then d.cs_top_bottom_p05_spread_3d else d.cs_top_bottom_decile_spread_3d end
        else
          case when p_top_pct <= 0.05 then d.cs_top_bottom_p05_spread_1d else d.cs_top_bottom_decile_spread_1d end
        end
      ) - coalesce(daily_fee, 0) as daily_return
    from daily_dashboard_metrics d
    where d.date between start_date and end_date
    order by d.date
  ), rn_base as (
    select date, daily_return, row_number() over (order by date) as rn
    from base
  ), sampled as (
    -- For 3d horizon, take every 3rd observation to avoid overlapping windows
    select date, daily_return
    from rn_base
    where case when p_horizon = '3d' then (rn % 3 = 1) else true end
    order by date
  )
  select
    date,
    exp(sum(ln(1 + greatest(-0.999999, coalesce(daily_return,0)))) over (
      order by date rows between unbounded preceding and current row
    )) - 1 as equity
  from sampled
  order by date
  limit p_limit offset p_offset;
$$;
