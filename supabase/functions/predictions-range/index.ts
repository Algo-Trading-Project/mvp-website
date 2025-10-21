import { json, methodNotAllowed } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";

type Payload = {
  start?: string;
  end?: string;
  tokens?: string[] | null;
  limit?: number | null;
};

const isIsoDate = (v: string | undefined | null) =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return methodNotAllowed();
  }

  try {
    const { start, end, tokens, limit }: Payload = await req.json().catch(() => ({} as Payload));
    if (!isIsoDate(start) || !isIsoDate(end)) {
      return json({ error: "start and end must be YYYY-MM-DD" }, { status: 400 });
    }
    // Validate date range ordering
    if (new Date(`${start}T00:00:00Z`) > new Date(`${end}T00:00:00Z`)) {
      return json({ error: "start must be <= end" }, { status: 400 });
    }
    const supabase = getServiceSupabaseClient();

    // Debug: verify RLS identity can see own users row
    try {
      const { data: who, error: whoErr } = await supabase
        .from("users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      console.log("predictions-range: whoami check", {
        user_id: user.id,
        whoami_found: Boolean(who?.user_id === user.id),
        whoami_error: whoErr?.message ?? null,
      });
    } catch (e) {
      console.log("predictions-range: whoami exception", String(e));
    }
    const max = 200000; // safety cap
    const lim = (Number(limit) && Number(limit)! > 0 ? Math.min(Number(limit)!, max) : max);

    let query = supabase
      .from("predictions")
      .select("date, symbol_id, y_pred", { count: "exact" })
      .gte("date", start!)
      .lte("date", end!)
      .order("date", { ascending: true })
      .limit(lim);

    const tokenList = Array.isArray(tokens)
      ? tokens
          .filter((t) => typeof t === "string" && t.trim().length)
          .map((t) => t.trim().toUpperCase())
      : null;
    if (tokenList && tokenList.length) {
      // Symbols are stored like "BTC_USDT_BINANCE"; allow either BASE (BTC) or full id
      const expanded = tokenList.some((s) => s.includes("_"))
        ? tokenList
        : tokenList.map((t) => `${t}_USDT_BINANCE`);
      query = query.in("symbol_id", expanded);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      date: String(row.date ?? "").slice(0, 10),
      symbol_id: String(row.symbol_id ?? ""),
      y_pred:
        typeof row.y_pred === "number"
          ? (Number.isFinite(row.y_pred) ? row.y_pred : null)
          : typeof row.y_pred === "string"
          ? (() => { const n = Number(row.y_pred); return Number.isFinite(n) ? n : null; })()
          : null,
    })).filter((r) => r.date && r.symbol_id);

    return json({
      count: typeof count === "number" ? count : rows.length,
      rows,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
