-- Create materialized view for daily dashboard metrics
create materialized view if not exists daily_dashboard_metrics as
WITH dates AS (
    SELECT DISTINCT date
    FROM predictions
), 
cs_pred_rankings_1d AS (
    SELECT
        date,
        symbol_id,
        forward_returns_1,
        predicted_returns_1,
        RANK() OVER (PARTITION BY date ORDER BY predicted_returns_1) AS cs_pred_rank_1d,
        RANK() OVER (PARTITION BY date ORDER BY forward_returns_1) AS cs_forward_return_rank_1d,
        PERCENT_RANK() OVER (PARTITION BY date ORDER BY predicted_returns_1) AS cs_pred_percentile_1d
    FROM predictions
    WHERE
        predicted_returns_1 IS NOT NULL AND
        forward_returns_1 IS NOT NULL
), 
cs_metrics_1d AS (
-- Needed metrics, cs_1d_spearman_corr, cs_1d_top_bottom_decile_spread,
-- cs_30d_hit_rate_1d ()
-- no more need to worry about NULLs as they are filtered in the previous CTE
    SELECT
        date,
        CORR(cs_pred_rank_1d, cs_forward_return_rank_1d) AS cs_spearman_ic_1d,
        AVG(forward_returns_1) FILTER (WHERE cs_pred_percentile_1d >= 0.9) - AVG(forward_returns_1) FILTER (WHERE cs_pred_percentile_1d <= 0.1) AS cs_top_bottom_decile_spread_1d,
        AVG(forward_returns_1) FILTER (WHERE cs_pred_percentile_1d >= 0.95) - AVG(forward_returns_1) FILTER (WHERE cs_pred_percentile_1d <= 0.05) AS cs_top_bottom_p05_spread_1d,
        SUM(
            CASE 
                WHEN SIGN(predicted_returns_1) = SIGN(forward_returns_1) THEN 1 
                ELSE 0 
            END
        ) AS cs_hit_count_1d,
        COUNT(forward_returns_1) AS total_count_1d
    FROM cs_pred_rankings_1d
    GROUP BY date
), 
cs_pred_rankings_3d AS (
    SELECT
        date,
        symbol_id,
        forward_returns_3,
        predicted_returns_3,
        RANK() OVER (PARTITION BY date ORDER BY predicted_returns_3) AS cs_pred_rank_3d,
        RANK() OVER (PARTITION BY date ORDER BY forward_returns_3) AS cs_forward_return_rank_3d,
        PERCENT_RANK() OVER (PARTITION BY date ORDER BY predicted_returns_3) AS cs_pred_percentile_3d
    FROM predictions
    WHERE
        predicted_returns_3 IS NOT NULL AND
        forward_returns_3 IS NOT NULL
), 
cs_metrics_3d AS (
-- Needed metrics, cs_3d_spearman_corr, cs_3d_top_bottom_decile_spread,
-- cs_30d_hit_rate_3d ()
-- no more need to worry about NULLs as they are filtered in the previous CTE
    SELECT
        date,
        CORR(cs_pred_rank_3d, cs_forward_return_rank_3d) AS cs_spearman_ic_3d,
        AVG(forward_returns_3) FILTER (WHERE cs_pred_percentile_3d >= 0.9) - AVG(forward_returns_3) FILTER (WHERE cs_pred_percentile_3d <= 0.1) AS cs_top_bottom_decile_spread_3d,
        AVG(forward_returns_3) FILTER (WHERE cs_pred_percentile_3d >= 0.95) - AVG(forward_returns_3) FILTER (WHERE cs_pred_percentile_3d <= 0.05) AS cs_top_bottom_p05_spread_3d,
        SUM(
            CASE 
                WHEN SIGN(predicted_returns_3) = SIGN(forward_returns_3) THEN 1 
                ELSE 0 
            END
        ) AS cs_hit_count_3d,
        COUNT(forward_returns_3) AS total_count_3d
    FROM cs_pred_rankings_3d
    GROUP BY date
),
cs_metrics_joined AS (
    SELECT
        -- Date (keeps days with NULL forward returns)
        d.date,
        -- 1d metrics
        m1d.cs_spearman_ic_1d,
        m1d.cs_top_bottom_decile_spread_1d,
        m1d.cs_top_bottom_p05_spread_1d,
        m1d.cs_hit_count_1d,
        m1d.total_count_1d,
        -- 3d metrics
        m3d.cs_spearman_ic_3d,
        m3d.cs_top_bottom_decile_spread_3d,
        m3d.cs_top_bottom_p05_spread_3d,
        m3d.cs_hit_count_3d,
        m3d.total_count_3d
    FROM dates d
    LEFT JOIN cs_metrics_1d m1d ON d.date = m1d.date
    LEFT JOIN cs_metrics_3d m3d ON d.date = m3d.date
),
rolling_averages AS (
    SELECT
        date,
        cs_spearman_ic_1d,
        AVG(cs_spearman_ic_1d) OVER (
            ORDER BY date 
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) AS rolling_30d_avg_ic_1d,
        cs_spearman_ic_3d,
        AVG(cs_spearman_ic_3d) OVER (
            ORDER BY date 
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) AS rolling_30d_avg_ic_3d,
        cs_top_bottom_decile_spread_1d,
        AVG(cs_top_bottom_decile_spread_1d) OVER (
            ORDER BY date 
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) AS rolling_30d_avg_top_bottom_decile_spread_1d,
        cs_top_bottom_decile_spread_3d,
        AVG(cs_top_bottom_decile_spread_3d) OVER (
            ORDER BY date 
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) AS rolling_30d_avg_top_bottom_decile_spread_3d,
        1.0 * SUM(cs_hit_count_1d) OVER (
            ORDER BY date 
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) / SUM(total_count_1d) OVER (
            ORDER BY date 
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) AS rolling_30d_hit_rate_1d,
        1.0 * SUM(cs_hit_count_3d) OVER (
            ORDER BY date
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) / SUM(total_count_3d) OVER (
            ORDER BY date
            ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
        ) AS rolling_30d_hit_rate_3d
    FROM cs_metrics_joined
)

SELECT
    date,
    cs_spearman_ic_1d,
    rolling_30d_avg_ic_1d,
    cs_top_bottom_decile_spread_1d,
    rolling_30d_avg_top_bottom_decile_spread_1d,
    rolling_30d_hit_rate_1d,
    cs_spearman_ic_3d,
    rolling_30d_avg_ic_3d,
    cs_top_bottom_decile_spread_3d,
    rolling_30d_avg_top_bottom_decile_spread_3d,
    rolling_30d_hit_rate_3d
FROM rolling_averages
ORDER BY date;