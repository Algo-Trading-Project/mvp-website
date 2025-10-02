import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

// Very simple bootstrap of mean return over fixed horizon windows
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, { status: 405 });
    const { start, end, iterations = 5000, window = 30, height = 360 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    const supabase = getServiceSupabaseClient();

    // Pull strategy daily returns from cross_sectional_metrics_1d
    const pageSize = 1000; let fromIdx = 0; const cross: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('cross_sectional_metrics_1d')
        .select('date, cs_top_bottom_decile_spread')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
        .range(fromIdx, fromIdx + pageSize - 1);
      if (error) throw error;
      if (data?.length) cross.push(...data);
      if (!data || data.length < pageSize) break;
      fromIdx += pageSize;
    }
    const returns: number[] = [];
    for (const r of cross) {
      const v = typeof r.cs_top_bottom_decile_spread === 'number' ? r.cs_top_bottom_decile_spread : Number(r.cs_top_bottom_decile_spread ?? 0);
      returns.push(Number.isFinite(v) ? v : 0);
    }

    // Bootstrap: sample with replacement windows of given length; compute compounded return over window
    const iters = Math.max(100, Number(iterations) || 5000);
    const w = Math.max(5, Number(window) || 30);
    const rng = (n:number) => Math.floor(Math.random() * n);
    const samples: number[] = [];
    for (let i=0;i<iters;i++){
      let eq=1; for (let k=0;k<w;k++){ const r = returns[rng(returns.length)] ?? 0; eq *= (1 + r); }
      samples.push(eq - 1); // total return over window
    }

    // Build histogram bins
    const minV = Math.min(...samples), maxV = Math.max(...samples);
    const bins = 50; const edges = Array.from({length: bins+1}, (_,i)=> minV + (i*(maxV-minV)/bins));
    const counts = new Array(bins).fill(0);
    for (const v of samples){ let idx = Math.min(bins-1, Math.max(0, Math.floor((v - minV)/(maxV-minV+1e-12)*bins))); counts[idx]++; }
    const centers = edges.slice(0,-1).map((e,i)=> (e + edges[i+1]) / 2);

    const html = `<!DOCTYPE html><html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div><script>
const x=${JSON.stringify(centers)}, y=${JSON.stringify(counts)};
const data=[{type:'bar', x, y, marker:{color:'#6366f1'}, hovertemplate:'Ret: %{x:.2%}<br>Count: %{y}<extra></extra>'}];
const layout={paper_bgcolor:'#0b1220',plot_bgcolor:'#0b1220',margin:{l:48,r:20,t:10,b:30},xaxis:{tickformat:'.1%',gridcolor:'#334155',tickfont:{color:'#94a3b8'}},yaxis:{gridcolor:'#334155',tickfont:{color:'#94a3b8'}},height:${Number(height)||360}};
const config={responsive:true,displayModeBar:false,scrollZoom:false};
Plotly.newPlot('chart',data,layout,config);window.addEventListener('resize',()=>Plotly.Plots.resize(document.getElementById('chart')));
</script></body></html>`;

    return json({ html, iterations: iters, window: w, points: returns.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});

