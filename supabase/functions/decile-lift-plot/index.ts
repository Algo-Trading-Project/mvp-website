import { query } from '../_shared/query.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

function shiftDays(dateStr: string, delta: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
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

    const { horizon = '1d', direction = 'long', windowDays = 30 } = await req.json();

    const retColumn = horizon === '7d' ? 'forward_returns_7' : 'forward_returns_1';
    const predColumn = horizon === '7d' ? 'y_pred_7d' : 'y_pred_1d';

    const [{ max_date } = { max_date: null }] = await query<{ max_date: string | null }>(
      'SELECT MAX(date)::date AS max_date FROM predictions'
    );

    if (!max_date) {
      return json({ html: emptyHtml('No predictions found.'), n: 0 });
    }

    const end = String(max_date);
    const start = shiftDays(end, -(Math.max(1, Number(windowDays)) - 1));
    const multiplier = direction === 'short' ? -1 : 1;

    const rows = await query<{ decile: number; avg_return: number; n: number }>(
      `SELECT decile, AVG(ret) AS avg_return, COUNT(*) AS n
         FROM (
           SELECT 
             ${retColumn}::double precision AS ret,
             NTILE(10) OVER (
               ORDER BY (${predColumn}::double precision) * :multiplier
             ) AS decile
           FROM predictions
           WHERE date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE)
             AND ${predColumn} IS NOT NULL
             AND ${retColumn} IS NOT NULL
         ) ranked
       GROUP BY decile
       ORDER BY decile`,
      { start, end, multiplier }
    );

    if (!rows.length) {
      return json({ html: emptyHtml('No data in range.'), n: 0 });
    }

    const x = rows.map((r) => Number(r.decile));
    const y = rows.map((r) => Number(r.avg_return));
    const total = rows.reduce((sum, r) => sum + Number(r.n ?? 0), 0);

    return json({ html: buildHtml(x, y), n: total, start, end });
  } catch (error) {
    console.error('decileLiftPlot error:', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});

function emptyHtml(message: string) {
  return `<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">${message}</body></html>`;
}

function buildHtml(x: number[], y: number[]) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div><script>
const data=[{type:'bar',x:${JSON.stringify(x)},y:${JSON.stringify(y)},marker:{color:'#60a5fa'},hovertemplate:'Avg Return: %{y:.2%}<br>Decile: %{x}<extra></extra>'}];
const layout={paper_bgcolor:'#0b1220',plot_bgcolor:'#0b1220',margin:{l:48,r:20,t:10,b:30},xaxis:{tickfont:{color:'#94a3b8'},gridcolor:'#334155',title:{text:'Prediction Score Decile',font:{color:'#94a3b8'}}},yaxis:{tickformat:'.2%',tickfont:{color:'#94a3b8'},gridcolor:'#334155',title:{text:'Average Realized Return',font:{color:'#94a3b8'}}}};
Plotly.newPlot('chart',data,layout,{responsive:true,displayModeBar:false,scrollZoom:true});
</script></body></html>`;
}
