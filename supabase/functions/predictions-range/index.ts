import { json, methodNotAllowed } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";

type Payload = {
  start?: string;
  end?: string;
  tokens?: string[] | null;
  limit?: number | null;
  horizon?: '1d' | '3d' | 'both' | string | null;
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
    const { start, end, tokens, limit, horizon }: Payload = await req.json().catch(() => ({} as Payload));
    if (!isIsoDate(start) || !isIsoDate(end)) {
      return json({ error: "start and end must be YYYY-MM-DD" }, { status: 400 });
    }
    // Validate date range ordering
    if (new Date(`${start}T00:00:00Z`) > new Date(`${end}T00:00:00Z`)) {
      return json({ error: "start must be <= end" }, { status: 400 });
    }
    const supabase = getServiceSupabaseClient();

    // Determine subscription tier from the caller's auth token (manual gating; queries still use service role)
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    let subscriptionTier = 'free';
    try {
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const { data: userResult } = await supabase.auth.getUser(token);
        const authUser = userResult?.user ?? null;
        const uid = authUser?.id ?? null;
        if (uid) {
          const { data: urow } = await supabase
            .from('users')
            .select('subscription_tier')
            .eq('user_id', uid)
            .maybeSingle();
          subscriptionTier = String(urow?.subscription_tier ?? authUser?.user_metadata?.subscription_tier ?? 'free').toLowerCase();
        }
      }
    } catch (_e) {
      subscriptionTier = 'free';
    }

    if (!subscriptionTier || subscriptionTier === 'free') {
      return json({ error: 'Downloads require a paid plan' }, { status: 403 });
    }

    // Universal per-request cap: 365 days (inclusive)
    const startDateObj = new Date(`${start}T00:00:00Z`);
    const endDateObj = new Date(`${end}T00:00:00Z`);
    const diffDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 365) {
      return json(
        {
          error: 'Maximum of 365 days per request. Please break your request into smaller ranges.',
          code: 'RANGE_TOO_LARGE',
          limit_days: 365,
        },
        { status: 400 },
      );
    }

    // Lite users: both dates must be within the last 180 days ending on latest available predictions date
    if (subscriptionTier === 'lite') {
      const { data: latestRows, error: latestErr } = await supabase
        .from('predictions')
        .select('date')
        .not('date', 'is', null)
        .order('date', { ascending: false })
        .limit(1);
      if (latestErr) throw latestErr;
      const latestDateStr = String(latestRows?.[0]?.date ?? '').slice(0, 10);
      if (!latestDateStr) {
        return json({ error: 'No predictions available to determine lookback window' }, { status: 500 });
      }
      const endAnchor = new Date(`${latestDateStr}T00:00:00Z`);
      const minAnchor = new Date(endAnchor);
      const LITE_LOOKBACK_DAYS = 180;
      // Inclusive 180-day window ending on latestDateStr
      minAnchor.setUTCDate(endAnchor.getUTCDate() - (LITE_LOOKBACK_DAYS - 1));
      const liteMinStr = minAnchor.toISOString().slice(0, 10);
      if ((start! < liteMinStr) || (end! > latestDateStr)) {
        return json(
          {
            error: `Lite tier allows selecting dates within the last ${LITE_LOOKBACK_DAYS} days ending on ${latestDateStr}.`,
            code: 'LITE_LOOKBACK_WINDOW',
            window_start: liteMinStr,
            window_end: latestDateStr,
          },
          { status: 400 },
        );
      }
    }

    // PostgREST enforces a per-call row cap (~1000), including RPC.
    // Page through results using range() and merge the chunks to return the full set.
    const tokenList = Array.isArray(tokens)
      ? tokens.filter((t) => typeof t === "string" && t.trim().length).map((t) => t.trim().toUpperCase())
      : null;

    const pHorizon = (typeof horizon === 'string' && (horizon === '3d' || horizon === 'both')) ? horizon as '3d' | 'both' : '1d';

    let base = supabase
      .from('predictions')
      .select(
        pHorizon === 'both'
          ? 'date, symbol_id, predicted_returns_1, predicted_returns_3'
          : (pHorizon === '3d'
              ? 'date, symbol_id, predicted_returns_3'
              : 'date, symbol_id, predicted_returns_1')
      )
      .gte('date', start!)
      .lte('date', end!)
      .order('date', { ascending: true })
      .order('symbol_id', { ascending: true });

    // Enforce Lite subset: if lite, restrict to top-60 list
    if (subscriptionTier === 'lite') {
      const { data: liteRows, error: liteErr } = await supabase
        .from('product_lite_universe_60')
        .select('symbol_id');
      if (liteErr) throw liteErr;
      const liteSymbols = new Set((liteRows ?? []).map((r: any) => String(r.symbol_id)));

      let requestedSymbols: string[] | null = null;
      if (tokenList && tokenList.length) {
        const expanded = tokenList.some((s) => s.includes('_'))
          ? tokenList
          : tokenList.map((t) => `${t}_USDT_BINANCE`);
        requestedSymbols = expanded.filter((s) => liteSymbols.has(s));
      } else {
        requestedSymbols = Array.from(liteSymbols);
      }
      if (!requestedSymbols.length) {
        return json({ count: 0, rows: [] });
      }
      base = base.in('symbol_id', requestedSymbols);
    } else {
      // Pro/API: honor requested tokens if provided, else full universe
      if (tokenList && tokenList.length) {
        const expanded = tokenList.some((s) => s.includes('_'))
          ? tokenList
          : tokenList.map((t) => `${t}_USDT_BINANCE`);
        base = base.in('symbol_id', expanded);
      }
    }

    const PAGE_SIZE = 1000;
    const merged: any[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await base.range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const chunk = data ?? [];
      if (!chunk.length) break;
      merged.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
    }

    const mapNumber = (v: unknown): number | null => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : null; }
      return null;
    };

    let rows: any[] = [];
    if (pHorizon === 'both') {
      rows = (merged ?? []).map((row: Record<string, unknown>) => ({
        date: String(row.date ?? "").slice(0, 10),
        symbol_id: String(row.symbol_id ?? ""),
        predicted_returns_1: mapNumber((row as any).predicted_returns_1),
        predicted_returns_3: mapNumber((row as any).predicted_returns_3),
      })).filter((r) => r.date && r.symbol_id);
    } else if (pHorizon === '3d') {
      rows = (merged ?? []).map((row: Record<string, unknown>) => ({
        date: String(row.date ?? "").slice(0, 10),
        symbol_id: String(row.symbol_id ?? ""),
        predicted_returns_3: mapNumber((row as any).predicted_returns_3),
      })).filter((r) => r.date && r.symbol_id);
    } else {
      rows = (merged ?? []).map((row: Record<string, unknown>) => ({
        date: String(row.date ?? "").slice(0, 10),
        symbol_id: String(row.symbol_id ?? ""),
        predicted_returns_1: mapNumber((row as any).predicted_returns_1),
      })).filter((r) => r.date && r.symbol_id);
    }

    return json({ count: rows.length, rows, horizon: pHorizon });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
