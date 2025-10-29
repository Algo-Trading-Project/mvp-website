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
  if (!auth.ok) return auth.response;
  const { user } = auth;

  try {
    const supabase = getServiceSupabaseClient();

    // Only Pro‑Developer and API tiers may access this endpoint (UI provides universe views for other tiers)
    const tier = String(user.subscription_tier ?? 'free').toLowerCase();
    if (!(tier === 'pro_dev' || tier === 'api')) {
      return json({ error: 'API access for /universe requires Pro‑Developer or API tier' }, { status: 403 });
    }

    // Pro‑Developer and API receive the same full API universe for now
    const { data, error } = await supabase.rpc('api_prediction_universe');
    if (error) throw error;
    const tokens = (Array.isArray(data) ? data : [])
      .map((token) => String(token ?? '').trim().toUpperCase())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return json({ count: tokens.length, data: tokens });
  } catch (error) {
    return internalError(error);
  }
});
