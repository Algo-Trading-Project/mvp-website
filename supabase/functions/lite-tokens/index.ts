import { json, methodNotAllowed } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return methodNotAllowed();
  }
  try {
    const supabase = getServiceSupabaseClient();
    // Prefer the RPC to keep logic on DB side
    const { data, error } = await supabase.rpc('rpc_get_lite_tokens');
    if (error) throw error;
    const base_symbols = (data ?? []).map((r: Record<string, unknown>) => String(r.base_symbol ?? "")).filter(Boolean);
    return json({ count: base_symbols.length, base_symbols });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});

