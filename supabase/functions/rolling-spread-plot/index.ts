
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

    // Simplified: query table directly (no RPC)
    const { data: tbl, error: tblErr } = await supabase
      .from('cross_sectional_metrics_1d')
      .select('date, rolling_30d_avg_top_bottom_decile_spread')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true });
    if (tblErr) throw tblErr;

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
        spread: coerceNumber(r['rolling_30d_avg_top_bottom_decile_spread']),
      }))
      .filter((r) => r.date);

    const x = rows.map((r) => r.date);
    const y = rows.map((r) => (typeof r.spread === 'number' ? r.spread : null));

    const html = `<!DOCTYPE html>
<html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)}, type: 'scatter', mode: 'lines', connectgaps: true, line: { color: '#f59e0b', width: 2 }, hovertemplate: 'Date: %{x}<br>Spread (30d Avg): %{y:.2%}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  yaxis: { tickformat: '.2%', gridcolor: '#334155', tickfont: { color: '#94a3b8' } },
  xaxis: { type: 'date', range: ['${String(start)}', '${String(end)}'], tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  dragmode: 'zoom', autosize: true,
  height: ${Number(height) || 360}
 };
const config = { responsive: true, displayModeBar: false, scrollZoom: false };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
window.addEventListener('resize', () => Plotly.Plots.resize(el));
</script></body></html>`;

    const actualStart = rows.length ? rows[0].date : null;
    const actualEnd = rows.length ? rows[rows.length - 1].date : null;
    return json({
      html,
      points: rows.length,
      data: rows,
      range: { requested: { start, end }, actual: { start: actualStart, end: actualEnd } },
      columns: ['date', 'spread'],
    });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
