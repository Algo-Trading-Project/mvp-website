import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const { start, end, width = 980, height = 360 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
    const supabase = getServiceSupabaseClient();

    const { data, error } = await supabase
      .from('cross_sectional_metrics_1d')
      .select(`date, rolling_30d_avg_ic`)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true });

    if (error) throw error;

    const rows = data ?? [];
    const x = rows.map((r: Record<string, unknown>) => r.date as string);
    const y = rows.map((r: Record<string, unknown>) => {
      const val = r['rolling_30d_avg_ic'];
      return typeof val === 'number' ? val : typeof val === 'string' ? Number(val) : null;
    });

    const html = `<!DOCTYPE html>
<html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)}, type: 'scatter', mode: 'lines', line: { color: '#60a5fa', width: 2 }, hovertemplate: 'Date: %{x}<br>IC: %{y:.3f}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  yaxis: { fixedrange:true, tickformat: '.3f', gridcolor: '#334155', tickfont: { color: '#94a3b8' }, zeroline: true, zerolinecolor: '#475569' },
  xaxis: { fixedrange:true, tickfont: { color: '#94a3b8' }, gridcolor: '#334155' } };
    const config = { responsive: false, displayModeBar: false, scrollZoom: false };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;

    return json({ 
      html, 
      points: rows.length, 
      columns: [{ name: 'date', type: 'string' }, { name: 'ic', type: 'number' }] 
    });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
