import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
    
    const { horizon = '1d', direction = 'long', start, end, bins = 30, width = 980, height = 360 } = await req.json();
    if (!start || !end) return json({ error: 'start and end date are required' }, { status: 400 });

    if (!['1d', '7d'].includes(horizon)) {
      return json({ error: `Unsupported horizon ${horizon}` }, { status: 400 });
    }

    if (!['long', 'short'].includes(direction)) {
      return json({ error: `Unsupported direction ${direction}` }, { status: 400 });
    }

    const field = direction === 'long'
      ? `cs_${horizon}_long_expectancy`
      : `cs_${horizon}_short_expectancy`;
    
    const supabase = getServiceSupabaseClient();

    const { data, error } = await supabase
      .from('cross_sectional_metrics_1d')
      .select(`${field}`)
      .gte('date', start)
      .lte('date', end);

    if (error) throw error;

    const allVals = (data ?? []).map((row: Record<string, unknown>) => Number(row[field]))
      .filter((value) => Number.isFinite(value));
    if (allVals.length === 0) return json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data in range.</body></html>' });

    const { data: summaryData, error: summaryError } = await supabase.rpc('rpc_expectancy_distribution_summary', {
      field_name: field,
      start_date: start,
      end_date: end,
    });

    if (summaryError) throw summaryError;

    const summary = Array.isArray(summaryData) && summaryData.length > 0
      ? summaryData[0] as { mean: number; std: number; pos: number }
      : { mean: 0, std: 0, pos: 0 };

    const mean = Number(summary?.mean ?? 0);
    const std = Number(summary?.std ?? 0);
    const pos = Number(summary?.pos ?? 0);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const x = ${JSON.stringify(allVals)};
const data = [{ type: 'histogram', x, nbinsx: ${bins}, marker: { color: '#22d3ee', line: { color: '#000000', width: 1 } }, hovertemplate: 'Expectancy: %{x:.4f}<br>Count: %{y}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 }, xaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155' }, yaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
 shapes: [{ type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper', line: { color: '#ef4444', width: 2, dash: 'dash' } }, { type: 'line', x0: ${mean}, x1: ${mean}, y0: 0, y1: 1, yref: 'paper', line: { color: '#3b82f6', width: 2, dash: 'dash' } }] };
const config = { responsive: true, displayModeBar: false, scrollZoom: false };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;

    return json({ html, summary: { mean, std, pos } });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
