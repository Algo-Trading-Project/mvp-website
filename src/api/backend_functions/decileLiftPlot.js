import { query } from './auroraClient.js';

function shiftDays(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    let { horizon = '1d', direction = 'long', windowDays = 30 } = await req.json();

    if (!['1d', '7d'].includes(horizon)) {
      return Response.json({ error: `Unsupported horizon ${horizon}` }, { status: 400 });
    }

    if (!['long', 'short'].includes(direction)) {
      return Response.json({ error: `Unsupported direction ${direction}` }, { status: 400 });
    }

    // Use the basic columns that should exist
    const retKey = horizon === '1d' ? 'forward_returns_1' : 'forward_returns_7';
    const predKey = horizon === '1d' ? 'y_pred_1d' : 'y_pred_7d';

    const maxDateRows = await query(`SELECT MAX(date) AS max_date FROM predictions`);
    const maxDate = maxDateRows?.[0]?.max_date ? String(maxDateRows[0].max_date).slice(0, 10) : null;

    if (!maxDate) {
      return Response.json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No predictions found.</body></html>', n: 0 });
    }

    const end = maxDate;
    const start = shiftDays(end, -(windowDays - 1));

    // Use prediction scores for decile ranking
    const rows = await query(
      `SELECT decile, AVG(ret) AS avg_return, COUNT(*) AS n
       FROM (
         SELECT ${retKey} AS ret, NTILE(10) OVER (ORDER BY ${predKey} ASC) AS decile
         FROM predictions
         WHERE date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE) 
           AND ${predKey} IS NOT NULL 
           AND ${retKey} IS NOT NULL
       ) t
       GROUP BY decile ORDER BY decile ASC`,
      { start, end }
    );

    if (!rows.length) {
      return Response.json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data in range.</body></html>', n: 0 });
    }

    const x = rows.map(r => Number(r.decile));
    const y = rows.map(r => Number(r.avg_return));

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div><script>
const data=[{type:'bar',x:${JSON.stringify(x)},y:${JSON.stringify(y)},marker:{color:'#60a5fa'},hovertemplate:'Avg Return: %{y:.2%}<br>Decile: %{x}<extra></extra>'}];
const layout={paper_bgcolor:'#0b1220',plot_bgcolor:'#0b1220',margin:{l:48,r:20,t:10,b:30},xaxis:{tickfont:{color:'#94a3b8'},gridcolor:'#334155',title:{text:'Prediction Score Decile',font:{color:'#94a3b8'}}},yaxis:{tickformat:'.2%',tickfont:{color:'#94a3b8'},gridcolor:'#334155',title:{text:'Average Realized Return',font:{color:'#94a3b8'}}}};
Plotly.newPlot('chart',data,layout,{responsive:true,displayModeBar:false,scrollZoom:false,staticPlot:true});
</script></body></html>`;

    return Response.json({ html, n: rows.reduce((s, r) => s + Number(r.n || 0), 0) });
  } catch (error) {
    console.error('decileLiftPlot error:', error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});
