import { query } from './auroraClient.js';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { horizon = '1d', direction = 'long', start, end, width = 980, height = 360 } = await req.json();
    
    if (!start || !end) {
      return Response.json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
    }

    if (!['1d', '7d'].includes(horizon)) {
      return Response.json({ error: `Unsupported horizon ${horizon}` }, { status: 400 });
    }

    if (!['long', 'short'].includes(direction)) {
      return Response.json({ error: `Unsupported direction ${direction}` }, { status: 400 });
    }

    const field = horizon === '1d'
      ? (direction === 'long' ? 'rolling_avg_1d_long_expectancy' : 'rolling_avg_1d_short_expectancy')
      : (direction === 'long' ? 'rolling_avg_7d_long_expectancy' : 'rolling_avg_7d_short_expectancy');
    
    const rows = await query(
      `SELECT date, ${field} AS value
       FROM cross_sectional_metrics_1d
       WHERE date BETWEEN CAST(:s AS DATE) AND CAST(:e AS DATE)
       ORDER BY date ASC`,
      { s: start, e: end }
    );

    const x = rows.map(r => r.date);
    const y = rows.map(r => (typeof r.value === 'number' || typeof r.value === 'string') ? Number(r.value) : null);
    const colors = { long: '#10b981', short: '#ef4444' };
    
    const trace = {
      x,
      y,
      type: 'scatter',
      mode: 'lines',
      name: direction.charAt(0).toUpperCase() + direction.slice(1),
      line: { color: colors[direction], width: 2 },
      hovertemplate: `${direction.charAt(0).toUpperCase() + direction.slice(1)}: %{y:.2%}<br>Date: %{x}<extra></extra>`
    };

    const html = `<!DOCTYPE html>
<html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [${JSON.stringify(trace)}];
const layout = { 
  paper_bgcolor: '#0b1220', 
  plot_bgcolor: '#0b1220', 
  margin: { l: 48, r: 20, t: 10, b: 30 },
  yaxis: { tickformat: '.2%', gridcolor: '#334155', tickfont: { color: '#94a3b8' } },
  xaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  legend: { font: { color: '#94a3b8' }, bgcolor: 'rgba(0,0,0,0)' }
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false, staticPlot: true };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;

    return Response.json({ html, points: rows.length });
    
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});
