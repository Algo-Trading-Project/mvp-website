import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { RDSDataClient, ExecuteStatementCommand } from 'npm:@aws-sdk/client-rds-data@3.637.0';

// --- Inlined Aurora Client ---
const client = new RDSDataClient({
  region: Deno.env.get('AURORA_REGION') || Deno.env.get('AWS_REGION'),
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || '',
  },
});

const BASE = {
  resourceArn: Deno.env.get('AURORA_CLUSTER_ARN'),
  secretArn: Deno.env.get('AURORA_SECRET_ARN'),
  database: Deno.env.get('AURORA_DB_NAME') || Deno.env.get('AURORA_DB'),
};

function toParam(name, value) {
  if (value === null || value === undefined) return { name, value: { isNull: true } };
  if (typeof value === 'number' && Math.floor(value) === value) return { name, value: { longValue: value } };
  if (typeof value === 'number') return { name, value: { doubleValue: value } };
  if (typeof value === 'boolean') return { name, value: { booleanValue: value } };
  return { name, value: { stringValue: String(value) } };
}

function cellValue(cell) {
  if (!cell) return null;
  if ('stringValue' in cell) return cell.stringValue;
  if ('longValue' in cell) return cell.longValue;
  if ('doubleValue' in cell) return cell.doubleValue;
  if ('booleanValue' in cell) return cell.booleanValue;
  if ('isNull' in cell && cell.isNull) return null;
  return null;
}

function rowsToObjects(records = [], meta = []) {
  return (records || []).map((row) => {
    const obj = {};
    row.forEach((cell, i) => {
      const colName = meta && meta[i] && meta[i].name ? meta[i].name : `col_${i}`;
      obj[colName] = cellValue(cell);
    });
    return obj;
  });
}

async function query(sql, params = {}) {
  const parameters = Object.keys(params).map((k) => toParam(k, params[k]));
  const res = await client.send(new ExecuteStatementCommand({
    ...BASE,
    sql,
    parameters,
    includeResultMetadata: true
  }));
  return rowsToObjects(res.records || [], res.columnMetadata || []);
}

function clampRange(start, end, maxDays = 120) {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const ms = 86400000;
  const diff = Math.floor((e - s) / ms) + 1;
  if (diff <= maxDays) return { start, end };
  const newStart = new Date(e.getTime() - (maxDays - 1) * ms).toISOString().slice(0, 10);
  return { start: newStart, end };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    let { horizon = '1d', start, end, width = 980, height = 360, step = 0.05 } = await req.json();
    if (!start || !end) return Response.json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    ({ start, end } = clampRange(start, end, 120));

    const probKey = horizon === '1d' ? 'y_pred_proba_1d' : 'y_pred_proba_7d';
    const retKey = horizon === '1d' ? 'forward_returns_1' : 'forward_returns_7';

    const pageSize = 100000;
    let allPoints = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const pageRows = await query(
        `SELECT ${probKey} AS p, 
                CASE WHEN ${retKey} > 0 THEN 1 ELSE 0 END AS y
         FROM predictions
         WHERE date BETWEEN CAST(:s AS DATE) AND CAST(:e AS DATE)
           AND ${probKey} IS NOT NULL
           AND ${retKey} IS NOT NULL
         LIMIT :pageSize OFFSET :offset`,
        { s: start, e: end, pageSize, offset }
      );

      if (pageRows.length === 0) {
        hasMore = false;
      } else {
        const pagePoints = pageRows
          .filter(r => typeof r.p === 'number' && typeof r.y === 'number')
          .map(r => ({ p: Number(r.p), y: Number(r.y) }));
        allPoints = allPoints.concat(pagePoints);
        offset += pageSize;
        if (pageRows.length < pageSize) {
          hasMore = false;
        }
      }
    }

    const prData = [];
    for (let t = 0; t <= 1.000001; t += step) {
      let tp = 0, fp = 0, fn = 0;
      for (const { p, y } of allPoints) {
        const pred = p >= t ? 1 : 0;
        if (pred === 1 && y === 1) tp++;
        else if (pred === 1 && y === 0) fp++;
        else if (pred === 0 && y === 1) fn++;
      }
      const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      prData.push({ precision, recall });
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8" />
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const data = [{ x: ${JSON.stringify(prData.map(d => d.recall))}, y: ${JSON.stringify(prData.map(d => d.precision))},
  type: 'scatter', mode: 'lines', line: { color: '#34d399', width: 2 },
  hovertemplate: 'Recall: %{x:.2f}<br>Precision: %{y:.2f}<extra></extra>' }];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  xaxis: { title: 'Recall', range: [0,1], tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  yaxis: { title: 'Precision', range: [0,1], tickfont: { color: '#94a3b8' }, gridcolor: '#334155' } };
const config = { responsive: true, displayModeBar: false, scrollZoom: false, staticPlot: true };
const el = document.getElementById('chart'); el.style.width='${width}px'; el.style.height='${height}px';
Plotly.newPlot(el, data, layout, config).then(()=>{ el.style.width='100%'; el.style.height='100%'; Plotly.Plots.resize(el); window.addEventListener('resize', ()=>Plotly.Plots.resize(el)); });
</script></body></html>`;

    return Response.json({ html, points: allPoints.length, start, end });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
});
