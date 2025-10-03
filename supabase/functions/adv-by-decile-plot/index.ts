import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
    const { start, end, window = 30, height = 360 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
    const supabase = getServiceSupabaseClient();
    const rpc = await supabase.rpc('rpc_adv_by_decile', { start_date: start, end_date: end });
    if (rpc.error) throw rpc.error;
    const data = rpc.data as any[] | null;
    const bars = (data ?? []).map((r: Record<string, unknown>) => ({
      decile: Number(r.decile),
      median_adv_30: typeof r.median_adv_30 === 'number' ? r.median_adv_30 as number : Number(r.median_adv_30 ?? 0),
    })).sort((a,b)=> a.decile - b.decile);

    const x = bars.map(b=> b.decile);
    const y = bars.map(b=> b.median_adv_30);
    const html = `<!DOCTYPE html>
<html><head><script src=\"https://cdn.plot.ly/plotly-2.27.0.min.js\"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id=\"chart\"></div><script>
const data = [{ type:'bar', x:${JSON.stringify(x)}, y:${JSON.stringify(y)}, marker:{ color:'#8b5cf6' }, hovertemplate:'Decile %{x}<br>Median ADV30: %{y:.0f}<extra></extra>' }];
const layout = { paper_bgcolor:'#0b1220', plot_bgcolor:'#0b1220', margin:{ l:48, r:20, t:10, b:30 }, xaxis:{ title:'Decile', tickmode:'linear', dtick:1, gridcolor:'#334155', tickfont:{ color:'#94a3b8' }, titlefont:{ color:'#cbd5e1' } }, yaxis:{ gridcolor:'#334155', tickfont:{ color:'#94a3b8' } }, height:${Number(height)||360} };
const config = { responsive:true, displayModeBar:false, scrollZoom:false };
Plotly.newPlot('chart', data, layout, config);
</script></body></html>`;

    return json({ html, data: bars, params: { start, end, window } });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
