import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const { start, end, width = null, height = 360 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
    const supabase = getServiceSupabaseClient();

    // Prefer RPC if available; otherwise fall back to a direct table query
    let data: unknown[] | null = null;
    try {
      const rpc = await supabase.rpc('rpc_cross_sectional_metrics_time_series', {
        start_date: start,
        end_date: end,
      });
      if (rpc.error) throw rpc.error;
      data = rpc.data as unknown[] | null;
    } catch (_rpcErr) {
      const { data: tbl, error: tblErr } = await supabase
        .from('cross_sectional_metrics_1d')
        .select('date, rolling_30d_avg_ic')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true });
      if (tblErr) throw tblErr;
      data = tbl as unknown[] | null;
    }

    const rows = (data ?? []).map((r: Record<string, unknown>) => ({
      date: String(r.date ?? ''),
      rolling_30d_avg_ic:
        typeof r['rolling_30d_avg_ic'] === 'number'
          ? (Number.isFinite(r['rolling_30d_avg_ic']) ? (r['rolling_30d_avg_ic'] as number) : null)
          : typeof r['rolling_30d_avg_ic'] === 'string'
          ? (() => {
              const num = Number(r['rolling_30d_avg_ic']);
              return Number.isFinite(num) ? num : null;
            })()
          : null,
    })).filter((r) => r.date);

    const x = rows.map((r) => r.date);
    const y = rows.map((r) => (typeof r.rolling_30d_avg_ic === 'number' ? r.rolling_30d_avg_ic : null));

    const html = `<!DOCTYPE html>
<html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)}, type: 'scatter', mode: 'lines', line: { color: '#60a5fa', width: 2 }, hovertemplate: 'Date: %{x}<br>IC: %{y:.3f}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  yaxis: { fixedrange:true, tickformat: '.3f', gridcolor: '#334155', tickfont: { color: '#94a3b8' }, zeroline: true, zerolinecolor: '#475569' },
  xaxis: { fixedrange:true, tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  autosize: true,
  height: ${Number(height) || 360}
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
window.addEventListener('resize', () => Plotly.Plots.resize(el));
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
