
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
    const horizon = (body?.horizon === '3d') ? '3d' : '1d';

    // Only use RPC; no table fallbacks
    const rpc = await supabase.rpc('rpc_latest_predictions_snapshot', { p_horizon: horizon });
    if (rpc.error) throw rpc.error;
    const data = rpc.data as unknown[] | null;

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      symbol_id: String(row.symbol_id ?? ''),
      date: String(row.date ?? '').slice(0, 10),
      y_pred: (() => {
        const v = (row as any).predicted_return;
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : null; }
        return null;
      })(),
    })).filter((row) => row.symbol_id && row.date);

    if (!rows.length) {
      return json({ date: null, rows: [] });
    }

    const latestDate = rows[0].date;

    return json({
      date: latestDate,
      rows,
    });
  } catch (error) {
    return json({ error: error && error.message ? error.message : String(error) }, { status: 500 });
  }
});
