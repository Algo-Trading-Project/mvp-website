
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
        cross_sectional_ic_1d,
        rolling_30d_avg_ic,
        cs_top_bottom_decile_spread,
        rolling_30d_avg_top_bottom_decile_spread,
        rolling_30d_hit_rate
      `)
      .order('date', { ascending: true });

    if (crossError) throw crossError;

    const { data: monthly, error: monthlyError } = await supabase
      .from('monthly_performance_metrics')
      .select(`
        year,
        month,
        information_coefficient_1d,
        n_preds
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
