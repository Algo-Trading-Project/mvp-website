
import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { query } from './auroraClient.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (req.method !== 'POST') return Response.json({ error: 'Use POST' }, { status: 405 });

    const { start, end, monthsBack = 24 } = await req.json().catch(() => ({}));

    let s = start, e = end;
    if (!s || !e) {
      const [{ max_date }] = await query(`SELECT MAX(date) AS max_date FROM predictions`);
      if (!max_date) return Response.json({ total: 0, min_date: null, max_date: null, coverage: [] });
      e = String(max_date).slice(0, 10);
      const d = new Date(e + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - (monthsBack - 1));
      s = d.toISOString().slice(0, 10);
    }

    const rows = await query(`SELECT date FROM predictions WHERE date BETWEEN :s AND :e ORDER BY date ASC`, { s, e });

    const counts = {};
    let minDate = null, maxDate = null;
    for (const r of rows) {
      const d = String(r.date).slice(0, 10);
      const ym = d.slice(0, 7);
      counts[ym] = (counts[ym] || 0) + 1;
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }

    const coverage = Object.entries(counts)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    const coverageColumns = ["month", "count"]; // Explicitly define column names for coverage data

    return Response.json({
      total: rows.length,
      min_date: minDate,
      max_date: maxDate,
      coverage_columns: coverageColumns, // Include column names in the response
      coverage: coverage,
      modeUsed: 'aurora_range'
    });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});
