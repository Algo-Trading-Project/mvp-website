import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

type Row = { date: string; rate: number | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const body = await req.json().catch(() => ({}));
    const start: string | undefined = body?.start;
    const end: string | undefined = body?.end;
    const windowSize: number = Number(body?.window ?? 30); // Kept for compatibility; data is precomputed at 30d
    const height = Number(body?.height ?? 360);

    if (!start || !end) {
      return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();

    // Directly query precomputed rolling 30d hit rate; page through results
    const pageSize = 1000;
    let fromIdx = 0;
    const tbl: Array<Record<string, unknown>> = [];
    while (true) {
      const { data, error } = await supabase
        .from('cross_sectional_metrics_1d')
        .select('date, rolling_30d_hit_rate')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
        .range(fromIdx, fromIdx + pageSize - 1);
      if (error) throw error;
      if (data && data.length) tbl.push(...data as Array<Record<string, unknown>>);
      if (!data || data.length < pageSize) break;
      fromIdx += pageSize;
    }

    const coerceNumber = (v: unknown): number | null => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const rows: Row[] = (tbl ?? [])
      .map((r: Record<string, unknown>) => ({
        date: String(r.date ?? '').slice(0, 10),
        rate: coerceNumber(r['rolling_30d_hit_rate']),
      }))
      .filter((r) => r.date && r.rate !== null && r.rate !== 0);

    const x = rows.map((r) => r.date);
    const y = rows.map((r) => (typeof r.rate === 'number' ? r.rate : null));

    const axisStart = rows.length ? rows[0].date : String(start);
    const axisEnd = rows.length ? rows[rows.length - 1].date : String(end);

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
  xaxis: { type: 'date', range: ['${axisStart}', '${axisEnd}'], tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  dragmode: 'zoom', autosize: true, height: ${height}
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
window.addEventListener('resize', () => Plotly.Plots.resize(el));
</script></body></html>`;

    // Build summary deltas similar to other rolling plots
    const lastIndex = (() => {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (typeof rows[i]?.rate === 'number') return i;
      }
      return -1;
    })();
    const current = lastIndex >= 0 ? (rows[lastIndex].rate as number) : null;
    const currentDate = lastIndex >= 0 ? rows[lastIndex].date : null;
    const pickDelta = (offset: number) => {
      if (lastIndex < 0) return null;
      const j = lastIndex - offset;
      if (j >= 0 && typeof rows[j]?.rate === 'number' && typeof current === 'number') {
        return current - (rows[j].rate as number);
      }
      return null;
    };
    const summary = {
      last: current,
      last_date: currentDate,
      deltas: { d1: pickDelta(1), d7: pickDelta(7), d30: pickDelta(30) }
    } as const;

    return json({ html, points: rows.length, window: windowSize, data: rows, summary });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
