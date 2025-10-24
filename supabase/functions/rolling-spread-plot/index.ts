
import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const { start, end, width = null, height = 360, horizon = '1d' } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    const supabase = getServiceSupabaseClient();

    // Compute rolling spread in SQL via RPC (paged)
    const coerceNumber = (v: unknown): number | null => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const PAGE = 1000; let offset = 0; const merged: Array<Record<string, unknown>> = [];
    while (true) {
      const rpc = await supabase.rpc('rpc_rolling_spread', {
        start_date: start,
        end_date: end,
        window: 30,
        p_limit: PAGE,
        p_offset: offset,
        p_horizon: horizon === '3d' ? '3d' : '1d',
      });
      if (rpc.error) throw rpc.error;
      const chunk = (rpc.data ?? []) as Array<Record<string, unknown>>;
      if (chunk.length) merged.push(...chunk);
      if (chunk.length < PAGE) break;
      offset += PAGE;
    }

    const rows = (merged ?? []).map((r: Record<string, unknown>) => ({
      date: String(r.date ?? '').slice(0, 10),
      spread: coerceNumber(r['value']),
    })).filter((r) => r.date);

    const x = rows.map((r) => r.date);
    const y = rows.map((r) => (typeof r.spread === 'number' ? r.spread : null));

    const axisStart = String(start);
    const axisEnd = String(end);

    const html = `<!DOCTYPE html>
<html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ x: ${JSON.stringify(x)}, y: ${JSON.stringify(y)}, type: 'scatter', mode: 'lines', connectgaps: true, line: { color: '#22c55e', width: 2 }, hovertemplate: 'Date: %{x}<br>Spread (30d Avg): %{y:.2%}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  yaxis: { tickformat: '.2%', gridcolor: '#334155', tickfont: { color: '#94a3b8' } },
  xaxis: { type: 'date', range: ['${axisStart}', '${axisEnd}'], tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  dragmode: 'zoom', autosize: true,
  height: ${Number(height) || 360}
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
window.addEventListener('resize', () => Plotly.Plots.resize(el));
</script></body></html>`;

    // Compute latest + simple index-offset deltas within filtered series (skip nulls)
    const lastIndex = (() => {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (typeof rows[i]?.spread === 'number') return i;
      }
      return -1;
    })();
    const current = lastIndex >= 0 ? rows[lastIndex].spread as number : null;
    const currentDate = lastIndex >= 0 ? rows[lastIndex].date : null;
    const pickDelta = (offset: number) => {
      if (lastIndex < 0) return null;
      const j = lastIndex - offset;
      if (j >= 0 && typeof rows[j]?.spread === 'number' && typeof current === 'number') {
        return current - (rows[j].spread as number);
      }
      return null;
    };
    const summary = {
      last: current,
      last_date: currentDate,
      deltas: {
        d1: pickDelta(1),
        d7: pickDelta(7),
        d30: pickDelta(30),
      },
    } as const;

    const actualStart = rows.length ? rows[0].date : null;
    const actualEnd = rows.length ? rows[rows.length - 1].date : null;
    return json({
      html,
      points: rows.length,
      data: rows,
      summary,
      range: { requested: { start, end }, actual: { start: actualStart, end: actualEnd } },
      columns: ['date', 'spread'],
    });
  } catch (e) {
    return json({ error: e.message || String(e) }, { status: 500 });
  }
});
