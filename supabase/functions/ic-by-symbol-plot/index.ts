import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const { start, end, minPoints = 30, topN = 20 } = await req.json();

    if (!start || !end) {
      return json({ error: 'start and end dates required' }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();

    const { data, error } = await supabase.rpc('rpc_symbol_ic', {
      start_date: start,
      end_date: end,
      min_points: minPoints,
    });

    if (error) throw error;

    const coerceNumber = (value: unknown) => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string') {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };

    const symbols = (data ?? [])
      .map((row: Record<string, unknown>) => ({
        symbol: String(row.symbol ?? ''),
        spearman_ic: coerceNumber(row.spearman_ic),
        observation_count:
          typeof row.observation_count === 'number'
            ? Math.trunc(row.observation_count)
            : Number(row.observation_count ?? 0) || 0,
      }))
      .filter((row) => row.symbol);

    if (!symbols.length) {
      const empty = '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data available for IC calculation.</body></html>';
      return json({ html_top: empty, html_bottom: empty });
    }

    const valid = symbols.filter((row) => typeof row.spearman_ic === 'number' && Number.isFinite(row.spearman_ic));

    if (!valid.length) {
      const empty = '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No valid IC values available.</body></html>';
      return json({ html_top: empty, html_bottom: empty });
    }

    const sorted = [...valid].sort((a, b) => (b.spearman_ic as number) - (a.spearman_ic as number));
    const topRows = sorted.slice(0, topN);
    const bottomRows = [...sorted.slice(-topN)].reverse();

    const makePlot = (rows: typeof symbols, title: string, color: string) => {
      const x = rows.map((r) => r.symbol);
      const y = rows.map((r) => r.spearman_ic);
      const counts = rows.map((r) => r.observation_count);
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const x = ${JSON.stringify(x)};
const y = ${JSON.stringify(y)};
const counts = ${JSON.stringify(counts)};
const data = [{ type: 'bar', x, y, marker: { color: '${color}' }, hovertemplate: 'IC: %{y:.3f}<br>Observations: %{customdata}<br>Symbol: %{x}<extra></extra>', customdata: counts }];
const layout = {
  title: { text: '${title}', font: { color: '#e2e8f0', size: 14 }, x: 0.5 },
  paper_bgcolor: '#0b1220',
  plot_bgcolor: '#0b1220',
  margin: { l: 48, r: 20, t: 40, b: 80 },
  xaxis: { fixedrange:true, tickfont: { color: '#94a3b8' }, gridcolor: '#334155', tickangle: -45 },
  yaxis: { fixedrange:true, tickformat: '.3f', tickfont: { color: '#94a3b8' }, gridcolor: '#334155', zeroline: true, zerolinecolor: '#475569' }
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false};
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;
    };

    return json({
      html_top: makePlot(topRows, 'Top Tokens by IC', '#10b981'),
      html_bottom: makePlot(bottomRows, 'Bottom Tokens by IC', '#ef4444'),
      summary: {
        min_points: minPoints,
        top: topRows,
        bottom: bottomRows,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
