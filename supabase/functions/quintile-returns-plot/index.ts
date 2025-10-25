import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const start: string | undefined = body?.start;
    const end: string | undefined = body?.end;
    const horizon: string = (body?.horizon === '3d') ? '3d' : '1d';
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    const supabase = getServiceSupabaseClient();
    let data: any[] | null = null;
    const rpc = await supabase.rpc('rpc_quintile_returns', {
      start_date: start,
      end_date: end,
      p_horizon: horizon,
    });
    if (rpc.error) throw rpc.error;
    data = rpc.data as any[] | null;

    const rows = (data ?? []).map((r: Record<string, unknown>) => ({
      decile: Number((r as any).decile ?? (r as any).quintile),
      avg_return: typeof (r as any).avg_return === 'number' ? (r as any).avg_return : Number((r as any).avg_return ?? 0),
    }))
    .filter((r) => Number.isFinite(r.decile) && Number.isFinite(r.avg_return));
    // Ensure sorted by decile ascending 1..10
    rows.sort((a, b) => a.decile - b.decile);
    const x = rows.map((d) => d.decile);
    const y = rows.map((d) => d.avg_return);

    const html = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ type: 'bar', x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)}, marker: { color: '#6366f1' }, hovertemplate: 'Decile %{x}<br>Avg Return: %{y:.4%}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  yaxis: { tickformat: '.2%', gridcolor: '#334155', tickfont: { color: '#94a3b8' } },
  xaxis: { title:'Decile', tickmode:'linear', dtick:1, tick0:1, gridcolor: '#334155', tickfont: { color: '#94a3b8' }, titlefont: { color:'#cbd5e1' } }, height: 360 };
const config = { responsive: true, displayModeBar: false, scrollZoom: false };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
window.addEventListener('resize', () => Plotly.Plots.resize(el));
</script></body></html>`;

    return json({ html, data });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
