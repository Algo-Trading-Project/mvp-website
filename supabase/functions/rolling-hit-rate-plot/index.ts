import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

type RpcRow = { date: string; rate: number | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const body = await req.json().catch(() => ({}));
    const start: string | undefined = body?.start;
    const end: string | undefined = body?.end;
    const windowSize: number = Number(body?.window ?? 30);
    const width = Number(body?.width ?? 980);
    const height = Number(body?.height ?? 360);

    if (!start || !end) {
      return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();

    // Use RPC defined in migrations for efficiency
    const { data, error } = await supabase.rpc('rpc_rolling_hit_rate', {
      start_date: start,
      end_date: end,
      window: windowSize,
    });

    if (error) throw error;

    const rows: RpcRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
      date: String(r.date ?? ''),
      rate:
        typeof r.rate === 'number'
          ? (Number.isFinite(r.rate) ? (r.rate as number) : null)
          : typeof r.rate === 'string'
          ? (() => {
              const num = Number(r.rate);
              return Number.isFinite(num) ? num : null;
            })()
          : null,
    })).filter((r) => r.date);

    const x = rows.map((r) => r.date);
    const y = rows.map((r) => (typeof r.rate === 'number' ? r.rate : null));

    const html = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)}, type: 'scatter', mode: 'lines', line: { color: '#22c55e', width: 2 }, hovertemplate: 'Date: %{x}<br>Hit Rate: %{y:.2%}<extra></extra>' }];
const layout = {
  paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  yaxis: { tickformat: '.0%', gridcolor: '#334155', tickfont: { color: '#94a3b8' }, range: [0, 1] },
  xaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  dragmode: 'zoom', autosize: true, height: ${height}
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
window.addEventListener('resize', () => Plotly.Plots.resize(el));
</script></body></html>`;

    return json({ html, points: rows.length, window: windowSize });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
