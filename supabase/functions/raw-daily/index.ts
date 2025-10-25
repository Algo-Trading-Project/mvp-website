import { corsHeaders } from '../_shared/middleware.ts';
import { json } from '../_shared/http.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const start = String(body.start ?? '').slice(0, 10);
    const end = String(body.end ?? '').slice(0, 10);
    const page = Math.max(1, Number(body.page ?? 1) | 0);
    const pageSize = Math.min(1000, Math.max(10, Number(body.page_size ?? 200) | 0));
    if (!isIsoDate(start) || !isIsoDate(end)) {
      return json({ error: 'start and end must be YYYY-MM-DD' }, { status: 400 });
    }
    const supabase = getServiceSupabaseClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('daily_dashboard_metrics')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return json({ rows: data ?? [], page, page_size: pageSize, count: (data ?? []).length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});

