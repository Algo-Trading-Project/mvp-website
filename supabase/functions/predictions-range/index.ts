import { json, methodNotAllowed } from "../_shared/http.ts";
import { corsHeaders } from "../_shared/middleware.ts";
import { getServiceSupabaseClient } from "../_shared/supabase.ts";

type Payload = {
  start?: string;
  end?: string;
  tokens?: string[] | null;
  limit?: number | null;
  horizon?: '1d' | '3d' | 'both' | string | string[] | null;
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

    // Allow any paid tier (Lite/Pro/Pro‑Developer/API); block Free only
    if (!subscriptionTier || subscriptionTier === 'free') {
      return json({ error: 'Downloads require a paid plan' }, { status: 403 });
    }

    // Per‑tier per‑request caps (API exempt):
    // - lite:   90 days
    // - pro:    365 days
    // - pro_dev:365 days
    // - api:    no limit
    const startDateObj = new Date(`${start}T00:00:00Z`);
    const endDateObj = new Date(`${end}T00:00:00Z`);
    const diffDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (subscriptionTier !== 'api') {
      const cap = subscriptionTier === 'lite' ? 90 : 365;
      if (diffDays > cap) {
        return json(
          {
            error: `Maximum of ${cap} days per request for your tier. Please break your request into smaller ranges.`,
            code: 'RANGE_TOO_LARGE',
            limit_days: cap,
          },
          { status: 400 },
        );
      }
    }

    // Anchored lookback: enforce only lower bound (start >= latest - window + 1).
    // end may exceed latest without error; result simply contains up‑to‑latest rows.
    if (subscriptionTier !== 'api') {
      const windowDays = subscriptionTier === 'lite' ? 90 : 365; // pro + pro_dev: 365
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
      minAnchor.setUTCDate(endAnchor.getUTCDate() - (windowDays - 1));
      const minStr = minAnchor.toISOString().slice(0, 10);
      if (start! < minStr) {
        return json({
          error: `Your tier allows selecting start dates no older than ${minStr} (last ${windowDays} days from ${latestDateStr}).`,
          code: 'TIER_ANCHORED_LOOKBACK',
          window_start: minStr,
          window_end: latestDateStr,
        }, { status: 400 });
      }
    }

    // PostgREST enforces a per-call row cap (~1000), including RPC.
    // Page through results using range() and merge the chunks to return the full set.
    const tokenList = Array.isArray(tokens)
      ? tokens.filter((t) => typeof t === "string" && t.trim().length).map((t) => t.trim().toUpperCase())
      : null;

    const parseHorizonStrict = (h: unknown): '1d' | '3d' | 'both' => {
      const allowed = new Set(['1d','3d']);
      if (Array.isArray(h)) {
        const values = h
          .map((v) => String(v).toLowerCase())
          .flatMap(s => s.split(',').map(t => t.trim()).filter(Boolean));
        if (values.includes('both')) return 'both';
        for (const v of values) {
          if (!allowed.has(v)) {
            throw new Error("Invalid horizon. Allowed values: '1d', '3d' (or both).");
          }
        }
        const has1 = values.includes('1d');
        const has3 = values.includes('3d');
        if (has1 && has3) return 'both';
        if (has3) return '3d';
        return '1d';
      }
      const s = String(h || '').toLowerCase();
      if (!s) return '1d';
      if (s === '1d') return '1d';
      if (s === '3d') return '3d';
      if (s === 'both') return 'both';
      if (s === '1d,3d' || s === '3d,1d') return 'both';
      throw new Error("Invalid horizon. Allowed values: '1d', '3d' (or both).");
    };
    let pHorizon: '1d' | '3d' | 'both';
    try {
      pHorizon = parseHorizonStrict(horizon);
    } catch (e) {
      return json({ error: (e as Error).message }, { status: 400 });
    }

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

    // Enforce Lite subset: if lite, restrict to top‑60 list
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
        return json({ count: 0, data: [] });
      }
      base = base.in('symbol_id', requestedSymbols);
    } else {
      // Pro / Pro‑Developer / API: honor requested tokens if provided, else full universe
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

    return json({ count: rows.length, data: rows });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
