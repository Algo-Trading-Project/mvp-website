import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

// Robustness: bootstrap full equity curves and compute metric histograms
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, { status: 405 });
    const { start, end, iterations = 10000, fees = 0.003, period = '1d', height = 380 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    const supabase = getServiceSupabaseClient();

    // Pull strategy returns (already shifted). Optionally resample to weekly cadence.
    const ndays = String(period) === '7d' ? 7 : 1;
    const step = ndays;
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
    const dates: string[] = []; const retsAll: number[] = [];
    for (const r of cross) {
      const d = String(r.date ?? '').slice(0,10);
      const v = typeof (r as any).cs_top_bottom_decile_spread === 'number'
        ? (r as any).cs_top_bottom_decile_spread
        : Number((r as any).cs_top_bottom_decile_spread ?? 0);
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

    // Create an HTML grid of histograms for each metric
    const metricDefs = [
      { key: 'mdds', arr: mdds, title: 'Max Drawdown', fmt: '.1%' , color: '#ef4444' },
      { key: 'avgdds', arr: avgdds, title: 'Average Drawdown', fmt: '.1%' , color: '#94a3b8' },
      { key: 'cagrs', arr: cagrs, title: 'CAGR', fmt: '.1%' , color: '#22c55e' },
      { key: 'sharpes', arr: sharpes, title: 'Sharpe', fmt: '.2f' , color: '#a78bfa' },
      { key: 'sortinos', arr: sortinos, title: 'Sortino', fmt: '.2f' , color: '#f59e0b' },
      { key: 'calmar', arr: calmar, title: 'Calmar', fmt: '.2f' , color: '#f43f5e' },
    ];

    function hist(arr:number[], bins:number){
      const min = Math.min(...arr), max = Math.max(...arr);
      const edges = Array.from({length: bins+1}, (_,i)=> min + (i*(max-min||1))/bins);
      const counts = new Array(bins).fill(0);
      const centers = edges.slice(0,-1).map((e,i)=> (e+edges[i+1])/2);
      for (const v of arr){
        let idx = Math.floor(((v - min)/(max - min || 1)) * bins);
        if (idx < 0) idx = 0; if (idx >= bins) idx = bins - 1;
        counts[idx]++;
      }
      return { centers, counts };
    }

    function percentile(arr:number[], p:number){
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a,b)=>a-b);
      const idx = Math.min(sorted.length-1, Math.max(0, Math.floor((p/100) * (sorted.length-1))));
      return sorted[idx];
    }

    const payload = Object.fromEntries(metricDefs.map(d=>{
      const h = hist(d.arr, 60);
      const mu = mean(d.arr);
      const lo = percentile(d.arr, 0.5);
      const hi = percentile(d.arr, 99.5);
      return [d.key, { ...h, mean: mu, p005: lo, p995: hi }];
    }));

    const html = `<!DOCTYPE html><html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
  html,body{margin:0;padding:0;height:100%;background:#0b1220;color:#e2e8f0;overflow:hidden}
  .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .card{background:#0f172a;border:1px solid #1f2937;border-radius:8px;padding:8px}
  h4{margin:0 0 8px 0;font:600 12px system-ui}
</style></head>
<body><div class="grid">
  ${metricDefs.map((d,i)=>`<div class="card"><h4>${d.title}</h4><div id="c${i}"></div></div>`).join('')}
</div>
<script>
const defs = ${JSON.stringify(metricDefs.map(({title,fmt,color})=>({title,fmt,color})))};
const dataObj = ${JSON.stringify(payload)};
defs.forEach((def,idx)=>{
  const key = Object.keys(dataObj)[idx];
  const src = dataObj[key] || {centers:[],counts:[],mean:0,p005:0,p995:0};
  const hover = 'Value: %{x:' + def.fmt + '}<extra></extra>';
  const trace = { type:'bar', x: src.centers, y: src.counts, marker:{color:def.color, line:{color:'#000000', width:1}}, opacity:0.9, hovertemplate:hover };
  const layout = { paper_bgcolor:'#0b1220', plot_bgcolor:'#0b1220', margin:{l:16,r:8,t:8,b:8},
    xaxis:{ showticklabels:true, tickformat:def.fmt, gridcolor:'#334155', tickfont:{color:'#94a3b8'} },
    yaxis:{ showticklabels:false, gridcolor:'#334155' }, height:${Number(height)||220}
  };
  const lines = [
    {x0:src.mean, color:'#60a5fa', dash:'solid', name:'Mean'},
    {x0:src.p005, color:'#ef4444', dash:'dot', name:'0.5%'},
    {x0:src.p995, color:'#ef4444', dash:'dot', name:'99.5%'}
  ];
  layout.shapes = lines.map(l=>({type:'line', x0:l.x0, x1:l.x0, y0:0, y1:1, xref:'x', yref:'paper', line:{color:l.color, width:2, dash:l.dash}}));
  Plotly.newPlot('c'+idx,[trace],layout,{responsive:true, displayModeBar:false, scrollZoom:false});
});
window.addEventListener('resize',()=>{ defs.forEach((_,idx)=>Plotly.Plots.resize(document.getElementById('c'+idx))); });
</script></body></html>`;

    return json({ html, charts: payload, iterations: iters, periods: n, ndays, points: n });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
