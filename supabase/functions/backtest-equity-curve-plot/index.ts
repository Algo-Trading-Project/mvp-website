import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, { status: 405 });
    const { start, end, fees = 0.003, period = '1d', height = 380 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    const supabase = getServiceSupabaseClient();

    // Load strategy daily returns from precomputed cross_sectional_metrics_1d
    const pageSize = 1000; let fromIdx = 0; const cross: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('cross_sectional_metrics_1d')
        .select('date, cs_top_bottom_decile_spread')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
        .range(fromIdx, fromIdx + pageSize - 1);
      if (error) throw error;
      if (data?.length) cross.push(...data);
      if (!data || data.length < pageSize) break;
      fromIdx += pageSize;
    }

    // Use series as stored in Supabase (already shifted for point-in-time correctness)
    const ndays = String(period) === '7d' ? 7 : 1;
    const datesAll: string[] = [];
    const retsAll: number[] = [];
    for (const r of cross) {
      const d = String(r.date ?? '').slice(0,10);
      const v = typeof (r as any).cs_top_bottom_decile_spread === 'number'
        ? (r as any).cs_top_bottom_decile_spread
        : Number((r as any).cs_top_bottom_decile_spread ?? 0);
      if (d) { datesAll.push(d); retsAll.push(Number.isFinite(v) ? v : 0); }
    }

    // Returns are already shifted in Supabase. Use as-is, and optionally
    // downsample to weekly cadence when requested.
    const step = ndays;
    const datesS: string[] = [];
    const retsS: number[] = [];
    for (let i = 0; i < retsAll.length; i += step) { datesS.push(datesAll[i]); retsS.push(retsAll[i]); }

    // Apply fees per rebalance
    const fee = Number(fees || 0);
    const retsNet: number[] = retsS.map((r) => r - fee);

    // Compute equity curve (treat any NaNs as 0 return)
    const equity: number[] = []; let eq = 1;
    for (const r of retsNet) { const rr = Number.isFinite(r) ? r : 0; eq *= (1 + rr); equity.push(eq); }

    // BTC comparison using predictions table
    fromIdx = 0; const btc: any[] = [];
    while (true) {
      const selectCols = (ndays === 7)
        ? 'date, forward_returns_7, symbol_id'
        : 'date, forward_returns_1, symbol_id';
      const { data, error } = await supabase
        .from('predictions')
        .select(selectCols)
        .eq('symbol_id', 'BTC_USDT_BINANCE')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
        .range(fromIdx, fromIdx + pageSize - 1);
      if (error) throw error;
      if (data?.length) btc.push(...data);
      if (!data || data.length < pageSize) break;
      fromIdx += pageSize;
    }

    const btcDates: string[] = []; const btcRet: number[] = [];
    for (const r of btc) {
      const d = String(r.date ?? '').slice(0,10);
      let v = (ndays === 7)
        ? (typeof (r as any).forward_returns_7 === 'number' ? (r as any).forward_returns_7 : Number((r as any).forward_returns_7 ?? 0))
        : (typeof (r as any).forward_returns_1 === 'number' ? (r as any).forward_returns_1 : Number((r as any).forward_returns_1 ?? 0));
      if (typeof v !== 'number') { const n = Number(v); v = Number.isFinite(n) ? n : 0; }
      btcDates.push(d); btcRet.push(v);
    }
    // Returns already shifted; just downsample to same cadence
    const btcDatesS: string[] = []; const btcRetS: number[] = [];
    for (let i = 0; i < btcDates.length; i += step) { btcDatesS.push(btcDates[i]); btcRetS.push(btcRet[i]); }
    const btcEquity: number[] = []; let beq = 1; for (const r of btcRetS) { beq *= (1 + (typeof r === 'number' ? r : 0)); btcEquity.push(beq); }

    const axisStart = datesS.length ? datesS[0] : String(start);
    const axisEnd = datesS.length ? datesS[datesS.length-1] : String(end);

    const html = `<!DOCTYPE html>
<html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div>
<script>
const x1 = ${JSON.stringify(datesS)}; const y1 = ${JSON.stringify(equity)};
const x2 = ${JSON.stringify(btcDatesS)}; const y2 = ${JSON.stringify(btcEquity)};
const data = [
  { x: x1, y: y1, type: 'scatter', mode: 'lines', name: 'Strategy Equity', line: { color: '#60a5fa', width: 2 }, hovertemplate: '%{x}<br>%{y:.2f}<extra></extra>' },
  { x: x2, y: y2, type: 'scatter', mode: 'lines', name: 'BTC Equity Curve', line: { color: '#ef4444', width: 2 }, hovertemplate: '%{x}<br>%{y:.2f}<extra></extra>' }
];
const layout = { paper_bgcolor: '#0b1220', plot_bgcolor: '#0b1220', margin: { l: 48, r: 20, t: 10, b: 30 },
  xaxis: { type: 'date', range: ['${axisStart}', '${axisEnd}'], tickfont: { color: '#94a3b8' }, gridcolor: '#334155' },
  yaxis: { gridcolor: '#334155', tickfont: { color: '#94a3b8' } },
  shapes: [{ type: 'line', x0: '${axisStart}', x1: '${axisEnd}', y0: 1, y1: 1, line: { color: '#ef4444', width: 1, dash: 'dot' } }],
  legend: { orientation: 'h', x: 0.02, y: 1.1, font: { color: '#cbd5e1' } },
  height: ${Number(height) || 380}
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false };
Plotly.newPlot('chart', data, layout, config);
window.addEventListener('resize', () => Plotly.Plots.resize(document.getElementById('chart')));
</script></body></html>`;

    return json({ html, points: equity.length, params: { start, end, period, fees } });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
