
import { query } from './auroraClient.js';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const cross = await query(
      `SELECT date,
              rolling_30d_ema_ic_1d,
              rolling_30d_ema_ic_7d,
              rolling_30d_ema_top_bottom_decile_spread_1d,
              rolling_30d_ema_top_bottom_decile_spread_7d,
              rolling_avg_1d_expectancy,
              rolling_avg_1d_long_expectancy,
              rolling_avg_1d_short_expectancy,
              cs_1d_expectancy,
              cs_1d_long_expectancy,
              cs_1d_short_expectancy,
              cs_7d_expectancy,
              cs_7d_long_expectancy,
              cs_7d_short_expectancy,
              cross_sectional_ic_1d,
              cross_sectional_ic_7d
         FROM cross_sectional_metrics_1d
         ORDER BY date ASC`
    );

    const monthly = await query(
      `SELECT year, month,
              information_coefficient_1d,
              information_coefficient_7d,
              expectancy_1d_long,
              expectancy_1d_short,
              combined_expectancy_1d,
              expectancy_7d_long,
              expectancy_7d_short,
              combined_expectancy_7d
         FROM monthly_performance_metrics
         ORDER BY year ASC, month ASC`
    );

    return Response.json({ cross, monthly });
  } catch (error) {
    console.error('Function error:', error);
    return Response.json({ 
      error: 'Internal server error', 
      details: error && error.message ? error.message : String(error) 
    }, { status: 500 });
  }
});