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

  const url = new URL(req.url);
  const tokenRaw = (url.searchParams.get('token') ?? url.searchParams.get('symbol') ?? '').trim().toUpperCase();
  const startDate = normalizeDate(url.searchParams.get('start_date') ?? '');
  const endDate = normalizeDate(url.searchParams.get('end_date') ?? '');

  if (!tokenRaw) {
    return badRequest('token query parameter is required');
  }
  if (!startDate || !endDate) {
    return badRequest('start_date and end_date (YYYY-MM-DD) are required');
  }

  try {
    const supabase = getServiceSupabaseClient();
    const token = tokenRaw.includes('_') ? tokenRaw : `${tokenRaw}_USDT_BINANCE`;

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

    // No additional tier-specific restrictions for Pro/API beyond range cap

    const { data, error } = await supabase
      .from('ohlcv_1d')
      .select('date, symbol_id, open, high, low, close, volume')
      .eq('symbol_id', token)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .limit(200000);

    if (error) throw error;

    const rows = (data ?? [])
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
      token,
      range: { start_date: startDate, end_date: endDate },
      count: rows.length,
      rows,
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
