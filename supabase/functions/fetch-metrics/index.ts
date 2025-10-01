
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

    // Prefer RPC for normalized numeric fields; fall back to direct table reads if RPC missing
    let crossData: unknown[] | null = null;
    try {
      const rpc = await supabase.rpc('rpc_cross_sectional_metrics_time_series', {
        start_date: '2000-01-01',
        end_date: '2099-12-31',
      });
      if (rpc.error) throw rpc.error;
      crossData = rpc.data as unknown[] | null;
    } catch (_rpcErr) {
      const { data, error } = await supabase
        .from('cross_sectional_metrics_1d')
        .select('date, cross_sectional_ic_1d, rolling_30d_avg_ic, cs_top_bottom_decile_spread, rolling_30d_avg_top_bottom_decile_spread, rolling_30d_hit_rate')
        .order('date', { ascending: true });
      if (error) throw error;
      crossData = data as unknown[] | null;
    }

    const coerceNumber = (value: unknown) => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string') {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };

    const cross = (crossData ?? []).map((row: Record<string, unknown>) => ({
      date: String(row.date ?? ''),
      cross_sectional_ic_1d: coerceNumber(row.cross_sectional_ic_1d),
      rolling_30d_avg_ic: coerceNumber(row.rolling_30d_avg_ic),
      cs_top_bottom_decile_spread: coerceNumber(row.cs_top_bottom_decile_spread),
      rolling_30d_avg_top_bottom_decile_spread: coerceNumber(row.rolling_30d_avg_top_bottom_decile_spread),
      rolling_30d_hit_rate: coerceNumber(row.rolling_30d_hit_rate),
    }));

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

    const normalizeInteger = (value: unknown) => {
      if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
      if (typeof value === 'string') {
        const num = Number(value);
        return Number.isFinite(num) ? Math.trunc(num) : null;
      }
      return null;
    };

    const monthlyCoerced = (monthly ?? []).map((row: Record<string, unknown>) => ({
      year: normalizeInteger(row.year),
      month: normalizeInteger(row.month),
      information_coefficient_1d: coerceNumber(row.information_coefficient_1d),
      n_preds: normalizeInteger(row.n_preds) ?? 0,
    }));

    let latest: any[] | null = null;
    try {
      const rpc = await supabase.rpc('rpc_latest_cross_sectional_metrics');
      if (rpc.error) throw rpc.error;
      latest = rpc.data as any[] | null;
    } catch (_rpcErr) {
      const { data, error } = await supabase
        .from('cross_sectional_metrics_1d')
        .select('date, rolling_30d_avg_ic, rolling_30d_avg_top_bottom_decile_spread, rolling_30d_hit_rate')
        .order('date', { ascending: false })
        .limit(1);
      if (error) throw error;
      latest = data as any[] | null;
    }

    const latestRow = Array.isArray(latest) && latest.length
      ? {
          date: String(latest[0].date ?? ''),
          rolling_30d_avg_ic: coerceNumber(latest[0].rolling_30d_avg_ic),
          rolling_30d_avg_top_bottom_decile_spread: coerceNumber(latest[0].rolling_30d_avg_top_bottom_decile_spread),
          rolling_30d_hit_rate: coerceNumber(latest[0].rolling_30d_hit_rate),
        }
      : null;

    return json({ cross, monthly: monthlyCoerced, latest: latestRow });
  } catch (error) {
    console.error('Function error:', error);
    return json({
      error: 'Internal server error', 
      details: error && error.message ? error.message : String(error) 
    }, { status: 500 });
  }
});
