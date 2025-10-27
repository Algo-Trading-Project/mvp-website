import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, { status: 405 });
    const { start, end, fees = 0.003, height = 380, horizon = '1d', top_pct = 0.1, series_page_size = 0 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    const supabase = getServiceSupabaseClient();

    // Load the full input in one logical pass.
    // Instead of splitting the date range (which resets compounding),
    // page through the underlying table and compute the equity curve here.
    const pct = Number(top_pct) === 0.05 ? 0.05 : 0.1;
    const hzn = String(horizon) === '3d' ? '3d' : '1d';

    // Select the spread column based on horizon/top_pct
    const spreadField = hzn === '3d'
      ? (pct === 0.05 ? 'cs_top_bottom_p05_spread_3d' : 'cs_top_bottom_decile_spread_3d')
      : (pct === 0.05 ? 'cs_top_bottom_p05_spread_1d' : 'cs_top_bottom_decile_spread_1d');

    const pageSize = 1000;
    let from = 0;
    const datesAll: string[] = [];
    const returnsAll: number[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('daily_dashboard_metrics')
        .select(`date, ${spreadField}`)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      if (!rows.length) break;
      for (const r of rows) {
        const d = String(r.date ?? '').slice(0, 10);
        let v = (r as any)[spreadField];
        if (typeof v !== 'number') v = Number(v ?? 0);
        if (!Number.isFinite(v)) v = 0;
        // subtract daily fee
        v = (v as number) - Number(fees || 0);
        datesAll.push(d);
        returnsAll.push(v);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    // We will compound after sampling (to avoid overlapping windows for 3d)

    if (!datesAll.length) {
      return json({ html: '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data available for the selected range.</body></html>' });
    }

    // Per-period returns
    const retsAll: number[] = returnsAll;

    // Match cadence to model horizon (1d or 3d only)
    const ndays = hzn === '3d' ? 3 : 1;
    const step = ndays;
    const datesS: string[] = [];
    const retsS: number[] = [];
    for (let i = 0; i < retsAll.length; i += step) {
      datesS.push(datesAll[i]);
      retsS.push(retsAll[i]);
    }

    // Apply fees already included; compute equity curve for sampled cadence
    const retsNet: number[] = retsS.map((r) => (Number.isFinite(r) ? (r as number) : 0));
    const equity: number[] = [];
    let eqS = 1; for (const r of retsNet) { eqS *= (1 + (typeof r === 'number' ? r : 0)); equity.push(eqS); }

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
    let fromIdx = 0; const btc: any[] = [];
    const btcPage = 1000;
    while (true) {
      const selectCols = (hzn === '3d')
        ? 'date, forward_returns_3, symbol_id'
        : 'date, forward_returns_1, symbol_id';
      const { data, error } = await supabase
        .from('predictions')
        .select(selectCols)
        .eq('symbol_id', 'BTC_USDT_BINANCE')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true })
        .range(fromIdx, fromIdx + btcPage - 1);
      if (error) throw error;
      if (data?.length) btc.push(...data);
      if (!data || data.length < btcPage) break;
      fromIdx += btcPage;
    }

    const btcDates: string[] = []; const btcRet: number[] = [];
    for (const r of btc) {
      const d = String(r.date ?? '').slice(0,10);
      let v = (hzn === '3d')
        ? (typeof (r as any).forward_returns_3 === 'number' ? (r as any).forward_returns_3 : Number((r as any).forward_returns_3 ?? 0))
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

    // Build resolved SQL string reflecting actual fields used
    const field = hzn === '3d'
      ? (pct === 0.05 ? 'cs_top_bottom_p05_spread_3d' : 'cs_top_bottom_decile_spread_3d')
      : (pct === 0.05 ? 'cs_top_bottom_p05_spread_1d' : 'cs_top_bottom_decile_spread_1d');
    const resolvedSql = `with base as (
  select d.date,
         (d.${field} - ${Number(fees || 0)}) as daily_return
  from daily_dashboard_metrics d
  where d.date between '${start}' and '${end}'
  order by d.date
), rn_base as (
  select date, daily_return, row_number() over (order by date) as rn
  from base
), sampled as (
  select date, daily_return
  from rn_base
  where ${hzn === '3d' ? '(rn % 3) = 1' : 'true'}
  order by date
)
select date,
       exp(sum(ln(1 + greatest(-0.999999, coalesce(daily_return,0)))) over (
         order by date rows between unbounded preceding and current row
       )) - 1 as equity
from sampled
order by date;`;

    // Optional: paginate large series in the response (client can ignore)
    const pageSizeOut = Number(series_page_size) || 0;
    const seriesPages = pageSizeOut > 0 ? (() => {
      const pages: any[] = [];
      for (let i = 0; i < datesS.length; i += pageSizeOut) {
        pages.push({
          index: Math.floor(i / pageSizeOut),
          dates: datesS.slice(i, i + pageSizeOut),
          returns: retsNet.slice(i, i + pageSizeOut),
          equity: equity.slice(i, i + pageSizeOut),
          drawdowns: dds.slice(i, i + pageSizeOut),
        });
      }
      return { page_size: pageSizeOut, page_count: pages.length, pages };
    })() : null;

    return json({ html, points: equity.length, params: { start, end, fees, horizon: hzn, top_pct: pct }, sql: resolvedSql,
      series: {
        dates: datesS,
        returns: retsNet,
        equity,
        drawdowns: dds,
        btc_dates: btcDatesS,
        btc_equity: btcEquity,
        btc_drawdowns: btcDDs
      },
      series_pages: seriesPages,
      metrics: { total_return: totalReturn, max_drawdown: maxDrawdown, avg_drawdown: avgDrawdown, cagr, sharpe, sortino, calmar, periods_per_year: periodsPerYear },
      btc_metrics: { total_return: btcTotalReturn, max_drawdown: btcMaxDrawdown, avg_drawdown: btcAvgDrawdown, cagr: btcCagr, sharpe: btcSharpe, sortino: btcSortino, calmar: btcCalmar }
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
