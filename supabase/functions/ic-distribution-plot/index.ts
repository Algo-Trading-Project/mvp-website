
import { query } from '../_shared/query.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const { horizon = '1d', start, end, bins = 20, width = 980, height = 360 } = await req.json();

    if (!start || !end) {
        return json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">Start and end date are required.</body></html>', bins: [] });
    }

    const field = horizon === '1d' ? 'cross_sectional_ic_1d' : 'cross_sectional_ic_7d';
    
    const rows = await query<{ ic: number | string }>(
      `SELECT ${field} AS ic FROM cross_sectional_metrics_1d 
       WHERE date BETWEEN CAST(:s AS DATE) AND CAST(:e AS DATE)
         AND ${field} IS NOT NULL`,
      { s: start, e: end }
    );

    if (!rows.length) {
      return json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No IC data in selected range.</body></html>', bins: [] });
    }

    const allVals = rows.map(r => Number(r.ic)).filter(v => Number.isFinite(v));

    if (!allVals.length) {
      return json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No valid IC values in range.</body></html>', bins: [] });
    }

    const [summary] = await query<{ mean: number; std: number; pos: number }>(
      `SELECT 
         AVG(${field}::double precision) AS mean,
         COALESCE(STDDEV_POP(${field}::double precision), 0) AS std,
         AVG(CASE WHEN ${field}::double precision > 0 THEN 1 ELSE 0 END) AS pos
       FROM cross_sectional_metrics_1d
       WHERE date BETWEEN CAST(:s AS DATE) AND CAST(:e AS DATE)
         AND ${field} IS NOT NULL`,
      { s: start, e: end }
    );

    const mean = Number(summary?.mean ?? 0);
    const std = Number(summary?.std ?? 0);
    const pos = Number(summary?.pos ?? 0);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const x = ${JSON.stringify(allVals)};
const data = [{ 
  type: 'histogram', 
  x: x, 
  nbinsx: ${bins},
  marker: { 
    color: '#60a5fa',
    line: { color: '#000000', width: 1 }
  }, 
  hovertemplate: 'IC: %{x:.3f}<br>Count: %{y}<extra></extra>' 
}];
const layout = { 
  paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', 
  margin: { l: 48, r: 20, t: 10, b: 30 },
  xaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155' }, 
  yaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  shapes: [
    { type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', 
      line: { color: '#ef4444', width: 2, dash: 'dash' } },
    { type: 'line', x0: ${mean}, x1: ${mean}, y0: 0, y1: 1, yref: 'paper', 
      line: { color: '#3b82f6', width: 2, dash: 'dash' } }
  ]
};
const config = { responsive: true, displayModeBar: false, scrollZoom: true };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;

    return json({ 
      html, 
      summary: { mean, std, pos }, 
      bins: bins, 
      start, 
      end, 
      total_points: allVals.length 
    });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
