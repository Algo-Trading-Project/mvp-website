import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const { start, end, width = null, height = 360 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
    const supabase = getServiceSupabaseClient();

    // Fetch all rows across the requested range, paging to bypass PostgREST row caps
    const pageSize = 1000; // PostgREST default max rows per page
    let fromIdx = 0;
    const tbl: Array<Record<string, unknown>> = [];
    while (true) {
      const { data, error } = await supabase
        .from('cross_sectional_metrics_1d')
        .select('date, rolling_30d_avg_ic')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
        .range(fromIdx, fromIdx + pageSize - 1);
      if (error) throw error;
      if (data && data.length) tbl.push(...data as Array<Record<string, unknown>>);
      if (!data || data.length < pageSize) break;
      fromIdx += pageSize;
    }

    const coerceNumber = (v: unknown): number | null => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const rows = (tbl ?? [])
      .map((r: Record<string, unknown>) => ({
        date: String(r.date ?? '').slice(0, 10),
        ic: coerceNumber(r['rolling_30d_avg_ic']),
      }))
      .filter((r) => r.date);

    const x = rows.map((r) => r.date);
    const y = rows.map((r) => (typeof r.ic === 'number' ? r.ic : null));

    const axisStart = rows.length ? rows[0].date : String(start);
    const axisEnd = rows.length ? rows[rows.length - 1].date : String(end);

    const html = `<!DOCTYPE html>
<html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)}, type: 'scatter', mode: 'lines', connectgaps: true, line: { color: '#60a5fa', width: 2 }, hovertemplate: 'Date: %{x}<br>IC: %{y:.3f}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  yaxis: { tickformat: '.3f', gridcolor: '#334155', tickfont: { color: '#94a3b8' }, zeroline: true, zerolinecolor: '#475569' },
  xaxis: { type: 'date', range: ['${axisStart}', '${axisEnd}'], tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  dragmode: 'zoom', autosize: true,
  height: ${Number(height) || 360}
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
window.addEventListener('resize', () => Plotly.Plots.resize(el));
</script></body></html>`;

    // Compute latest + simple index-offset deltas within filtered series (skip nulls)
    const lastIndex = (() => {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (typeof rows[i]?.ic === 'number') return i;
      }
      return -1;
    })();
    const current = lastIndex >= 0 ? rows[lastIndex].ic as number : null;
    const currentDate = lastIndex >= 0 ? rows[lastIndex].date : null;
    const pickDelta = (offset: number) => {
      if (lastIndex < 0) return null;
      const j = lastIndex - offset;
      if (j >= 0 && typeof rows[j]?.ic === 'number' && typeof current === 'number') {
        return current - (rows[j].ic as number);
      }
      return null;
    };
    const summary = {
      last: current,
      last_date: currentDate,
      deltas: {
        d1: pickDelta(1),
        d7: pickDelta(7),
        d30: pickDelta(30),
      },
    } as const;

    return json({
      html,
      points: rows.length,
      data: rows,
      summary,
      range: { requested: { start, end }, actual: { start: rows.length ? rows[0].date : null, end: rows.length ? rows[rows.length - 1].date : null } },
      columns: [{ name: 'date', type: 'string' }, { name: 'ic', type: 'number' }],
    });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
