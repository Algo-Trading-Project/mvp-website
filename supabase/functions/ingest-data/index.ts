import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { query } from '../_shared/query.ts';
import { getUserFromRequest } from '../_shared/auth.ts';

function clampRange(start: string, end: string, maxDays = 120) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const msPerDay = 86_400_000;
  const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
  if (diffDays <= maxDays) return { start, end };
  const newStart = new Date(endDate.getTime() - (maxDays - 1) * msPerDay).toISOString().slice(0, 10);
  return { start: newStart, end };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    let { horizon = '1d', start, end, step = 0.05 } = await req.json();
    if (!start || !end) {
      return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
    }

    ({ start, end } = clampRange(start, end, 120));

    const stepSize = Number(step) && Number(step) > 0 ? Number(step) : 0.05;
    const probColumn = horizon === '7d' ? 'y_pred_proba_7d' : 'y_pred_proba_1d';
    const retColumn = horizon === '7d' ? 'forward_returns_7' : 'forward_returns_1';

    const rows = await query<{
      threshold: number;
      precision: number;
      recall: number;
    }>(
      `WITH base AS (
         SELECT 
           ${probColumn}::double precision AS proba,
           CASE WHEN ${retColumn}::double precision > 0 THEN 1 ELSE 0 END AS label
         FROM predictions
         WHERE date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE)
           AND ${probColumn} IS NOT NULL
           AND ${retColumn} IS NOT NULL
       ),
       thresholds AS (
         SELECT generate_series(0, 1, :step) AS threshold
       ),
       metrics AS (
         SELECT
           t.threshold,
           SUM(CASE WHEN b.proba >= t.threshold AND b.label = 1 THEN 1 ELSE 0 END) AS tp,
           SUM(CASE WHEN b.proba >= t.threshold AND b.label = 0 THEN 1 ELSE 0 END) AS fp,
           SUM(CASE WHEN b.proba < t.threshold AND b.label = 1 THEN 1 ELSE 0 END) AS fn
         FROM thresholds t
         CROSS JOIN base b
         GROUP BY t.threshold
       )
       SELECT
         threshold,
         CASE WHEN tp + fp > 0 THEN tp::double precision / (tp + fp) ELSE 1 END AS precision,
         CASE WHEN tp + fn > 0 THEN tp::double precision / (tp + fn) ELSE 0 END AS recall
       FROM metrics
       ORDER BY threshold`,
      { start, end, step: stepSize }
    );

    if (!rows.length) {
      return json({ html: emptyHtml('No data available for selected range.'), points: 0, start, end });
    }

    const html = buildHtml(rows.map((r) => r.recall), rows.map((r) => r.precision));

    const [{ points } = { points: 0 }] = await query<{ points: number }>(
      `SELECT COUNT(*)::bigint AS points
         FROM predictions
        WHERE date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE)
          AND ${probColumn} IS NOT NULL
          AND ${retColumn} IS NOT NULL`,
      { start, end }
    );

    return json({ html, points: Number(points ?? 0), start, end, step: stepSize });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});

function buildHtml(recalls: number[], precisions: number[]) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8" />
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ x: ${JSON.stringify(recalls)}, y: ${JSON.stringify(precisions)},
  type: 'scatter', mode: 'lines', line: { color: '#34d399', width: 2 },
  hovertemplate: 'Recall: %{x:.2f}<br>Precision: %{y:.2f}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  xaxis: { title: 'Recall', range: [0,1], tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  yaxis: { title: 'Precision', range: [0,1], tickfont: { color: '#94a3b8' }, gridcolor: '#334155' } };
const config = { responsive: true, displayModeBar: false, scrollZoom: true, doubleClick: 'reset' };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;
}

function emptyHtml(message: string) {
  return `<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">${message}</body></html>`;
}
