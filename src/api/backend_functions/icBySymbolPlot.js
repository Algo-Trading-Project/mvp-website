
import { query } from './auroraClient.js';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    const { horizon = '1d', start, end, minPoints = 10, topN = 20, width = 980, height = 420 } = await req.json();

    if (!start || !end) {
      return Response.json({ error: 'start and end dates required' }, { status: 400 });
    }

    if (!['1d', '7d'].includes(horizon)) {
      return Response.json({ error: `Unsupported horizon ${horizon}` }, { status: 400 });
    }

    const predField = horizon === '1d' ? 'y_pred_1d' : 'y_pred_7d';
    const retField = horizon === '1d' ? 'forward_returns_1' : 'forward_returns_7';

    const baseQuery = `
      WITH ranked_data AS (
         SELECT 
           SUBSTRING(symbol_id, 1, POSITION('_' IN symbol_id) - 1) AS symbol,
           RANK() OVER (PARTITION BY date, SUBSTRING(symbol_id, 1, POSITION('_' IN symbol_id) - 1) ORDER BY ${predField}) AS pred_rank,
           RANK() OVER (PARTITION BY date, SUBSTRING(symbol_id, 1, POSITION('_' IN symbol_id) - 1) ORDER BY ${retField}) AS ret_rank
         FROM predictions
         WHERE date BETWEEN CAST(:start AS DATE) AND CAST(:end AS DATE)
           AND ${predField} IS NOT NULL 
           AND ${retField} IS NOT NULL
      ),
      daily_ic AS (
        SELECT 
          date,
          corr(pred_rank, ret_rank) as daily_spearman_ic
        FROM ranked_data
        GROUP BY date
      ),
      symbol_ic AS (
        SELECT 
         rd.symbol,
         corr(rd.pred_rank, rd.ret_rank) AS spearman_ic,
         COUNT(rd.symbol) AS observation_count
       FROM ranked_data rd
       GROUP BY rd.symbol
       HAVING COUNT(rd.symbol) >= :minPoints
      )
    `;
    
    // The user provided query was wrong. a partition by date needs to be included in the rank functions
    // This has been corrected.

    const topRows = await query(
        `${baseQuery} SELECT * FROM symbol_ic ORDER BY spearman_ic DESC LIMIT :topN`,
        { start, end, minPoints, topN }
    );
    
    const bottomRows = await query(
        `${baseQuery} SELECT * FROM symbol_ic ORDER BY spearman_ic ASC LIMIT :topN`,
        { start, end, minPoints, topN }
    );
    
    bottomRows.reverse();

    if (!topRows.length && !bottomRows.length) {
      return Response.json({ 
        html_top: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data available for IC calculation.</body></html>',
        html_bottom: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data available for IC calculation.</body></html>'
      });
    }
    
    const horizonLabel = horizon === '1d' ? '1-Day' : '7-Day';
    const makePlot = (rows, title, color) => {
        const x = rows.map(r => r.symbol);
        const y = rows.map(r => r.spearman_ic);
        const colors = y.map(() => color);
        return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const x = ${JSON.stringify(x)};
const y = ${JSON.stringify(y)};
const colors = ${JSON.stringify(colors)};
const data = [{ type: 'bar', x, y, marker: { color: colors }, hovertemplate: 'IC: %{y:.3f}<br>Symbol: %{x}<extra></extra>' }];
const layout = { 
  title: { text: '${title} (${horizonLabel})', font: { color: '#e2e8f0', size: 14 }, x: 0.5 },
  paper_bgcolor: '#0b1220', 
  plot_bgcolor: '#0b1220', 
  margin: { l: 48, r: 20, t: 40, b: 80 },
  xaxis: { tickfont: { color: '#94a3b8' }, gridcolor: '#334155', tickangle: -45 }, 
  yaxis: { tickformat: '.3f', tickfont: { color: '#94a3b8' }, gridcolor: '#334155', zeroline: true, zerolinecolor: '#475569' } 
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false, staticPlot: true };
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;
    }

    return Response.json({ 
      html_top: makePlot(topRows, 'Top 20 Tokens by IC', '#10b981'), 
      html_bottom: makePlot(bottomRows, 'Bottom 20 Tokens by IC', '#ef4444'),
    });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});
