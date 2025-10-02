import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const { start, end, minPoints = 30, topN = 20 } = await req.json();

    if (!start || !end) {
      return json({ error: 'start and end dates required' }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();

    // Try RPC first; fall back to computing Spearman IC in-function if RPC is unavailable
    let data: unknown[] | null = null;
    try {
      const rpc = await supabase.rpc('rpc_symbol_ic', {
        start_date: start,
        end_date: end,
        min_points: minPoints,
      });
      if (rpc.error) throw rpc.error;
      data = rpc.data as unknown[] | null;
    } catch (_rpcErr) {
      // Fallback: fetch raw predictions and compute per-symbol Spearman IC
      const { data: preds, error: predsErr } = await supabase
        .from('predictions')
        .select('date, symbol_id, y_pred, forward_returns_1')
        .gte('date', start)
        .lte('date', end);
      if (predsErr) throw predsErr;

      const bySymbol: Record<string, { pred: number; ret: number }[]> = {};
      for (const r of preds as any[]) {
        const sym = String(r.symbol_id ?? '').split('_')[0];
        const pred = typeof r.y_pred === 'number' ? r.y_pred : Number(r.y_pred);
        const ret = typeof r.forward_returns_1 === 'number' ? r.forward_returns_1 : Number(r.forward_returns_1);
        if (!sym || !Number.isFinite(pred) || !Number.isFinite(ret)) continue;
        (bySymbol[sym] ||= []).push({ pred, ret });
      }

      const rank = (arr: number[]) => {
        const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
        const ranks = new Array(arr.length);
        for (let r = 0; r < indexed.length; r++) ranks[indexed[r].i] = r / (indexed.length - 1 || 1);
        return ranks;
      };
      const pearson = (a: number[], b: number[]) => {
        const n = Math.min(a.length, b.length);
        if (n < 2) return null;
        const ma = a.reduce((s, v) => s + v, 0) / n;
        const mb = b.reduce((s, v) => s + v, 0) / n;
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < n; i++) {
          const xa = a[i] - ma;
          const xb = b[i] - mb;
          num += xa * xb;
          da += xa * xa;
          db += xb * xb;
        }
        const den = Math.sqrt(da * db);
        return den === 0 ? null : num / den;
      };

      const rows: any[] = [];
      for (const [sym, pairs] of Object.entries(bySymbol)) {
        if ((pairs?.length ?? 0) < minPoints) continue;
        const predsArr = pairs.map(p => p.pred);
        const retsArr = pairs.map(p => p.ret);
        const rp = rank(predsArr);
        const rr = rank(retsArr);
        const ic = pearson(rp, rr);
        if (ic === null || Number.isNaN(ic)) continue;
        rows.push({ symbol: sym, spearman_ic: ic, observation_count: pairs.length });
      }
      data = rows;
    }

    const coerceNumber = (value: unknown) => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string') {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };

    const symbols = (data ?? [])
      .map((row: Record<string, unknown>) => ({
        symbol: String(row.symbol ?? ''),
        spearman_ic: coerceNumber(row.spearman_ic),
        observation_count:
          typeof row.observation_count === 'number'
            ? Math.trunc(row.observation_count)
            : Number(row.observation_count ?? 0) || 0,
      }))
      .filter((row) => row.symbol);

    if (!symbols.length) {
      const empty = '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data available for IC calculation.</body></html>';
      return json({ html_top: empty, html_bottom: empty });
    }

    const valid = symbols.filter((row) => typeof row.spearman_ic === 'number' && Number.isFinite(row.spearman_ic));

    if (!valid.length) {
      const empty = '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No valid IC values available.</body></html>';
      return json({ html_top: empty, html_bottom: empty });
    }

    const sorted = [...valid].sort((a, b) => (b.spearman_ic as number) - (a.spearman_ic as number));
    const topRows = sorted.slice(0, topN);
    // For bottom chart, also sort greatest→least (i.e., less negative to more negative)
    const bottomRows = [...sorted.slice(-topN)].sort(
      (a, b) => (b.spearman_ic as number) - (a.spearman_ic as number)
    );

    const makePlot = (rows: typeof symbols, title: string, color: string) => {
      const x = rows.map((r) => r.symbol);
      const y = rows.map((r) => r.spearman_ic);
      const counts = rows.map((r) => r.observation_count);
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const x = ${JSON.stringify(x)};
const y = ${JSON.stringify(y)};
const counts = ${JSON.stringify(counts)};
const data = [{ type: 'bar', x, y, marker: { color: '${color}' }, hovertemplate: 'IC: %{y:.3f}<br>Observations: %{customdata}<br>Symbol: %{x}<extra></extra>', customdata: counts }];
const layout = {
  title: { text: '${title}', font: { color: '#e2e8f0', size: 14 }, x: 0.5 },
  paper_bgcolor: '#0b1220',
  plot_bgcolor: '#0b1220',
  margin: { l: 48, r: 20, t: 40, b: 80 },
  xaxis: { fixedrange:true, tickfont: { color: '#94a3b8' }, gridcolor: '#334155', tickangle: -45, categoryorder: 'array', categoryarray: ${JSON.stringify(x)} },
  yaxis: { fixedrange:true, tickformat: '.3f', tickfont: { color: '#94a3b8' }, gridcolor: '#334155', zeroline: true, zerolinecolor: '#475569' }
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false};
const el = document.getElementById('chart');
Plotly.newPlot(el, data, layout, config);
</script></body></html>`;
    };

    return json({
      html_top: makePlot(topRows, 'Top Tokens by IC', '#10b981'),
      html_bottom: makePlot(bottomRows, 'Bottom Tokens by IC', '#ef4444'),
      summary: {
        min_points: minPoints,
        top: topRows,
        bottom: bottomRows,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
