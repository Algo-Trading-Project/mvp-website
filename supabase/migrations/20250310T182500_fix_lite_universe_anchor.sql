-- Rebuild Lite universe to anchor on latest available OHLCV date,
-- avoiding empty results when data is not up to current_date.

create or replace view public.product_lite_universe_60 as
with anchor as (
  select coalesce(max(date), current_date)::date as asof from public.ohlcv_1d
), recent as (
  select
    o.symbol_id,
    o.date::date as d,
    (coalesce(o.close,0)::double precision * coalesce(o.volume,0)::double precision) as notional_usd
  from public.ohlcv_1d o, anchor a
  where o.symbol_id like '%_USDT_BINANCE'
    and o.date::date between (a.asof - interval '90 days')::date and a.asof
), agg as (
  select
    symbol_id,
    percentile_cont(0.5) within group (order by notional_usd) as adv_usd_p50,
    count(*) as days
  from recent
  group by symbol_id
)
select a.symbol_id, a.adv_usd_p50
from agg a
where a.days >= 45
  and split_part(a.symbol_id,'_',1) not in (
    'USDT','USDC','BUSD','TUSD','FDUSD','DAI','USDD','UST','EURS'
  )
order by a.adv_usd_p50 desc
limit 60;

