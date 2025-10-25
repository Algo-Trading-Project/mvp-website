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

    // API access is Pro or API tiers only
    const tier = String(user.subscription_tier ?? 'free').toLowerCase();
    if (!(tier === 'pro' || tier === 'api')) {
      return json({ error: 'API access requires Pro or API tier' }, { status: 403 });
    }

    // Universal per-request range cap: 365 days (inclusive)
    const startObj = new Date(`${startDate}T00:00:00Z`);
    const endObj = new Date(`${endDate}T00:00:00Z`);
    const diffDays = Math.ceil((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 365) {
      return json({
        error: 'Maximum of 365 days per request. Please break your request into smaller ranges.',
        code: 'RANGE_TOO_LARGE',
        limit_days: 365,
      }, { status: 400 });
    }
    if (startObj.getTime() > endObj.getTime()) {
      return json({ error: 'start_date must be <= end_date' }, { status: 400 });
    }

    // No additional tier-specific restrictions for Pro/API beyond range cap

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
