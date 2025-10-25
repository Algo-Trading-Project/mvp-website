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
    .filter(Boolean)
    // Force base-only tokens by taking segment before first underscore
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
  const tokens = parseTokens(url.searchParams.get('tokens'));
  const includeForwards = (() => {
    const raw = (url.searchParams.get('include_forward_returns') || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  })();

  // Parse strict horizon from query params: horizon=1d, horizon=3d, or both
  const rawHorizon = url.searchParams.getAll('horizon');
  const parseHorizonStrict = (h: string[]): '1d' | '3d' | 'both' => {
    if (!h.length) return '1d';
    const parts: string[] = [];
    for (const item of h) {
      const segs = String(item || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
      parts.push(...segs);
    }
    if (parts.includes('both')) return 'both';
    const allowed = new Set(['1d','3d']);
    for (const v of parts) {
      if (!allowed.has(v)) {
        throw new Error("Invalid horizon. Allowed values: '1d', '3d' (or both).");
      }
    }
    const has1 = parts.includes('1d');
    const has3 = parts.includes('3d');
    if (has1 && has3) return 'both';
    if (has3) return '3d';
    return '1d';
  };
  let horizon: '1d' | '3d' | 'both';
  try {
    horizon = parseHorizonStrict(rawHorizon);
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 400 });
  }
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
      if (startObj.getTime() > endObj.getTime()) {
        return json({ error: 'start_date must be <= end_date' }, { status: 400 });
      }
    }
    // Build base query
    const targetCol = horizon === '3d' ? 'predicted_returns_3' : 'predicted_returns_1';
    const selectCols = (() => {
      if (horizon === 'both') {
        return 'date, symbol_id, predicted_returns_1, predicted_returns_3' + (includeForwards ? ', forward_returns_1, forward_returns_3' : '');
      }
      if (horizon === '3d') {
        return 'date, symbol_id, predicted_returns_3' + (includeForwards ? ', forward_returns_3' : '');
      }
      return 'date, symbol_id, predicted_returns_1' + (includeForwards ? ', forward_returns_1' : '');
    })();

    let base = supabase
      .from('predictions')
      .select(selectCols)
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
      const expanded = tokens.map((t) => `${t}_USDT_BINANCE`);
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

    const mapNumber = (v: unknown): number | null => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : null; }
      return null;
    };

    const dataRows = (merged ?? []).map((row: Record<string, unknown>) => {
      const common = {
        date: String(row.date ?? '').slice(0, 10),
        symbol_id: String(row.symbol_id ?? ''),
      };
      if (horizon === 'both') {
        const base: any = {
          ...common,
          predicted_returns_1: mapNumber((row as any).predicted_returns_1),
          predicted_returns_3: mapNumber((row as any).predicted_returns_3),
        };
        if (includeForwards) {
          base.forward_returns_1 = mapNumber((row as any).forward_returns_1);
          base.forward_returns_3 = mapNumber((row as any).forward_returns_3);
        }
        return base;
      }
      if (horizon === '3d') {
        const base: any = {
          ...common,
          predicted_returns_3: mapNumber((row as any).predicted_returns_3),
        };
        if (includeForwards) base.forward_returns_3 = mapNumber((row as any).forward_returns_3);
        return base;
      }
      const base: any = {
        ...common,
        predicted_returns_1: mapNumber((row as any).predicted_returns_1),
      };
      if (includeForwards) base.forward_returns_1 = mapNumber((row as any).forward_returns_1);
      return base;
    }).filter((row) => (row as any).symbol_id && (row as any).date);

    return json({
      start_date: startDate,
      end_date: endDate,
      tokens: tokens ?? null,
      count: dataRows.length,
      data: dataRows,
    });
  } catch (error) {
    return internalError(error);
  }
});
