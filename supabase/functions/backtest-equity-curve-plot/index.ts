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

    // Load strategy daily returns from daily_dashboard_metrics MV
    const pageSize = 1000; let fromIdx = 0; const cross: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('daily_dashboard_metrics')
        .select('date, cs_top_bottom_decile_spread_1d')
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
      const v = typeof (r as any).cs_top_bottom_decile_spread_1d === 'number'
        ? (r as any).cs_top_bottom_decile_spread_1d
        : Number((r as any).cs_top_bottom_decile_spread_1d ?? 0);
      if (d) { datesAll.push(d); retsAll.push(Number.isFinite(v) ? v : 0); }
    }

    // Returns are already shifted in Supabase. Use as-is, and optionally
    // downsample to weekly cadence when requested.
    const step = ndays;
    const datesS: string[] = [];
    const retsS: number[] = [];
    for (let i = 0; i < retsAll.length; i += step) { datesS.push(datesAll[i]); retsS.push(retsAll[i]); }

    // Apply fees per rebalance and compute equity curve
    const fee = Number(fees || 0);
    const retsNet: number[] = retsS.map((r) => (Number.isFinite(r) ? (r as number) : 0) - fee);
    const equity: number[] = []; let eq = 1;
    for (const r of retsNet) { const rr = Number.isFinite(r) ? r : 0; eq *= (1 + rr); equity.push(eq); }

    // Compute summary metrics for badges
    const mean = (arr:number[]) => arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0;
    const std = (arr:number[]) => {
      if (arr.length < 2) return 0;
      const m = mean(arr);
      const v = arr.reduce((s,x)=> s + (x-m)*(x-m), 0) / (arr.length - 1);
      return Math.sqrt(v);
    };
    const periodsPerYear = Math.max(1, Math.round(365 / (ndays || 1)));
    const totalReturn = equity.length ? (equity[equity.length-1] - 1) : 0;
    // Drawdowns
    let peak = -Infinity; const dds:number[] = [];
    for (const e of equity) { peak = Math.max(peak, e); dds.push(e/peak - 1); }
    const maxDrawdown = dds.length ? Math.min(...dds) : 0; // negative value
    const avgDrawdown = (()=>{ const neg = dds.filter((x)=> x < 0); return neg.length ? (neg.reduce((a,b)=>a+b,0)/neg.length) : 0;})();
    // CAGR
    const years = Math.max(1e-9, (datesS.length * ndays) / 365);
    const cagr = years > 0 && equity.length ? Math.pow(equity[equity.length-1], 1/years) - 1 : 0;
    // Ratios
    const m = mean(retsNet);
    const s = std(retsNet);
    const sharpe = s ? (m / s) * Math.sqrt(periodsPerYear) : 0;
    const downside = (()=>{ const neg = retsNet.filter((x)=> x < 0); if (!neg.length) return 0; const msq = mean(neg.map((x)=> x*x)); return Math.sqrt(msq); })();
    const sortino = downside ? (m / downside) * Math.sqrt(periodsPerYear) : 0;
    const calmar = maxDrawdown ? (cagr / Math.abs(maxDrawdown)) : 0;

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

    // BTC metrics (no fees applied)
    const btcTotalReturn = btcEquity.length ? (btcEquity[btcEquity.length-1] - 1) : 0;
    let btcPeak = -Infinity; const btcDDs:number[] = []; for (const e of btcEquity){ btcPeak=Math.max(btcPeak,e); btcDDs.push(e/btcPeak - 1);} 
    const btcMaxDrawdown = btcDDs.length ? Math.min(...btcDDs) : 0;
    const btcAvgDrawdown = (()=>{ const neg=btcDDs.filter(x=>x<0); return neg.length? (neg.reduce((a,b)=>a+b,0)/neg.length) : 0; })();
    const btcYears = Math.max(1e-9, (btcDatesS.length * ndays) / 365);
    const btcCagr = btcYears > 0 && btcEquity.length ? Math.pow(btcEquity[btcEquity.length-1], 1/btcYears) - 1 : 0;
    const bm = mean(btcRetS); const bs = std(btcRetS);
    const btcSharpe = bs ? (bm/bs) * Math.sqrt(periodsPerYear) : 0;
    const bDown = (()=>{ const neg=btcRetS.filter(x=>x<0); if (!neg.length) return 0; const msq=mean(neg.map(x=>x*x)); return Math.sqrt(msq); })();
    const btcSortino = bDown ? (bm/bDown) * Math.sqrt(periodsPerYear) : 0;
    const btcCalmar = btcMaxDrawdown ? (btcCagr / Math.abs(btcMaxDrawdown)) : 0;

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
  xaxis: { title: 'Date', type: 'date', range: ['${axisStart}', '${axisEnd}'], tickfont: { color: '#94a3b8' }, titlefont:{color:'#cbd5e1'}, gridcolor: '#334155' },
  yaxis: { title:'Equity', gridcolor: '#334155', tickfont: { color: '#94a3b8' }, titlefont:{color:'#cbd5e1'} },
  shapes: [{ type: 'line', x0: '${axisStart}', x1: '${axisEnd}', y0: 1, y1: 1, line: { color: '#ef4444', width: 1, dash: 'dot' } }],
  legend: { orientation: 'h', x: 0.02, y: 1.1, font: { color: '#cbd5e1' } },
  height: ${Number(height) || 380}
};
const config = { responsive: true, displayModeBar: false, scrollZoom: false };
Plotly.newPlot('chart', data, layout, config);
window.addEventListener('resize', () => Plotly.Plots.resize(document.getElementById('chart')));
</script></body></html>`;

    return json({ html, points: equity.length, params: { start, end, period, fees },
      series: {
        dates: datesS,
        returns: retsNet,
        equity,
        drawdowns: dds,
        btc_dates: btcDatesS,
        btc_equity: btcEquity,
        btc_drawdowns: btcDDs
      },
      metrics: { total_return: totalReturn, max_drawdown: maxDrawdown, avg_drawdown: avgDrawdown, cagr, sharpe, sortino, calmar, periods_per_year: periodsPerYear },
      btc_metrics: { total_return: btcTotalReturn, max_drawdown: btcMaxDrawdown, avg_drawdown: btcAvgDrawdown, cagr: btcCagr, sharpe: btcSharpe, sortino: btcSortino, calmar: btcCalmar }
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
