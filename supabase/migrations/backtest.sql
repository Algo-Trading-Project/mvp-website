WITH base AS (
    SELECT
        date,
        cs_top_bottom_decile_spread_1d - 0.003 AS cs_top_bottom_decile_spread_1d
    FROM daily_dashboard_metrics
)

SELECT
    date,
    EXP(SUM(LN(1 + cs_top_bottom_decile_spread_1d)) OVER (
        ORDER BY date 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )) - 1 AS equity_curve_top_bottom_decile_1d
FROM base
ORDER BY date;