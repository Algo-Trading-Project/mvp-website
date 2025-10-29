import { authenticateApiRequest } from '../_shared/api_key.ts';
import { internalError, json, methodNotAllowed } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';

// TODO: refactor to incorporate pro-developer subscription tier and to return
// the correct universe based on the user's subscription tier
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

    // API access is Pro or API tiers only
    const tier = String(user.subscription_tier ?? 'free').toLowerCase();
    if (!(tier === 'pro' || tier === 'api')) {
      return json({ error: 'API access requires Pro or API tier' }, { status: 403 });
    }

    const { data, error } = await supabase.rpc('api_prediction_universe');
    if (error) throw error;

    const tokens = (Array.isArray(data) ? data : [])
      .map((token) => String(token ?? '').trim().toUpperCase())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return json({
      count: tokens.length,
      data: tokens,
    });
  } catch (error) {
    return internalError(error);
  }
});
