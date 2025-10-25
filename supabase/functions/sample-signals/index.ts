import { corsHeaders } from '../_shared/middleware.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';

function toCsv(rows: Array<Record<string, unknown>>): string {
  const header = ['date', 'symbol', 'predicted_returns_1'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const date = String(r.date ?? '').slice(0, 10);
    const full = String(r.symbol_id ?? '');
    const base = full.includes('_') ? full.split('_')[0] : full;
    const val = typeof (r as any).predicted_returns_1 === 'number'
      ? (r as any).predicted_returns_1 as number
      : Number((r as any).predicted_returns_1 ?? '');
    const safe = Number.isFinite(val) ? String(val) : '';
    if (date && base) lines.push([date, base, safe].join(','));
  }
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const supabase = getServiceSupabaseClient();

    // Determine latest and second-latest prediction dates (guard against duplicates)
    const { data: latestRows, error: latestErr } = await supabase
      .from('predictions')
      .select('date')
      .not('predicted_returns_1', 'is', null)
      .order('date', { ascending: false })
      .limit(1);
    if (latestErr) throw latestErr;
    const latestDate = latestRows?.[0]?.date ?? null;
    if (!latestDate) {
      return new Response(JSON.stringify({ error: 'No predictions available' }), {
        status: 404,
        headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
      });
    }
    const { data: secondRows, error: secondErr } = await supabase
      .from('predictions')
      .select('date')
      .not('predicted_returns_1', 'is', null)
      .lt('date', latestDate)
      .order('date', { ascending: false })
      .limit(1);
    if (secondErr) throw secondErr;
    const targetDate = secondRows?.[0]?.date ?? null;
    if (!targetDate) {
      return new Response(JSON.stringify({ error: 'Not enough history to provide a sample file' }), {
        status: 404,
        headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
      });
    }

    // Restrict to a curated majors list for public samples
    const BASES = ['BTC','ETH','SOL','BNB','XRP','ADA','DOGE','LTC','AVAX','DOT'];
    const SYMBOLS = BASES.map((b) => `${b}_USDT_BINANCE`);

    const { data, error } = await supabase
      .from('predictions')
      .select('date, symbol_id, predicted_returns_1')
      .eq('date', targetDate)
      .in('symbol_id', SYMBOLS)
      .order('symbol_id', { ascending: true })
      .limit(200000);
    if (error) throw error;

    const csv = toCsv((data ?? []) as Array<Record<string, unknown>>);
    const dateStr = String(targetDate).slice(0, 10) || 'sample';
    return json({ csv, filename: `sample-signals-${dateStr}.csv`, date: dateStr, count: (data ?? []).length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
