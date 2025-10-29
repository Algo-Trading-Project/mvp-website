import { json, methodNotAllowed } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";

// Returns seat usage for Pro‑Developer and API tiers.
// Uses service role; no client auth required.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return methodNotAllowed();
  }
  try {
    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('subscription_tier, subscription_status');
    if (error) throw error;

    const ACTIVE = new Set(['active', 'trialing', 'past_due']);
    let proDev = 0;
    let api = 0;
    for (const row of (data ?? []) as any[]) {
      const tier = String(row?.subscription_tier || '').toLowerCase();
      const status = String(row?.subscription_status || '').toLowerCase();
      if (!ACTIVE.has(status)) continue;
      if (tier === 'pro_dev' || tier === 'pro-developer' || tier === 'prodeveloper') proDev++;
      else if (tier === 'api') api++;
    }
    const MAX = { pro_dev: 70, api: 30 } as const;
    return json({
      pro_dev: { used: proDev, max: MAX.pro_dev, left: Math.max(0, MAX.pro_dev - proDev) },
      api: { used: api, max: MAX.api, left: Math.max(0, MAX.api - api) },
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});

