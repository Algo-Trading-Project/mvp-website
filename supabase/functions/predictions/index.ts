import { authenticateApiRequest } from '../_shared/api_key.ts';
import { badRequest, internalError, json, methodNotAllowed } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';

function normalizeDate(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Basic YYYY-MM-DD validation
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function parseTokens(param: string | null): string[] | null {
  if (!param) return null;
  const list = param
    .split(',')
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
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
  const { user, keyHash } = auth;

  const url = new URL(req.url);
  const startDate = normalizeDate(url.searchParams.get('start_date') ?? '');
  const endDate = normalizeDate(url.searchParams.get('end_date') ?? '');
  const tokens = parseTokens(url.searchParams.get('tokens'));
  // Removed limit enforcement to return full ranges

  if (!startDate || !endDate) {
    return badRequest('start_date and end_date (YYYY-MM-DD) are required');
  }

  try {
    const supabase = getServiceSupabaseClient();
    // Universal per-request range cap: 365 days (inclusive)
    {
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
    }
    // Build base query
    let base = supabase
      .from('predictions')
      .select('date, symbol_id, y_pred')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('symbol_id', { ascending: true });

    // API access is Pro or API tiers only
    const tier = String(user.subscription_tier ?? 'free').toLowerCase();
    if (!(tier === 'pro' || tier === 'api')) {
      return json({ error: 'API access requires Pro or API tier' }, { status: 403 });
    }

    // Honor token filter for Pro/API if provided
    if (tokens && tokens.length) {
      const expanded = tokens.some((s) => s.includes('_'))
        ? tokens
        : tokens.map((t) => `${t}_USDT_BINANCE`);
      base = base.in('symbol_id', expanded);
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

    const rows = (merged ?? []).map((row: Record<string, unknown>) => ({
      date: String(row.date ?? '').slice(0, 10),
      symbol_id: String(row.symbol_id ?? ''),
      y_pred:
        typeof row.y_pred === 'number'
          ? (Number.isFinite(row.y_pred) ? row.y_pred : null)
          : typeof row.y_pred === 'string'
          ? (() => {
              const num = Number(row.y_pred);
              return Number.isFinite(num) ? num : null;
            })()
          : null,
    })).filter((row) => row.symbol_id && row.date);

    return json({
      range: { start_date: startDate, end_date: endDate },
      tokens: tokens ?? null,
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
