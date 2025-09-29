import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

function shiftDays(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    let { horizon = '1d', direction = 'long', windowDays = 30, start, end } = await req.json();

    const supabase = getServiceSupabaseClient();

    const { data: latestRows, error: latestError } = await supabase
      .from('predictions')
      .select('date')
      .order('date', { ascending: false })
      .limit(1);

    if (latestError) throw latestError;

    const maxDate = latestRows?.[0]?.date ? String(latestRows[0].date).slice(0, 10) : null;

    if (!maxDate) {
      return json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data.</body></html>', n: 0 });
    }

    const resolvedEnd = end || maxDate;
    const resolvedStart = start || shiftDays(resolvedEnd, -(windowDays - 1));

    const { data: rows, error } = await supabase.rpc('rpc_decile_performance', {
      horizon,
      direction,
      start_date: resolvedStart,
      end_date: resolvedEnd,
    });

    if (error) throw error;

    const deciles = (rows ?? []) as { decile: number; avg_return: number; n: number }[];

    const x = deciles.map(r => `Decile ${r.decile}`);
    const y = deciles.map(r => Number(r.avg_return));

    const html = `<!DOCTYPE html><html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head><body><div id="chart"></div><script>
const data=[{type:'bar',x:${JSON.stringify(x)},y:${JSON.stringify(y)},marker:{color:'#8b5cf6'},hovertemplate:'Avg Return: %{y:.2%}<br>%{x}<extra></extra>'}];
const layout={paper_bgcolor:'#0b1220',plot_bgcolor:'#0b1220',margin:{l:48,r:20,t:20,b:40},xaxis:{tickfont:{color:'#94a3b8'},gridcolor:'#334155'},yaxis:{tickformat:'.2%',tickfont:{color:'#94a3b8'},gridcolor:'#334155',zeroline:true,zerolinecolor:'#475569'}};
Plotly.newPlot('chart',data,layout,{responsive:true,displayModeBar:false});</script></body></html>`;

    return json({
      html,
      n: deciles.reduce((acc, r) => acc + Number(r.n ?? 0), 0),
      range_start: resolvedStart,
      range_end: resolvedEnd
    });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
