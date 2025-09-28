
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

    const { data: latestRows, error: latestError } = await supabase
      .from('predictions')
      .select('date')
      .order('date', { ascending: false })
      .limit(1);

    if (latestError) throw latestError;

    const maxDate = latestRows?.[0]?.date ?? null;

    if (!maxDate) {
      return json({ date: null, rows: [] });
    }

    const d = String(maxDate).slice(0, 10);

    const { data: rows, error: rowsError } = await supabase
      .from('predictions')
      .select('symbol_id, date, y_pred_1d, y_pred_7d')
      .eq('date', d);

    if (rowsError) throw rowsError;

    return json({ date: d, rows });
  } catch (error) {
    return json({ error: error && error.message ? error.message : String(error) }, { status: 500 });
  }
});
