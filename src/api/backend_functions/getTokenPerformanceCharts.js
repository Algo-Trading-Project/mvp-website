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

    let {
      horizon = '1d',
      direction = 'long',
      windowDays = 30,
      minObs = 5,
      topN = 20,
      start,
      end,
    } = await req.json();

    if (!['1d', '7d'].includes(horizon)) {
      return Response.json({ error: `Unsupported horizon ${horizon}` }, { status: 400 });
    }

    if (!['long', 'short'].includes(direction)) {
      return Response.json({ error: `Unsupported direction ${direction}` }, { status: 400 });
    }

    const retKey = horizon === '1d' ? 'forward_returns_1' : 'forward_returns_7';
    const predKey = horizon === '1d' ? 'y_pred_1d' : 'y_pred_7d';

    const maxDateRows = await query(`SELECT MAX(date) AS max_date FROM predictions`);
    const maxDate = maxDateRows?.[0]?.max_date ? String(maxDateRows[0].max_date).slice(0, 10) : null;

    if (!maxDate) {
      const emptyHtml = '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data available.</body></html>';
      return Response.json({ html_top: emptyHtml, html_bottom: emptyHtml, count: 0 });
    }

    const resolvedEnd = end || maxDate;
    const resolvedStart = start || shiftDays(resolvedEnd, -(windowDays - 1));

    let directionPredicate = 'TRUE';
    if (direction === 'long') directionPredicate = `${predKey} > 0`;
    if (direction === 'short') directionPredicate = `${predKey} < 0`;

    const baseQuery = `
      SELECT 
        split_part(symbol_id, '_', 1) AS symbol,
        AVG(CAST(${retKey} AS DOUBLE PRECISION)) AS avg_expectancy,
        COUNT(*) AS observation_count
      FROM predictions
      WHERE date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE)
        AND ${predKey} IS NOT NULL AND ${retKey} IS NOT NULL
        AND ${directionPredicate}
      GROUP BY split_part(symbol_id, '_', 1)
      HAVING COUNT(*) >= :minObs
    `;

    const params = { start: resolvedStart, end: resolvedEnd, minObs, topN };
    const topRows = await query(`${baseQuery} ORDER BY avg_expectancy DESC LIMIT :topN`, params);
    const bottomRowsAsc = await query(`${baseQuery} ORDER BY avg_expectancy ASC LIMIT :topN`, params);
    const bottomRows = [...bottomRowsAsc].reverse();

    const horizonLabel = horizon === '1d' ? '1-Day' : '7-Day';
    const directionLabel = ` (${direction === 'long' ? 'Long' : 'Short'} signals)`;

    const makePlot = (rows, title, color) => {
      const x = rows.map(r => r.symbol);
      const y = rows.map(r => Number(r.avg_expectancy));
      return `<!DOCTYPE html><html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head><body><div id="chart"></div><script>
const data=[{type:'bar',x:${JSON.stringify(x)},y:${JSON.stringify(y)},marker:{color:'${color}'},hovertemplate:'Expectancy: %{y:.2%}<br>Symbol: %{x}<extra></extra>'}];
const layout={title:{text:${JSON.stringify(`${title} (${horizonLabel})${directionLabel}`)},font:{color:'#e2e8f0',size:14},x:0.5},paper_bgcolor:'#0b1220',plot_bgcolor:'#0b1220',margin:{l:48,r:20,t:40,b:80},xaxis:{tickfont:{color:'#94a3b8'},gridcolor:'#334155',tickangle:-45},yaxis:{tickformat:'.2%',tickfont:{color:'#94a3b8'},gridcolor:'#334155',zeroline:true,zerolinecolor:'#475569'}};
Plotly.newPlot('chart',data,layout,{responsive:true,displayModeBar:false,scrollZoom:false,staticPlot:true});</script></body></html>`;
    };

    return Response.json({
      html_top: makePlot(topRows, `Top 20 Tokens by Expectancy`, '#10b981'),
      html_bottom: makePlot(bottomRows, `Bottom 20 Tokens by Expectancy`, '#ef4444'),
      count: topRows.length + bottomRows.length,
      range_start: resolvedStart,
      range_end: resolvedEnd
    });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});
