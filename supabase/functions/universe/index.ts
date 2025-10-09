import { authenticateApiRequest } from '../_shared/api_key.ts';
import { internalError, json, methodNotAllowed } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { createAuthedClient } from '../_shared/jwt.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return methodNotAllowed();
  }

  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return auth.response;
  const { user, keyHash } = auth;

  try {
    const { client: supabase } = await createAuthedClient(user.user_id);

    const { data, error } = await supabase.rpc('api_prediction_universe');
    if (error) throw error;

    const tokens = (Array.isArray(data) ? data : [])
      .map((token) => String(token ?? '').trim().toUpperCase())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return json({
      count: tokens.length,
      tokens,
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
