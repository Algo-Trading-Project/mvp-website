import { authenticateApiRequest } from '../_shared/api_key.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { internalError, json, methodNotAllowed } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return methodNotAllowed();
  }

  const auth = await authenticateApiRequest(req);
  if (!auth.ok) {
    return auth.response;
  }
  const { user } = auth;

  try {
    const supabase = getServiceSupabaseClient();

    const { data: latest, error: latestErr } = await supabase
      .from('predictions')
      .select('date')
      .not('date', 'is', null)
      .order('date', { ascending: false })
      .limit(1);

    if (latestErr) throw latestErr;
    const latestDate = latest?.[0]?.date;
    if (!latestDate) {
      return json({ date: null, rows: [] });
    }

    const { data, error } = await supabase
      .from('predictions')
      .select('date, symbol_id, y_pred')
      .eq('date', latestDate)
      .limit(200000);

    if (error) throw error;

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      date: String(row.date ?? '').slice(0, 10),
      symbol_id: String(row.symbol_id ?? ''),
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

    return json({
      date: rows.length ? rows[0].date : String(latestDate ?? '').slice(0, 10),
      count: rows.length,
      rows,
      metadata: {
        user_id: user.user_id,
        subscription_tier: user.subscription_tier,
      },
    });
  } catch (error) {
    return internalError(error);
  }
});
