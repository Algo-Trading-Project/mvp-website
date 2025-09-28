import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { query } from '../_shared/query.ts';
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

    let startDate = start;
    let endDate = end;

    if (!startDate || !endDate) {
      const [{ max_date } = { max_date: null }] = await query<{ max_date: string | null }>(
        'SELECT MAX(date)::date AS max_date FROM predictions'
      );

      if (!max_date) {
        return json({ total: 0, min_date: null, max_date: null, coverage: [], coverage_columns: ['month', 'count'] });
      }

      endDate = String(max_date);
      const d = new Date(`${endDate}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - (Number(monthsBack) - 1));
      startDate = d.toISOString().slice(0, 10);
    }

    const coverageRows = await query<{ month: string; count: number }>(
      `SELECT to_char(date, 'YYYY-MM') AS month,
              COUNT(*)::bigint AS count
         FROM predictions
        WHERE date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE)
        GROUP BY 1
        ORDER BY 1`,
      { start: startDate, end: endDate }
    );

    const [{ total } = { total: 0 }] = await query<{ total: number }>(
      `SELECT COUNT(*)::bigint AS total
         FROM predictions
        WHERE date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE)`,
      { start: startDate, end: endDate }
    );

    const minDate = coverageRows.length ? `${coverageRows[0].month}-01` : null;
    const maxDate = coverageRows.length ? `${coverageRows[coverageRows.length - 1].month}-01` : null;

    return json({
      total: Number(total ?? 0),
      min_date: minDate,
      max_date: maxDate,
      coverage_columns: ['month', 'count'],
      coverage: coverageRows,
      modeUsed: 'supabase_sql',
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
