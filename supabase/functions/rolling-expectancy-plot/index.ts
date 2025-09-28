import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { horizon = '1d', direction = 'combined', start, end, width = 980, height = 360 } = await req.json();
    
    if (!start || !end) {
      return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
    }

    const fieldMap = {
      combined: horizon === '1d' ? 'rolling_avg_1d_expectancy' : 'rolling_avg_7d_expectancy',
      long: horizon === '1d' ? 'rolling_avg_1d_long_expectancy' : 'rolling_avg_7d_long_expectancy',
      short: horizon === '1d' ? 'rolling_avg_1d_short_expectancy' : 'rolling_avg_7d_short_expectancy',
    };

    const field = fieldMap[direction];
    
    const supabase = getServiceSupabaseClient();

    const { data, error } = await supabase
      .from('cross_sectional_metrics_1d')
      .select(`date, ${field}`)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true });

    if (error) throw error;

    const rows = data ?? [];
    const x = rows.map((r: Record<string, unknown>) => r.date as string);
    const y = rows.map((r: Record<string, unknown>) => {
      const val = r[field];
      return typeof val === 'number' ? val : typeof val === 'string' ? Number(val) : null;
    });
    const colors = { combined: '#22d3ee', long: '#10b981', short: '#ef4444' };
    
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
const config = { responsive: true, displayModeBar: false, scrollZoom: true };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;

    return json({ html, points: rows.length });
    
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
