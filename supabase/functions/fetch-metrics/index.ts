
import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const supabase = getServiceSupabaseClient();

    const { data: cross, error: crossError } = await supabase
      .from('cross_sectional_metrics_1d')
      .select(`
        date,
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
      `)
      .order('date', { ascending: true });

    if (crossError) throw crossError;

    const { data: monthly, error: monthlyError } = await supabase
      .from('monthly_performance_metrics')
      .select(`
        year,
        month,
        information_coefficient_1d,
        information_coefficient_7d,
        expectancy_1d_long,
        expectancy_1d_short,
        combined_expectancy_1d,
        expectancy_7d_long,
        expectancy_7d_short,
        combined_expectancy_7d
      `)
      .order('year', { ascending: true })
      .order('month', { ascending: true });

    if (monthlyError) throw monthlyError;

    return json({ cross, monthly });
  } catch (error) {
    console.error('Function error:', error);
    return json({ 
      error: 'Internal server error', 
      details: error && error.message ? error.message : String(error) 
    }, { status: 500 });
  }
});
