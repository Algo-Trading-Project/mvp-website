import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

type Row = { date: string; y_pred: number | null; forward_returns_1: number | null };

async function fetchPredictions(supabase: any, start: string, end: string): Promise<Row[]> {
  const pageSize = 10000;
  let from = 0;
  let to = pageSize - 1;
  const rows: Row[] = [];
  while (true) {
    const { data, error, count } = await supabase
      .from('predictions')
      .select('date,y_pred,forward_returns_1', { count: 'exact' })
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .range(from, to);
    if (error) throw error;
    rows.push(
      ...(data ?? []).map((r: any) => ({
        date: String(r.date ?? ''),
        y_pred: typeof r.y_pred === 'number' ? r.y_pred : Number(r.y_pred ?? NaN),
        forward_returns_1:
          typeof r.forward_returns_1 === 'number' ? r.forward_returns_1 : Number(r.forward_returns_1 ?? NaN),
      }))
    );
    if (!count || rows.length >= count) break;
    from += pageSize;
    to += pageSize;
  }
  return rows;
}

function computeQuintileAverages(rows: Row[]) {
  // Group by date
  const byDate = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.date || !Number.isFinite(r.y_pred!) || !Number.isFinite(r.forward_returns_1!)) continue;
    const arr = byDate.get(r.date) ?? [];
    arr.push(r);
    byDate.set(r.date, arr);
  }

  const quintilePerDate: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  for (const [_, arr] of byDate) {
    if (arr.length < 5) continue;
    // sort by y_pred ascending
    const sorted = [...arr].sort((a, b) => (a.y_pred! - b.y_pred!));
    const n = sorted.length;
    const idx = (q: number) => Math.floor(((q + 1) / 5) * n);
    // Assign quintile by index ranges using ntile logic
    for (let i = 0; i < n; i++) {
      const q = Math.min(4, Math.floor((i * 5) / n));
      const fr = sorted[i].forward_returns_1!;
      if (!Number.isFinite(fr)) continue;
      quintilePerDate[q].push(fr);
    }
  }
  // Mean across dates for each quintile
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const result = [0, 1, 2, 3, 4].map((q) => ({ quintile: q, avg_return_1d: mean(quintilePerDate[q]) }));
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, { status: 405 });
    const { start, end } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    const supabase = getServiceSupabaseClient();
    const rows = await fetchPredictions(supabase, start, end);
    const data = computeQuintileAverages(rows);
    const x = data.map((d) => String(d.quintile));
    const y = data.map((d) => d.avg_return_1d);

    const html = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ type: 'bar', x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)}, marker: { color: '#6366f1' }, hovertemplate: 'Quintile %{x}<br>Avg Return: %{y:.4%}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  yaxis: { tickformat: '.2%', gridcolor: '#334155', tickfont: { color: '#94a3b8' } },
  xaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155' }, height: 360 };
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
