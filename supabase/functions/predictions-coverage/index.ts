import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';
// Public endpoint: coverage is safe to publish and helps drive default range

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // No auth requirement for public dashboard usage

    if (req.method !== 'POST') {
      return json({ error: 'Use POST' }, { status: 405 });
    }

    const { start, end, monthsBack = 24 } = await req.json().catch(() => ({}));

    const supabase = getServiceSupabaseClient();

    let startDate = start;
    let endDate = end;

    if (!startDate || !endDate) {
      const { data: latestRows, error: latestError } = await supabase
        .from('predictions')
        .select('date')
        .order('date', { ascending: false })
        .limit(1);

      if (latestError) throw latestError;

      const maxDate = latestRows?.[0]?.date ?? null;

      if (!maxDate) {
        return json({ total: 0, min_date: null, max_date: null, coverage: [], coverage_columns: ['month', 'count'] });
      }

      endDate = String(maxDate);
      const d = new Date(`${endDate}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - (Number(monthsBack) - 1));
      startDate = d.toISOString().slice(0, 10);
    }

    let coverage: { month: string; day_count: number }[] = [];
    try {
      const rpc = await supabase.rpc('rpc_predictions_coverage', {
        start_date: startDate,
        end_date: endDate,
      });
      if (rpc.error) throw rpc.error;
      coverage = (rpc.data ?? []) as { month: string; day_count: number }[];
    } catch (_rpcErr) {
      // Fallback: compute using table directly
      const { data, error } = await supabase
        .from('predictions')
        .select('date')
        .gte('date', startDate)
        .lte('date', endDate);
      if (error) throw error;
      const counts: Record<string, Set<string>> = {};
      for (const r of (data ?? []) as { date: string }[]) {
        const d = String(r.date ?? '').slice(0, 10);
        if (!d) continue;
        const month = `${d.slice(0, 7)}`;
        (counts[month] ||= new Set()).add(d);
      }
      coverage = Object.entries(counts)
        .map(([month, days]) => ({ month, day_count: days.size }))
        .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
    }
    const minDate = coverage.length ? `${coverage[0].month}-01` : startDate;
    const maxDate = coverage.length ? `${coverage[coverage.length - 1].month}-01` : endDate;
    const total = coverage.reduce((sum, row) => sum + Number(row.day_count ?? 0), 0);

    return json({
      total,
      min_date: minDate,
      max_date: maxDate,
      latest_date: endDate, // most recent actual day present in predictions
      coverage_columns: ['month', 'count'],
      coverage: coverage.map(({ month, day_count }) => ({ month, count: Number(day_count) })),
      modeUsed: 'supabase_rpc',
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
