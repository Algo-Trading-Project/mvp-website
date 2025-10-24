import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Use POST' }, { status: 405 });
    const { start, end, window = 30, height = 360 } = await req.json();
    if (!start || !end) return json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });

    const supabase = getServiceSupabaseClient();

    // Strategy returns from daily_dashboard_metrics MV
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

    const dates: string[] = []; const rStrat: number[] = [];
    for (const r of cross) {
      const d = String(r.date ?? '').slice(0,10);
      const v = typeof (r as any).cs_top_bottom_decile_spread_1d === 'number' ? (r as any).cs_top_bottom_decile_spread_1d : Number((r as any).cs_top_bottom_decile_spread_1d ?? 0);
      if (d) { dates.push(d); rStrat.push(Number.isFinite(v) ? v : 0); }
    }

    // BTC forward 1d returns shifted by 1 day
    fromIdx = 0; const btc: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('predictions')
        .select('date, forward_returns_1, symbol_id')
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
    const rMkt: number[] = []; const dMkt: string[] = [];
    for (const r of btc) {
      const d = String(r.date ?? '').slice(0,10);
      const v = typeof r.forward_returns_1 === 'number' ? r.forward_returns_1 : Number(r.forward_returns_1 ?? 0);
      if (d) { dMkt.push(d); rMkt.push(Number.isFinite(v) ? v : 0); }
    }
    // align dates to strategy date order
    const mapMkt = new Map(dMkt.map((d,i)=>[d,rMkt[i]]));
    const mktAligned = dates.map((d)=> mapMkt.get(d) ?? 0);
    // shift 1 day
    mktAligned.unshift(0); mktAligned.pop();

    // Rolling alpha = mean(rs) - beta * mean(rm), beta = cov(rs,rm) / var(rm)
    const alpha: Array<number | null> = [];
    const beta: Array<number | null> = [];
    function mean(arr:number[], s:number, e:number){ let t=0,c=0; for(let i=s;i<=e;i++){t+=arr[i];c++;} return c? t/c : 0; }
    for (let i = 0; i < dates.length; i++) {
      const s = Math.max(0, i - (Number(window) - 1));
      const e = i;
      const n = e - s + 1;
      if (n < 7) {
        alpha.push(null);
        beta.push(null);
        continue;
      }
      const ms = mean(rStrat, s, e); const mm = mean(mktAligned, s, e);
      let cov=0, varM=0; for (let k=s;k<=e;k++){ const ds=rStrat[k]-ms; const dm=mktAligned[k]-mm; cov+=ds*dm; varM+=dm*dm; }
      cov/= (n-1 || 1); varM/= (n-1 || 1);
      const b = varM ? (cov/varM) : 0; beta.push(b);
      alpha.push(ms - b*mm);
    }

    const axisStart = dates.length ? dates[0] : String(start);
    const axisEnd = dates.length ? dates[dates.length-1] : String(end);

    const slicedDates = dates.slice(7);
    const slicedAlpha = alpha.slice(7);
    const slicedBeta = beta.slice(7);

    const htmlAlpha = `<!DOCTYPE html><html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div><script>
const x=${JSON.stringify(slicedDates)}, y=${JSON.stringify(slicedAlpha)};
const data=[{x,y,type:'scatter',mode:'lines',line:{color:'#22c55e',width:2},hovertemplate:'%{x}<br>%{y:.4%}<extra></extra>'}];
const layout={paper_bgcolor:'#0b1220',plot_bgcolor:'#0b1220',margin:{l:48,r:20,t:10,b:30},
  yaxis:{tickformat:'.2%',gridcolor:'#334155',tickfont:{color:'#94a3b8'}},
  xaxis:{title:'Date',type:'date',range:['${axisStart}','${axisEnd}'],gridcolor:'#334155',tickfont:{color:'#94a3b8'}, titlefont:{color:'#cbd5e1'}},
  shapes:[{type:'line',x0:'${axisStart}',x1:'${axisEnd}',y0:0,y1:0,line:{dash:'dot',color:'#ef4444'}}],height:${Number(height)||360}};
const config={responsive:true,displayModeBar:false,scrollZoom:false};
Plotly.newPlot('chart',data,layout,config);window.addEventListener('resize',()=>Plotly.Plots.resize(document.getElementById('chart')));
</script></body></html>`;

    const htmlBeta = `<!DOCTYPE html><html><head><script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head>
<body><div id="chart"></div><script>
const x=${JSON.stringify(slicedDates)}, y=${JSON.stringify(slicedBeta)};
const data=[{x,y,type:'scatter',mode:'lines',line:{color:'#f59e0b',width:2},hovertemplate:'%{x}<br>%{y:.2f}<extra></extra>'}];
const layout={paper_bgcolor:'#0b1220',plot_bgcolor:'#0b1220',margin:{l:48,r:20,t:10,b:30},
  yaxis:{tickformat:'.2f',gridcolor:'#334155',tickfont:{color:'#94a3b8'}},
  xaxis:{title:'Date',type:'date',range:['${axisStart}','${axisEnd}'],gridcolor:'#334155',tickfont:{color:'#94a3b8'}, titlefont:{color:'#cbd5e1'}},
  shapes:[{type:'line',x0:'${axisStart}',x1:'${axisEnd}',y0:0,y1:0,line:{dash:'dot',color:'#ef4444'}}],height:${Number(height)||360}};
const config={responsive:true,displayModeBar:false,scrollZoom:false};
Plotly.newPlot('chart',data,layout,config);window.addEventListener('resize',()=>Plotly.Plots.resize(document.getElementById('chart')));
</script></body></html>`;

    return json({ alpha: htmlAlpha, beta: htmlBeta, points: dates.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
