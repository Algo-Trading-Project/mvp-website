
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

    // Try RPC; if unavailable, fall back to querying the latest date directly
    let data: unknown[] | null = null;
    try {
      const rpc = await supabase.rpc('rpc_latest_predictions_snapshot');
      if (rpc.error) throw rpc.error;
      data = rpc.data as unknown[] | null;
    } catch (_rpcErr) {
      // Find latest date
      const { data: latest, error: latestErr } = await supabase
        .from('predictions')
        .select('date')
        .not('date', 'is', null)
        .order('date', { ascending: false })
        .limit(1);
      if (latestErr) throw latestErr;
      const maxDate = latest?.[0]?.date;
      if (!maxDate) {
        return json({ date: null, rows: [] });
      }
      const { data: rows, error: rowsErr } = await supabase
        .from('predictions')
        .select('date, symbol_id, predicted_returns_1')
        .eq('date', maxDate)
        .limit(100000);
      if (rowsErr) throw rowsErr;
      data = rows as unknown[] | null;
    }

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      symbol_id: String(row.symbol_id ?? ''),
      date: String(row.date ?? '').slice(0, 10),
      y_pred:
        typeof (row as any).predicted_returns_1 === 'number'
          ? (Number.isFinite((row as any).predicted_returns_1) ? (row as any).predicted_returns_1 : null)
          : typeof (row as any).predicted_returns_1 === 'string'
          ? (() => {
              const num = Number((row as any).predicted_returns_1);
              return Number.isFinite(num) ? num : null;
            })()
          : null,
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
