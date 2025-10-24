import { authenticateApiRequest } from '../_shared/api_key.ts';
import { internalError, json, methodNotAllowed } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return methodNotAllowed();
  }

  const auth = await authenticateApiRequest(req);
  if (!auth.ok) {
    return auth.response;
  }
  const { user, keyHash } = auth;

  try {
    const supabase = getServiceSupabaseClient();

    // API access is Pro or API tiers only
    const tier = String(user.subscription_tier ?? 'free').toLowerCase();
    if (!(tier === 'pro' || tier === 'api')) {
      return json({ error: 'API access requires Pro or API tier' }, { status: 403 });
    }

    // Parse strict horizon from query params: horizon=1d, horizon=3d, or both
    const url = new URL(req.url);
    const raw = url.searchParams.getAll('horizon');
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
      // If caller explicitly passed 'both', accept immediately
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
      horizon = parseHorizonStrict(raw);
    } catch (e) {
      return json({ error: (e as Error).message }, { status: 400 });
    }

    const mapNumber = (v: unknown): number | null => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : null; }
      return null;
    };

    if (horizon === 'both') {
      // Find the latest date where both 1d and 3d predictions exist (at least one row has both)
      const { data: bothDateRows, error: bothDateErr } = await supabase
        .from('predictions')
        .select('date')
        .not('predicted_returns_1', 'is', null)
        .not('predicted_returns_3', 'is', null)
        .order('date', { ascending: false })
        .limit(1);
      if (bothDateErr) throw bothDateErr;
      const mergedDate = bothDateRows?.[0]?.date ?? null;
      if (!mergedDate) return json({ date: null, count: 0, data: [] });

      const { data, error } = await supabase
        .from('predictions')
        .select('date, symbol_id, predicted_returns_1, predicted_returns_3')
        .eq('date', mergedDate)
        .limit(200000);
      if (error) throw error;
      const dataRows = (data ?? []).map((r: Record<string, unknown>) => ({
        date: String(r.date ?? '').slice(0,10),
        symbol_id: String(r.symbol_id ?? ''),
        predicted_returns_1: mapNumber((r as any).predicted_returns_1),
        predicted_returns_3: mapNumber((r as any).predicted_returns_3),
      })).filter(r => r.symbol_id && r.date);

      return json({
        date: String(mergedDate ?? '').slice(0,10),
        count: dataRows.length,
        data: dataRows,
      });
    }

    // Single horizon
    const targetCol = horizon === '3d' ? 'predicted_returns_3' : 'predicted_returns_1';
    const { data: latest, error: latestErr } = await supabase
      .from('predictions')
      .select('date')
      .not(targetCol as any, 'is', null)
      .order('date', { ascending: false })
      .limit(1);
    if (latestErr) throw latestErr;
    const latestDate = latest?.[0]?.date;
    if (!latestDate) return json({ date: null, rows: [] });

    const { data, error } = await supabase
      .from('predictions')
      .select(`date, symbol_id, ${targetCol}`)
      .eq('date', latestDate)
      .limit(200000);
    if (error) throw error;
    const dataRows = (data ?? []).map((row: Record<string, unknown>) => ({
      date: String(row.date ?? '').slice(0, 10),
      symbol_id: String(row.symbol_id ?? ''),
      [targetCol]: mapNumber((row as any)[targetCol]),
    })).filter((row) => row.symbol_id && row.date);
    return json({
      date: String(latestDate ?? '').slice(0,10),
      count: dataRows.length,
      data: dataRows,
    });
  } catch (error) {
    return internalError(error);
  }
});
