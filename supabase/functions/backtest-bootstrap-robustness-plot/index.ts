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
    const rng = (n:number) => Math.floor(Math.random() * n);

    const mean = (a:number[]) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
    const std = (a:number[]) => { if (a.length<2) return 0; const m=mean(a); const v=a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1); return Math.sqrt(v); };
    const periodsPerYear = Math.max(1, Math.round(365 / ndays));

    const totals:number[] = [], mdds:number[] = [], avgdds:number[] = [], cagrs:number[] = [], sharpes:number[] = [], sortinos:number[] = [], calmar:number[] = [];

    for (let i=0;i<iters;i++){
      const sampled:number[] = new Array(n);
      for (let k=0;k<n;k++) sampled[k] = base[rng(n)] ?? 0;
      let eq=1; const equity:number[] = new Array(n);
      for (let k=0;k<n;k++){ eq *= (1 + sampled[k]); equity[k]=eq; }
      const total = eq - 1; totals.push(total);
      // drawdowns
      let peak=-Infinity; const dds:number[]=[]; for(const e of equity){ peak=Math.max(peak,e); dds.push(e/peak - 1);} const mdd = dds.length? Math.min(...dds):0; mdds.push(mdd);
      const avgdd = (()=>{ const neg=dds.filter(x=>x<0); return neg.length? neg.reduce((a,b)=>a+b,0)/neg.length : 0; })(); avgdds.push(avgdd);
      // CAGR (based on cadence)
      const years = Math.max(1e-9, (n*ndays)/365); const cagr = Math.pow(eq, 1/years) - 1; cagrs.push(cagr);
      const m = mean(sampled); const s = std(sampled); const shr = s? (m/s)*Math.sqrt(periodsPerYear) : 0; sharpes.push(shr);
      const dn = (()=>{ const neg=sampled.filter(x=>x<0); if(!neg.length) return 0; const msq=mean(neg.map(x=>x*x)); return Math.sqrt(msq);})();
      const sor = dn? (m/dn)*Math.sqrt(periodsPerYear) : 0; sortinos.push(sor);
      const cal = mdd? (cagr/Math.abs(mdd)) : 0; calmar.push(cal);
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

    const payload = Object.fromEntries(metricDefs.map(d=>[d.key,d.arr]));

    const html = `<!DOCTYPE html><html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
  html,body{margin:0;padding:0;height:100%;background:#0b1220;color:#e2e8f0}
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
  const arr = dataObj[key] || [];
  const hover = 'Value: %{x:' + def.fmt + '}<extra></extra>';
  const trace = { type:'histogram', x: arr, marker:{color:def.color}, opacity:0.9, hovertemplate:hover };
  const layout = { paper_bgcolor:'#0b1220', plot_bgcolor:'#0b1220', margin:{l:24,r:8,t:10,b:24},
    xaxis:{ title: def.title, tickformat:def.fmt, gridcolor:'#334155', tickfont:{color:'#94a3b8'}, titlefont:{color:'#cbd5e1'} },
    yaxis:{ showticklabels:false, gridcolor:'#334155' }, height:${Number(height)||260}
  };
  trace.marker = trace.marker || {}; trace.marker.line = {color: '#000000', width: 1};
  Plotly.newPlot('c'+idx,[trace],layout,{responsive:true, displayModeBar:false, scrollZoom:false});
});
window.addEventListener('resize',()=>{ defs.forEach((_,idx)=>Plotly.Plots.resize(document.getElementById('c'+idx))); });
</script></body></html>`;

    return json({ html, iterations: iters, periods: n, ndays, points: n });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
