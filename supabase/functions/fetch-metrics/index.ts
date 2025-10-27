
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

    // Load daily metrics from MV and compute rolling metrics client-side
    // Page through MV rows to avoid PostgREST row cap
    const PAGE = 1000; let fromIdx = 0; const mvRows: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('daily_dashboard_metrics')
        .select('date, cs_spearman_ic_1d, cs_top_bottom_decile_spread_1d, cs_hit_count_1d, total_count_1d')
        .order('date', { ascending: true })
        .range(fromIdx, fromIdx + PAGE - 1);
      if (error) throw error;
      if (data?.length) mvRows.push(...data);
      if (!data || data.length < PAGE) break;
      fromIdx += PAGE;
    }

    // Rolling metrics via SQL RPCs (window=30)
    // Page through rolling series via RPCs
    async function fetchRolling(name: string) {
      let offset = 0; const acc: any[] = []; const page = 1000;
      while (true) {
        const rpc = await supabase.rpc(name, { start_date: '2000-01-01', end_date: '2099-12-31', window: 30, p_limit: page, p_offset: offset });
        if (rpc.error) throw rpc.error; const chunk = (rpc.data ?? []) as any[];
        if (chunk.length) acc.push(...chunk); if (chunk.length < page) break; offset += page;
      }
      return acc;
    }
    const [rIc, rSp, rHr] = await Promise.all([
      fetchRolling('rpc_rolling_ic'),
      fetchRolling('rpc_rolling_spread'),
      fetchRolling('rpc_rolling_hit_rate'),
    ]);

    const coerceNumber = (value: unknown) => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string') {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };

    const daily = (mvRows ?? []).map((row: Record<string, unknown>) => ({
      date: String(row.date ?? ''),
      ic: coerceNumber(row.cs_spearman_ic_1d),
      spread: coerceNumber(row.cs_top_bottom_decile_spread_1d),
      hit: coerceNumber(row.cs_hit_count_1d) ?? 0,
      cnt: coerceNumber(row.total_count_1d) ?? 0,
    }));

    // Index rolling series by date for quick merge
    const mapIc = new Map((rIc ?? []).map((r: any) => [String(r.date).slice(0,10), coerceNumber(r.value)]));
    const mapSp = new Map((rSp ?? []).map((r: any) => [String(r.date).slice(0,10), coerceNumber(r.value)]));
    const mapHr = new Map((rHr ?? []).map((r: any) => [String(r.date).slice(0,10), coerceNumber(r.rolling_hit_rate ?? r.value)]));

    const cross = daily.map((r) => ({
      date: r.date,
      cross_sectional_ic_1d: r.ic,
      rolling_30d_avg_ic: mapIc.get(r.date) ?? null,
      cs_top_bottom_decile_spread: r.spread,
      rolling_30d_avg_top_bottom_decile_spread: mapSp.get(r.date) ?? null,
      rolling_30d_hit_rate: mapHr.get(r.date) ?? null,
    }));

    // Normalize integers
    const normalizeInteger = (value: unknown) => {
      if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
      if (typeof value === 'string') {
        const num = Number(value);
        return Number.isFinite(num) ? Math.trunc(num) : null;
      }
      return null;
    };

    // Latest non-null rolling values from merged series
    const lastIdx = (() => {
      for (let i = cross.length - 1; i >= 0; i--) {
        if (
          typeof cross[i].rolling_30d_avg_ic === 'number' ||
          typeof cross[i].rolling_30d_avg_top_bottom_decile_spread === 'number' ||
          typeof cross[i].rolling_30d_hit_rate === 'number'
        ) return i;
      }
      return -1;
    })();
    const latestRow = lastIdx >= 0 ? {
      date: cross[lastIdx].date,
      rolling_30d_avg_ic: cross[lastIdx].rolling_30d_avg_ic,
      rolling_30d_avg_top_bottom_decile_spread: cross[lastIdx].rolling_30d_avg_top_bottom_decile_spread,
      rolling_30d_hit_rate: cross[lastIdx].rolling_30d_hit_rate,
    } : null;

    // Aggregated performance metrics: read from materialized view model_performance_metrics_agg
    let monthly_summary = {
      one_day: { mean: null, std: null, positive_share: null, icir_ann: null },
      three_day: { mean: null, std: null, positive_share: null, icir_ann: null },
      count: { one_day: null as number | null, three_day: null as number | null },
    } as const;
    let aggRow: any = null;
    try {
      const { data: mon, error: monErr } = await supabase
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
          avg_cs_decile_spread_1d
        `)
        .limit(1)
        .maybeSingle();
      if (monErr) throw monErr;
      const row = (mon || {}) as Record<string, unknown>;
      aggRow = row;
      monthly_summary = {
        one_day: {
          mean: coerceNumber(row.avg_cs_spearman_ic_1d),
          std: coerceNumber(row.std_cs_spearman_ic_1d),
          icir_ann: coerceNumber(row.annualized_icir_1d),
          positive_share: coerceNumber(row.pct_days_cs_ic_1d_above_0),
        },
        three_day: {
          mean: coerceNumber(row.avg_cs_spearman_ic_3d),
          std: coerceNumber(row.std_cs_spearman_ic_3d),
          icir_ann: coerceNumber(row.annualized_icir_3d),
          positive_share: coerceNumber(row.pct_days_cs_ic_3d_above_0),
        },
        count: { one_day: null, three_day: null },
      } as const;
    } catch (_e) {
      // leave monthly_summary as nulls; UI will still render daily metrics
    }

    // Compute simple global means for homepage badges (robust to empty arrays)
    const nums = (arr: Array<number | null | undefined>) => arr.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    // Prefer SQL aggregates for robustness; fallback to client means
    let mean_daily_ic_1d = null as number | null;
    let mean_daily_spread_1d = null as number | null;
    // Prefer values from the new aggregate MV if available
    mean_daily_ic_1d = monthly_summary.one_day.mean;
    mean_daily_spread_1d = typeof aggRow?.avg_cs_decile_spread_1d === 'number' ? aggRow.avg_cs_decile_spread_1d : null;
    if (mean_daily_ic_1d == null || mean_daily_spread_1d == null) {
      // Fallback to client-side means
      const nums = (arr: Array<number | null | undefined>) => arr.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
      if (mean_daily_ic_1d == null) mean_daily_ic_1d = mean(nums(cross.map((r: any) => r.cross_sectional_ic_1d)));
      if (mean_daily_spread_1d == null) mean_daily_spread_1d = mean(nums(cross.map((r: any) => r.cs_top_bottom_decile_spread)));
    }

    return json({
      cross,
      monthly: [],
      monthly_summary,
      latest: latestRow,
      global_means: {
        mean_daily_ic_1d,
        mean_daily_spread_1d,
      },
    });
  } catch (error) {
    console.error('Function error:', error);
    return json({
      error: 'Internal server error', 
      details: error && error.message ? error.message : String(error) 
    }, { status: 500 });
  }
});
