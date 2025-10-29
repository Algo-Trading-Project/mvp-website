import { authenticateApiRequest } from '../_shared/api_key.ts';
import { badRequest, internalError, json, methodNotAllowed } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';

function normalizeDate(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function parseTokens(param: string | null): string[] | null {
  if (!param) return null;
  const list = param
    .split(',')
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean)
    .map((t) => t.split('_')[0]);
  return list.length ? Array.from(new Set(list)) : null;
}

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

  const url = new URL(req.url);
  const startDate = normalizeDate(url.searchParams.get('start_date') ?? '');
  const endDate = normalizeDate(url.searchParams.get('end_date') ?? '');
  // Optional 'tokens' parameter (comma-separated list). If omitted, return all tokens.
  const requestedTokens = parseTokens(url.searchParams.get('tokens'));
  if (!startDate || !endDate) {
    return badRequest('start_date and end_date (YYYY-MM-DD) are required');
  }

  try {
    const supabase = getServiceSupabaseClient();
    const expandedTokens = requestedTokens && requestedTokens.length
      ? requestedTokens.map((t) => `${t}_USDT_BINANCE`)
      : null;

    // API access is Pro‑Developer or API tiers only
    const tier = String(user.subscription_tier ?? 'free').toLowerCase();
    if (!(tier === 'pro_dev' || tier === 'api')) {
      return json({ error: 'API access requires Pro‑Developer or API tier' }, { status: 403 });
    }

    // Range caps: Pro‑Developer ≤ 365 days, API ≤ 365 days (per-request); also enforce anchored lookback for Pro‑Developer
    const startObj = new Date(`${startDate}T00:00:00Z`);
    const endObj = new Date(`${endDate}T00:00:00Z`);
    const diffDays = Math.ceil((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const CAP = 365; // Pro‑Developer cap per request; API exempt
    if (tier === 'pro_dev' && diffDays > CAP) {
      return json({
        error: `Maximum of ${CAP} days per request for your tier. Please break your request into smaller ranges.`,
        code: 'RANGE_TOO_LARGE',
        limit_days: CAP,
      }, { status: 400 });
    }
    if (startObj.getTime() > endObj.getTime()) {
      return json({ error: 'start_date must be <= end_date' }, { status: 400 });
    }

    // Anchored lookback for Pro‑Developer only (API exempt). Enforce only lower bound.
    if (tier === 'pro_dev') {
      const { data: latestRows, error: latestErr } = await supabase
        .from('ohlcv_1d')
        .select('date')
        .not('date', 'is', null)
        .order('date', { ascending: false })
        .limit(1);
      if (latestErr) throw latestErr;
      const latestDateStr = String(latestRows?.[0]?.date ?? '').slice(0, 10);
      if (!latestDateStr) return json({ error: 'No OHLCV data available to determine lookback window' }, { status: 500 });
      const endAnchor = new Date(`${latestDateStr}T00:00:00Z`);
      const minAnchor = new Date(endAnchor);
      const LOOKBACK_DAYS = 365;
      minAnchor.setUTCDate(endAnchor.getUTCDate() - (LOOKBACK_DAYS - 1));
      const minStr = minAnchor.toISOString().slice(0, 10);
      if (startDate < minStr) {
        return json({
          error: `Pro‑Developer allows selecting start dates no older than ${minStr} (last ${LOOKBACK_DAYS} days from ${latestDateStr}).`,
          code: 'PRO_DEV_ANCHORED_LOOKBACK',
          window_start: minStr,
          window_end: latestDateStr,
        }, { status: 400 });
      }
    }

    // Build base query and page through results
    let base = supabase
      .from('ohlcv_1d')
      .select('date, symbol_id, open, high, low, close, volume')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('symbol_id', { ascending: true });
    if (expandedTokens && expandedTokens.length) {
      base = base.in('symbol_id', expandedTokens);
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

    const dataRows = (merged ?? [])
      .map((row: Record<string, unknown>) => ({
        date: String(row.date ?? '').slice(0, 10),
        symbol_id: String(row.symbol_id ?? ''),
        open: parseNumeric(row.open),
        high: parseNumeric(row.high),
        low: parseNumeric(row.low),
        close: parseNumeric(row.close),
        volume: parseNumeric(row.volume),
      }))
      .filter((row) => row.symbol_id && row.date);

    return json({
      start_date: startDate,
      end_date: endDate,
      tokens: requestedTokens ?? null,
      count: dataRows.length,
      data: dataRows,
    });
  } catch (error) {
    return internalError(error);
  }
});
