
import { query } from './auroraClient.js';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    const { horizon = '1d', start, end, width = 980, height = 360 } = await req.json();
    if (!start || !end) return Response.json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    if (!['1d', '7d'].includes(horizon)) {
      return Response.json({ error: `Unsupported horizon ${horizon}` }, { status: 400 });
    }

    const field = horizon === '7d'
      ? 'rolling_30d_ema_top_bottom_decile_spread_7d'
      : 'rolling_30d_ema_top_bottom_decile_spread_1d';

    const rows = await query(
      `SELECT date, ${field} AS spread
       FROM cross_sectional_metrics_1d
       WHERE date BETWEEN CAST(:s AS DATE) AND CAST(:e AS DATE)
       ORDER BY date ASC`,
      { s: start, e: end }
    );

    const x = rows.map(r => r.date);
    const y = rows.map(r => (typeof r.spread === 'number' || typeof r.spread === 'string') ? Number(r.spread) : null);

    const html = `<!DOCTYPE html>
<html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)}, type: 'scatter', mode: 'lines', line: { color: '#f59e0b', width: 2 }, hovertemplate: 'Date: %{x}<br>Spread (30d EMA): %{y:.2%}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  yaxis: { tickformat: '.2%', gridcolor: '#334155', tickfont: { color: '#94a3b8' } },
  xaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155' } };
const config = { responsive: true, displayModeBar: false, scrollZoom: false, staticPlot: true };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;

    return Response.json({ html, points: rows.length, data: rows, columns: ['date', 'spread'] });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});
