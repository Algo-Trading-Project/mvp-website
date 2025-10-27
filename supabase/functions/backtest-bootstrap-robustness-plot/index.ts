import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

// Robustness: bootstrap full equity curves and compute metric histograms
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, { status: 405 });
    const { start, end, iterations = 10000, fees = 0.003, period = '1d', height = 900, bins = 50 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    const supabase = getServiceSupabaseClient();

    // Pull strategy returns (already shifted). Optionally resample to weekly cadence.
    const ndays = String(period) === '7d' ? 7 : 1;
    const step = ndays;
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
    const dates: string[] = []; const retsAll: number[] = [];
    for (const r of cross) {
      const d = String(r.date ?? '').slice(0,10);
      const v = typeof (r as any).cs_top_bottom_decile_spread_1d === 'number'
        ? (r as any).cs_top_bottom_decile_spread_1d
        : Number((r as any).cs_top_bottom_decile_spread_1d ?? 0);
      if (d) { dates.push(d); retsAll.push(Number.isFinite(v) ? v : 0); }
    }
    // Downsample cadence and apply fees
    const base: number[] = [];
    for (let i=0; i<retsAll.length; i+=step) base.push(retsAll[i] - Number(fees || 0));

    const iters = Math.max(1000, Number(iterations) || 10000);
    const n = base.length;
    const rng = (n:number) => (Math.random() * n) | 0;

    const mean = (a:number[]) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
    const std = (a:number[]) => { if (a.length<2) return 0; const m=mean(a); const v=a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1); return Math.sqrt(v); };
    const periodsPerYear = Math.max(1, Math.round(365 / ndays));

    const mdds:number[] = [], avgdds:number[] = [], cagrs:number[] = [], sharpes:number[] = [], sortinos:number[] = [], calmar:number[] = [];

    for (let i=0;i<iters;i++){
      let eq = 1;
      let peak = 1;
      let minDD = 0;
      let sumNegDD = 0; let negDDCount = 0;
      const sampled:number[] = new Array(n);
      for (let k=0;k<n;k++){
        const r = base[rng(n)] || 0; sampled[k]=r;
        eq *= (1 + r);
        if (eq > peak) peak = eq;
        const dd = eq/peak - 1;
        if (dd < minDD) minDD = dd;
        if (dd < 0) { sumNegDD += dd; negDDCount++; }
      }
      const years = Math.max(1e-9, (n*ndays)/365);
      const cagr = Math.pow(eq, 1/years) - 1; cagrs.push(cagr);
      mdds.push(minDD);
      avgdds.push(negDDCount ? (sumNegDD / negDDCount) : 0);
      const m = mean(sampled); const s = std(sampled);
      const shr = s ? (m/s) * Math.sqrt(periodsPerYear) : 0; sharpes.push(shr);
      const dn = (()=>{ const neg=sampled.filter(x=>x<0); if(!neg.length) return 0; const msq=mean(neg.map(x=>x*x)); return Math.sqrt(msq);})();
      const sor = dn ? (m/dn) * Math.sqrt(periodsPerYear) : 0; sortinos.push(sor);
      const cal = minDD ? (cagr / Math.abs(minDD)) : 0; calmar.push(cal);
    }

    // Plot definitions; values will be rendered as Plotly histograms with nbinsx
    const metricDefs = [
      { key: 'mdds', arr: mdds, title: 'Max Drawdown', fmt: '.1%' , color: '#ef4444' },
      { key: 'avgdds', arr: avgdds, title: 'Average Drawdown', fmt: '.1%' , color: '#f59e0b' },
      { key: 'cagrs', arr: cagrs, title: 'CAGR', fmt: '.1%' , color: '#a78bfa' },
      { key: 'sharpes', arr: sharpes, title: 'Sharpe', fmt: '.2f' , color: '#22c55e' },
      { key: 'sortinos', arr: sortinos, title: 'Sortino', fmt: '.2f' , color: '#3b82f6' },
      { key: 'calmar', arr: calmar, title: 'Calmar', fmt: '.2f' , color: '#f43f5e' },
    ];

    function percentile(arr:number[], p:number){
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a,b)=>a-b);
      const idx = Math.min(sorted.length-1, Math.max(0, Math.floor((p/100) * (sorted.length-1))));
      return sorted[idx];
    }

    // Precompute summary lines + client-side histogram bins
    const nb = Math.max(10, Math.min(200, Number(bins) || 50));
    function computeBins(values:number[], nBins:number){
      if (!values.length) return { centers: [], counts: [] };
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      if (!isFinite(lo) || !isFinite(hi) || hi === lo) {
        // All same value — single bin
        return { centers: [isFinite(lo) ? lo : 0], counts: [values.length] };
      }
      const step = (hi - lo) / nBins;
      const counts = new Array(nBins).fill(0);
      for (const v of values) {
        const idx = Math.min(nBins - 1, Math.max(0, Math.floor((v - lo) / step)));
        counts[idx] += 1;
      }
      const centers = counts.map((_, i) => lo + (i + 0.5) * step);
      return { centers, counts };
    }

    const payload = Object.fromEntries(metricDefs.map(d => {
      const mu = mean(d.arr);
      const lo = percentile(d.arr, 0.5);
      const hi = percentile(d.arr, 99.5);
      const { centers, counts } = computeBins(d.arr, nb);
      return [d.key, { mean: mu, p005: lo, p995: hi, centers, counts }];
    }));

    const totalH = Number(height) || 900;
    const headerH = 120; // headings + badges per row
    const perPlot = Math.max(260, Math.floor((totalH - headerH) / 2));
    const html = `<!DOCTYPE html><html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
  html,body{margin:0;padding:0;height:100%;background:#0b1220;color:#e2e8f0;overflow:hidden}
  .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;height:100%}
  .card{background:#0f172a;border:1px solid #1f2937;border-radius:8px;padding:10px;display:flex;flex-direction:column}
  h4{margin:0 0 8px 0;font:600 12px system-ui;color:#cbd5e1}
  .badges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:8px}
  .badge{background:rgba(30,41,59,0.6);border:1px solid #334155;border-radius:8px;padding:8px 10px;color:#e5e7eb;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .badge .label{color:#94a3b8;font-weight:600;font-size:11px;letter-spacing:.02em}
  .badge .val{font:700 14px system-ui;color:#e5e7eb;margin-top:2px}
  .plot{flex:1;min-height:${perPlot}px}
</style></head>
<body><div class="grid">
  ${metricDefs.map((d,i)=>`<div class="card"><h4>${d.title}</h4><div class="badges"><div class="badge"><span class="label">Mean</span><span class="val" id="mean${i}"></span></div><div class="badge"><span class="label">99% CI</span><span class="val" id="ci${i}"></span></div></div><div id="c${i}" class="plot"></div></div>`).join('')}
</div>
<script>
const defs = ${JSON.stringify(metricDefs.map(({title,fmt,color})=>({title,fmt,color})))};
const linesObj = ${JSON.stringify(payload)};
const series = ${JSON.stringify(metricDefs.map(d=>d.arr))};
function formatBadge(val, fmt){
  if (typeof val !== 'number' || !isFinite(val)) return '—';
  if (fmt && fmt.includes('%')) return (val*100).toFixed(2) + '%';
  const digits = (fmt && fmt.includes('.2f')) ? 2 : 2;
  return val.toFixed(digits);
}
defs.forEach((def,idx)=>{
  const arr = series[idx] || [];
  const lines = linesObj[Object.keys(linesObj)[idx]] || {mean:0,p005:0,p995:0};
  // Fill badges
  const meanEl = document.getElementById('mean'+idx);
  const ciEl = document.getElementById('ci'+idx);
  if (meanEl) meanEl.textContent = formatBadge(lines.mean, def.fmt);
  if (ciEl) ciEl.textContent = '[' + formatBadge(lines.p005, def.fmt) + ', ' + formatBadge(lines.p995, def.fmt) + ']';
  const trace = { type:'histogram', x: arr, nbinsx:${Number(bins)||50}, marker:{color:def.color, line:{color:'#000000', width:1}}, opacity:0.9, hovertemplate:'Value: %{x:'+def.fmt+'}<br>Count: %{y}<extra></extra>' };
  const layout = { paper_bgcolor:'#0b1220', plot_bgcolor:'#0b1220', margin:{l:24,r:10,t:10,b:42},
    xaxis:{ showticklabels:true, tickformat:def.fmt, gridcolor:'#334155', tickfont:{color:'#94a3b8'} },
    yaxis:{ showticklabels:false, gridcolor:'#334155', tickfont:{color:'#94a3b8'} }, height:${perPlot}
  };
  const shapeLines = [
    {x0:lines.mean, color:'#60a5fa', dash:'solid', name:'Mean'},
    {x0:lines.p005, color:'#ef4444', dash:'dot', name:'0.5%'},
    {x0:lines.p995, color:'#ef4444', dash:'dot', name:'99.5%'}
  ];
  layout.shapes = shapeLines.map(l=>({type:'line', x0:l.x0, x1:l.x0, y0:0, y1:1, xref:'x', yref:'paper', line:{color:l.color, width:2, dash:l.dash}}));
  Plotly.newPlot('c'+idx,[trace],layout,{responsive:true, displayModeBar:false, scrollZoom:false});
});
window.addEventListener('resize',()=>{ defs.forEach((_,idx)=>Plotly.Plots.resize(document.getElementById('c'+idx))); });
</script></body></html>`;

    return json({ html, charts: payload, iterations: iters, periods: n, ndays, points: n });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
