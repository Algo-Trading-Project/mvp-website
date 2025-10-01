
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

    const { data, error: rpcError } = await supabase.rpc('rpc_latest_predictions_snapshot');

    if (rpcError) throw rpcError;

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      symbol_id: String(row.symbol_id ?? ''),
      date: String(row.date ?? '').slice(0, 10),
      y_pred:
        typeof row.y_pred === 'number'
          ? (Number.isFinite(row.y_pred) ? row.y_pred : null)
          : typeof row.y_pred === 'string'
          ? (() => {
              const num = Number(row.y_pred);
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
