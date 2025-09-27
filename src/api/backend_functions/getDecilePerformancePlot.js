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

    let { horizon = '1d', direction = 'long', windowDays = 30, start, end } = await req.json();

    const retKey = horizon === '1d' ? 'forward_returns_1' : 'forward_returns_7';
    const predKey = horizon === '1d' ? 'y_pred_1d' : 'y_pred_7d';

    const maxDateRows = await query(`SELECT MAX(date) AS max_date FROM predictions`);
    const maxDate = maxDateRows?.[0]?.max_date ? String(maxDateRows[0].max_date).slice(0, 10) : null;

    if (!maxDate) {
      return Response.json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data.</body></html>', n: 0 });
    }

    const resolvedEnd = end || maxDate;
    const resolvedStart = start || shiftDays(resolvedEnd, -(windowDays - 1));

    const orderDirection = direction === 'short' ? 'ASC' : 'DESC';

    const rows = await query(
      `SELECT decile, AVG(ret) AS avg_return, COUNT(*) AS n FROM (
         SELECT 
           ${retKey} AS ret, 
           NTILE(10) OVER (PARTITION BY date ORDER BY ${predKey} ${orderDirection}) AS decile
         FROM predictions
         WHERE date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE) AND ${predKey} IS NOT NULL AND ${retKey} IS NOT NULL
       ) AS sub
       GROUP BY decile ORDER BY decile ASC`,
      { start: resolvedStart, end: resolvedEnd }
    );

    const x = rows.map(r => `Decile ${r.decile}`);
    const y = rows.map(r => Number(r.avg_return));

    const html = `<!DOCTYPE html><html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head><body><div id="chart"></div><script>
const data=[{type:'bar',x:${JSON.stringify(x)},y:${JSON.stringify(y)},marker:{color:'#8b5cf6'},hovertemplate:'Avg Return: %{y:.2%}<br>%{x}<extra></extra>'}];
const layout={paper_bgcolor:'#0b1220',plot_bgcolor:'#0b1220',margin:{l:48,r:20,t:20,b:40},xaxis:{tickfont:{color:'#94a3b8'},gridcolor:'#334155'},yaxis:{tickformat:'.2%',tickfont:{color:'#94a3b8'},gridcolor:'#334155',zeroline:true,zerolinecolor:'#475569'}};
Plotly.newPlot('chart',data,layout,{responsive:true,displayModeBar:false});</script></body></html>`;

    return Response.json({
      html,
      n: rows.reduce((acc, r) => acc + r.n, 0),
      range_start: resolvedStart,
      range_end: resolvedEnd
    });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});
