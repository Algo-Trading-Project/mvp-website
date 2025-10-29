-- Create RPC to compute range-aware IC and Spread summaries from daily_dashboard_metrics
create or replace function public.range_summary(
  start_date date,
  end_date date,
  horizon text,
  use_p05 boolean
)
returns table (
  ic_mean double precision,
  ic_std double precision,
  ic_positive double precision,
  ic_icir_ann double precision,
  spread_mean double precision,
  spread_std double precision,
  spread_sharpe_ann double precision,
  spread_positive double precision
)
language sql
stable
as $$
  with filtered as (
    select *
    from daily_dashboard_metrics d
    where d.date between start_date and end_date
  ), vals as (
    select
      case when lower(horizon) = '3d' then d.cs_spearman_ic_3d else d.cs_spearman_ic_1d end as ic,
      case
        when use_p05 and lower(horizon) = '3d' then d.cs_top_bottom_p05_spread_3d
        when use_p05 and lower(horizon) <> '3d' then d.cs_top_bottom_p05_spread_1d
        when not use_p05 and lower(horizon) = '3d' then d.cs_top_bottom_decile_spread_3d
        else d.cs_top_bottom_decile_spread_1d
      end as sp
    from filtered d
  )
  select
    avg(ic)::double precision as ic_mean,
    stddev_samp(ic)::double precision as ic_std,
    avg(case when ic > 0 then 1 else 0 end)::double precision as ic_positive,
    (avg(ic) / stddev_samp(ic)) * sqrt(365) end::double precision as icir_ann,
    avg(sp)::double precision as spread_mean,
    stddev_samp(sp)::double precision as spread_std,
    (avg(sp) / stddev_samp(sp)) * sqrt(365) end::double precision as spread_sharpe_ann,
    avg(case when sp > 0 then 1 else 0 end)::double precision as spread_positive;
$$;

-- Grant execute to anon/authenticated by default (adjust to your policy)
grant execute on function public.range_summary(date, date, text, boolean) to anon, authenticated, service_role;

