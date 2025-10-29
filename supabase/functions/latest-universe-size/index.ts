import { json, methodNotAllowed } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Accept POST (default from supabase-js invoke). Reject others.
  if (req.method !== "POST") {
    return methodNotAllowed();
  }

  try {
    const supabase = getServiceSupabaseClient();

    // Find most recent predictions date
    const { data: dateRows, error: dateErr } = await supabase
      .from("predictions")
      .select("date")
      .order("date", { ascending: false })
      .limit(1);
    if (dateErr) throw dateErr;

    const latestRawDate = dateRows?.[0]?.date ?? null;
    if (!latestRawDate) return json({ date: null, count: 0 });

    // Count rows (1 row per symbol per date). This runs with service role so RLS won't block counts.
    const { count, error: countErr } = await supabase
      .from("predictions")
      .select("date", { count: "exact" })
      .eq("date", latestRawDate)
      .limit(1);
    if (countErr) throw countErr;

    return json({
      date: String(latestRawDate).slice(0, 10),
      count: typeof count === "number" ? count : 0,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});

