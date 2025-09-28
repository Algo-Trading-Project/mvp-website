import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { getUserFromRequest } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const { data: coverageData, error: coverageError } = await supabase.rpc('rpc_predictions_coverage', {
      start_date: startDate,
      end_date: endDate,
    });

    if (coverageError) throw coverageError;

    const coverage = (coverageData ?? []) as { month: string; day_count: number }[];
    const minDate = coverage.length ? `${coverage[0].month}-01` : startDate;
    const maxDate = coverage.length ? `${coverage[coverage.length - 1].month}-01` : endDate;
    const total = coverage.reduce((sum, row) => sum + Number(row.day_count ?? 0), 0);

    return json({
      total,
      min_date: minDate,
      max_date: maxDate,
      coverage_columns: ['month', 'count'],
      coverage: coverage.map(({ month, day_count }) => ({ month, count: Number(day_count) })),
      modeUsed: 'supabase_rpc',
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
