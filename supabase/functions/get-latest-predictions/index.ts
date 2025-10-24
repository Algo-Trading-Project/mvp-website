
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
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const parseHorizonStrict = (h: unknown): '1d' | '3d' | 'both' => {
      const allowed = new Set(['1d','3d']);
      if (Array.isArray(h)) {
        const values = h
          .map((v) => String(v).toLowerCase())
          .flatMap(s => s.split(',').map(t => t.trim()).filter(Boolean));
        if (values.includes('both')) return 'both';
        for (const v of values) {
          if (!allowed.has(v)) {
            throw new Error("Invalid horizon. Allowed values: '1d', '3d' (or both).");
          }
        }
        const has1 = values.includes('1d');
        const has3 = values.includes('3d');
        if (has1 && has3) return 'both';
        if (has3) return '3d';
        return '1d';
      }
      const s = String(h || '').toLowerCase();
      if (!s) return '1d';
      if (s === '1d') return '1d';
      if (s === '3d') return '3d';
      if (s === 'both') return 'both';
      if (s === '1d,3d' || s === '3d,1d') return 'both';
      throw new Error("Invalid horizon. Allowed values: '1d', '3d' (or both).");
    };
    let requested: '1d' | '3d' | 'both';
    try {
      requested = parseHorizonStrict((body as any)?.horizon);
    } catch (e) {
      return json({ error: (e as Error).message }, { status: 400 });
    }

    const mapNumber = (v: unknown): number | null => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : null; }
      return null;
    };

    if (requested === 'both') {
      // Choose a single latest date where both horizons exist
      const { data: bothDateRows, error: bothDateErr } = await supabase
        .from('predictions')
        .select('date')
        .not('predicted_returns_1', 'is', null)
        .not('predicted_returns_3', 'is', null)
        .order('date', { ascending: false })
        .limit(1);
      if (bothDateErr) throw bothDateErr;
      const mergedDate = bothDateRows?.[0]?.date ?? null;
      if (!mergedDate) return json({ date: null, count: 0, data: [] });

      const { data, error } = await supabase
        .from('predictions')
        .select('date, symbol_id, predicted_returns_1, predicted_returns_3')
        .eq('date', mergedDate)
        .limit(200000);
      if (error) throw error;
      const dataRows = (data ?? []).map((r: Record<string, unknown>) => ({
        date: String(r.date ?? '').slice(0,10),
        symbol_id: String(r.symbol_id ?? ''),
        predicted_returns_1: mapNumber((r as any).predicted_returns_1),
        predicted_returns_3: mapNumber((r as any).predicted_returns_3),
      })).filter(r => r.symbol_id && r.date);
      return json({ date: String(mergedDate ?? '').slice(0,10), count: dataRows.length, data: dataRows });
    }

    // Single horizon path: preserve existing shape for callers (TopSignals)
    const rpc = await supabase.rpc('rpc_latest_predictions_snapshot', { p_horizon: requested });
    if (rpc.error) throw rpc.error;
    const data = rpc.data as unknown[] | null;
    const dataRows = (data ?? []).map((row: Record<string, unknown>) => ({
      date: String(row.date ?? '').slice(0, 10),
      symbol_id: String(row.symbol_id ?? ''),
      [requested === '3d' ? 'predicted_returns_3' : 'predicted_returns_1']:
        mapNumber((row as any).predicted_return),
    })).filter((row) => row.symbol_id && row.date);
    if (!dataRows.length) return json({ date: null, count: 0, data: [] });
    const latestDate = dataRows[0].date;
    return json({ date: latestDate, count: dataRows.length, data: dataRows });
  } catch (error) {
    return json({ error: error && error.message ? error.message : String(error) }, { status: 500 });
  }
});
