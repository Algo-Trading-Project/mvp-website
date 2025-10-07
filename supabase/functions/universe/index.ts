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
  if (!auth.ok) return auth.response;
  const { user } = auth;

  try {
    const supabase = getServiceSupabaseClient();

    const { data, error } = await supabase
      .from('predictions')
      .select('symbol_id', { distinct: true })
      .not('symbol_id', 'is', null)
      .limit(200000);

    if (error) throw error;

    const tokens = Array.from(
      new Set(
        (data ?? []).map((row: Record<string, unknown>) =>
          String(row.symbol_id ?? '').trim().toUpperCase(),
        ),
      ),
    ).filter(Boolean);

    tokens.sort((a, b) => a.localeCompare(b));

    return json({
      count: tokens.length,
      tokens,
      metadata: {
        user_id: user.user_id,
        subscription_tier: user.subscription_tier,
      },
    });
  } catch (error) {
    return internalError(error);
  }
});
