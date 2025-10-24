import { authenticateApiRequest } from '../_shared/api_key.ts';
import { internalError, json, methodNotAllowed } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';

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
  const { user, keyHash } = auth;

  try {
    const supabase = getServiceSupabaseClient();

    // API access is Pro or API tiers only
    const tier = String(user.subscription_tier ?? 'free').toLowerCase();
    if (!(tier === 'pro' || tier === 'api')) {
      return json({ error: 'API access requires Pro or API tier' }, { status: 403 });
    }

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
      .select('date, symbol_id, predicted_returns_1')
      .eq('date', latestDate)
      .limit(200000);

    if (error) throw error;

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      date: String(row.date ?? '').slice(0, 10),
      symbol_id: String(row.symbol_id ?? ''),
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

    return json({
      date: rows.length ? rows[0].date : String(latestDate ?? '').slice(0, 10),
      count: rows.length,
      rows,
      metadata: {
        user_id: user.user_id,
        subscription_tier: user.subscription_tier,
        api_key_hash: keyHash,
        api_key_valid: true,
      },
    });
  } catch (error) {
    return internalError(error);
  }
});
