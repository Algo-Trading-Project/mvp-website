import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

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
        pct_days_cs_ic_3d_above_0
      `)
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const row = data || {} as Record<string, unknown>;
    const one_day = {
      mean: row.avg_cs_spearman_ic_1d ?? null,
      std: row.std_cs_spearman_ic_1d ?? null,
      icir_ann: row.annualized_icir_1d ?? null,
      positive_share: row.pct_days_cs_ic_1d_above_0 ?? null,
    } as const;
    const three_day = {
      mean: row.avg_cs_spearman_ic_3d ?? null,
      std: row.std_cs_spearman_ic_3d ?? null,
      icir_ann: row.annualized_icir_3d ?? null,
      positive_share: row.pct_days_cs_ic_3d_above_0 ?? null,
    } as const;

    return json({ one_day, three_day });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
