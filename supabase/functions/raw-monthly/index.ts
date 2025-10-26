import { corsHeaders } from '../_shared/middleware.ts';
import { json } from '../_shared/http.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from('model_performance_metrics_agg')
      .select(`
        avg_cs_spearman_ic_1d,
        std_cs_spearman_ic_1d,
        annualized_icir_1d,
        pct_days_cs_ic_1d_above_0,
        avg_cs_spearman_ic_3d,
        std_cs_spearman_ic_3d,
        annualized_icir_3d,
        pct_days_cs_ic_3d_above_0,
        avg_cs_decile_spread_1d,
        std_cs_decile_spread_1d,
        annualized_cs_decile_spread_sharpe_1d,
        pct_days_cs_decile_spread_above_0_1d,
        avg_cs_p05_spread_1d,
        std_cs_p05_spread_1d,
        annualized_cs_p05_spread_sharpe_1d,
        pct_days_cs_p05_spread_above_0_1d,
        avg_cs_decile_spread_3d,
        std_cs_decile_spread_3d,
        annualized_cs_decile_spread_sharpe_3d,
        pct_days_cs_decile_spread_above_0_3d,
        avg_cs_p05_spread_3d,
        std_cs_p05_spread_3d,
        annualized_cs_p05_spread_sharpe_3d,
        pct_days_cs_p05_spread_above_0_3d
      `)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return json({ row: data || null });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
