import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const { start, end, bins = 20, width = 980, height = 360 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required' }, { status: 400 });

    const supabase = getServiceSupabaseClient();
    const field = 'cs_top_bottom_decile_spread_1d';
    const pageSize = 1000; let fromIdx = 0; const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('daily_dashboard_metrics')
        .select(`${field}`)
        .gte('date', start)
        .lte('date', end)
        .range(fromIdx, fromIdx + pageSize - 1);
      if (error) throw error;
      if (data?.length) all.push(...data);
      if (!data || data.length < pageSize) break;
      fromIdx += pageSize;
    }

    const values = (all ?? []).map((r: Record<string, unknown>) => Number(r[field])).filter((v) => Number.isFinite(v));
    if (!values.length) return json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No spread data in range.</body></html>' });

    const mean = values.reduce((a,b)=>a+b,0) / values.length;
    const variance = values.reduce((s,x)=> s + (x-mean)*(x-mean), 0) / values.length;
    const std = Math.sqrt(variance);
    const pos = values.filter((v)=> v>0).length / values.length;
    const sharpe_ann = std ? (mean / std) * Math.sqrt(365) : 0;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><script src=\"https://cdn.plot.ly/plotly-2.27.0.min.js\"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id=\"chart\"></div>
<script>
const x = ${JSON.stringify(values)};
const data = [{ type:'histogram', x, nbinsx:${bins}, marker:{ color:'#f59e0b', line:{ color:'#000', width:1 } }, hovertemplate:'Spread: %{x:.4f}<br>Count: %{y}<extra></extra>' }];
const layout = { paper_bgcolor:'#0b1220', plot_bgcolor:'#0b1220', margin:{ l:48, r:20, t:10, b:30 }, xaxis:{ tickfont:{ color:'#94a3b8' }, gridcolor:'#334155' }, yaxis:{ tickfont:{ color:'#94a3b8' }, gridcolor:'#334155' }, shapes:[{ type:'line', x0:${mean}, x1:${mean}, y0:0, y1:1, yref:'paper', line:{ color:'#3b82f6', width:2, dash:'dash' } }] };
const config = { responsive:true, displayModeBar:false, scrollZoom:false };
Plotly.newPlot('chart', data, layout, config);
</script></body></html>`;

    return json({ html, summary: { mean, std, pos, sharpe_ann }, bins, start, end, points: values.length });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
