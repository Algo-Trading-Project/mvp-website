import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const { start, end, samples = 10000, bins = 20, horizon = '1d' } = await req.json();
    if (!start || !end) return json({ error: 'start and end date are required' }, { status: 400 });

    const supabase = getServiceSupabaseClient();
    const field = (horizon === '3d') ? 'cs_top_bottom_decile_spread_3d' : 'cs_top_bottom_decile_spread_1d';
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

    const vals = (all ?? []).map((r: Record<string, unknown>) => Number(r[field])).filter((v)=>Number.isFinite(v));
    if (!vals.length) return json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data in range.</body></html>' });

    const n = vals.length;
    const boot = new Array(samples);
    for (let i=0;i<samples;i++){
      let s=0; for (let j=0;j<n;j++){ s += vals[(Math.random()*n)|0]; }
      boot[i] = s/n;
    }
    boot.sort((a,b)=>a-b);
    const mean = boot.reduce((a,b)=>a+b,0)/samples;
    const lo = boot[Math.floor(0.005*samples)];
    const hi = boot[Math.ceil(0.995*samples)];

    const html = `<!DOCTYPE html>
<html><head><meta charset=\"utf-8\"/><script src=\"https://cdn.plot.ly/plotly-2.27.0.min.js\"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id=\"chart\"></div>
<script>
const x = ${JSON.stringify(boot)};
const data = [{ type:'histogram', x, nbinsx:${bins}, marker:{ color:'#059669', line:{ color:'#064e3b', width:1 } }, hovertemplate:'Mean Spread: %{x:.4f}<br>Count: %{y}<extra></extra>' }];
const layout = { paper_bgcolor:'#0b1220', plot_bgcolor:'#0b1220', margin:{ l:48, r:20, t:10, b:30 }, xaxis:{ tickfont:{ color:'#94a3b8' }, gridcolor:'#334155' }, yaxis:{ tickfont:{ color:'#94a3b8' }, gridcolor:'#334155' }, shapes:[{ type:'line', x0:${mean}, x1:${mean}, y0:0, y1:1, yref:'paper', line:{ color:'#3b82f6', width:2, dash:'dash' } }] };
const config = { responsive:true, displayModeBar:false, scrollZoom:false };
Plotly.newPlot('chart', data, layout, config);
</script></body></html>`;

    return json({ html, summary: { mean, ci_lower: lo, ci_upper: hi }, samples, points: n });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
