import { json } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";

// Returns the most recent unique prediction dates, defaulting to 7.
// No auth; served via service role. Add entitlement checks later if needed.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const payload = await req.json().catch(() => ({}));
    const limit: number = Math.max(1, Math.min(60, Number(payload?.limit ?? 7)));
    const supabase = getServiceSupabaseClient();

    // Fetch a chunk of recent rows and dedupe dates in code.
    const fetchLimit = Math.min(10000, Math.max(1000, limit * 1000));
    const { data, error } = await supabase
      .from("predictions")
      .select("date")
      .not("date", "is", null)
      .order("date", { ascending: false })
      .limit(fetchLimit);
    if (error) throw error;

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const row of (data ?? []) as { date: string }[]) {
      const d = String(row.date ?? "").slice(0, 10);
      if (!d || seen.has(d)) continue;
      seen.add(d);
      unique.push(d);
      if (unique.length >= limit) break;
    }

    return json({ dates: unique });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});

