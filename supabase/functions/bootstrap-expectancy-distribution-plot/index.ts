import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
    
    const { horizon = '1d', direction = 'combined', start, end, samples = 10000, bins = 30 } = await req.json();
    if (!start || !end) return json({ error: 'start and end date are required' }, { status: 400 });

    let field;
    if (direction === 'long') field = `cs_${horizon}_long_expectancy`;
    else if (direction === 'short') field = `cs_${horizon}_short_expectancy`;
    else field = `cs_${horizon}_expectancy`;
    
    const supabase = getServiceSupabaseClient();

    const { data, error } = await supabase
      .from('cross_sectional_metrics_1d')
      .select(`${field}`)
      .gte('date', start)
      .lte('date', end);

    if (error) throw error;

    const dailyVals = (data ?? []).map((row: Record<string, unknown>) => Number(row[field]))
      .filter((value) => Number.isFinite(value));
    if (dailyVals.length === 0) {
        return json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data in range.</body></html>' });
    }

    // Bootstrap resampling
    const n = dailyVals.length;
    const bootstrappedMeans = [];
    for (let i = 0; i < samples; i++) {
        let resampleSum = 0;
        for (let j = 0; j < n; j++) {
            const randomIndex = Math.floor(Math.random() * n);
            resampleSum += dailyVals[randomIndex];
        }
        bootstrappedMeans.push(resampleSum / n);
    }
    bootstrappedMeans.sort((a, b) => a - b);
    
    const meanOfMeans = bootstrappedMeans.reduce((a, b) => a + b, 0) / samples;
    const lowerBound = bootstrappedMeans[Math.floor(0.005 * samples)];
    const upperBound = bootstrappedMeans[Math.ceil(0.995 * samples)];

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const x = ${JSON.stringify(bootstrappedMeans)};
const data = [{ type: 'histogram', x, nbinsx: ${bins}, marker: { color: '#8b5cf6', line: { color: '#000000', width: 1 } }, hovertemplate: 'Mean Expectancy: %{x:.4f}<br>Count: %{y}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 }, xaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155' }, yaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
 shapes: [{ type: 'line', x0: ${meanOfMeans}, x1: ${meanOfMeans}, y0: 0, y1: 1, yref: 'paper', line: { color: '#3b82f6', width: 2, dash: 'dash' } }] };
const config = { responsive: true, displayModeBar: false, scrollZoom: true };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;

    return json({ html, summary: { mean: meanOfMeans, ci_lower: lowerBound, ci_upper: upperBound } });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
