import { getServiceSupabaseClient } from '../_shared/supabase.ts';
import { json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/middleware.ts';
import { shiftDays } from '../_shared/dates.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const {
      horizon = '1d',
      direction = 'long',
      windowDays = 30,
      minObs = 5,
      topN = 20,
    } = await req.json();

    if (!['1d', '7d'].includes(horizon)) {
      return json({ error: `Unsupported horizon ${horizon}` }, { status: 400 });
    }

    if (!['long', 'short'].includes(direction)) {
      return json({ error: `Unsupported direction ${direction}` }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();

    const { data: latestRows, error: latestError } = await supabase
      .from('predictions')
      .select('date')
      .order('date', { ascending: false })
      .limit(1);

    if (latestError) throw latestError;

    const maxDate = latestRows?.[0]?.date ? String(latestRows[0].date).slice(0, 10) : null;

    if (!maxDate) {
      const emptyHtml = '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data available.</body></html>';
      return json({ html_top: emptyHtml, html_bottom: emptyHtml, count: 0 });
    }

    const end = maxDate;
    const start = shiftDays(end, -(windowDays - 1));

    const { data, error } = await supabase.rpc('rpc_symbol_expectancy', {
      horizon,
      direction,
      start_date: start,
      end_date: end,
      min_obs: minObs,
    });

    if (error) throw error;

    const symbols = (data ?? []) as { symbol: string; avg_expectancy: number; observation_count: number }[];
    if (!symbols.length) {
      const emptyHtml = '<html><body style="background:#0b1220;color:#e2e8f0;padding:16px">No data available.</body></html>';
      return json({ html_top: emptyHtml, html_bottom: emptyHtml, count: 0 });
    }

    const sortedDesc = [...symbols].sort((a, b) => b.avg_expectancy - a.avg_expectancy);
    const sortedAsc = [...sortedDesc].reverse();

    const topRows = sortedDesc.slice(0, topN);
    const bottomRows = [...sortedAsc.slice(0, topN)].reverse();

    const makePlot = (rows: typeof symbols, title: string, color: string) => {
      const x = rows.map((r) => r.symbol);
      const y = rows.map((r) => Number(r.avg_expectancy));
      const directionLabel = direction === 'long' ? 'Long' : 'Short';
      const plotTitle = `${title} (${directionLabel} signals)`;
      return `<!DOCTYPE html><html><head><script src=\"https://cdn.plot.ly/plotly-2.27.0.min.js\"></script><style>html,body{margin:0;padding:0;height:100%;background:#0b1220}#chart{width:100%;height:100%}</style></head><body><div id=\"chart\"></div><script>
const data=[{type:'bar',x:${JSON.stringify(x)},y:${JSON.stringify(y)},marker:{color:'${color}'},hovertemplate:'Expectancy: %{y:.2%}<br>Symbol: %{x}<extra></extra>'}];
const layout={title:{text:${JSON.stringify(plotTitle)},font:{color:'#e2e8f0',size:14},x:0.5},paper_bgcolor:'#0b1220',plot_bgcolor:'#0b1220',margin:{l:48,r:20,t:40,b:80},xaxis:{tickfont:{color:'#94a3b8'},gridcolor:'#334155',tickangle:-45},yaxis:{tickformat:'.2%',tickfont:{color:'#94a3b8'},gridcolor:'#334155',zeroline:true,zerolinecolor:'#475569'}};
Plotly.newPlot('chart',data,layout,{responsive:true,displayModeBar:false,scrollZoom:false});</script></body></html>`;
    };

    return json({
      html_top: makePlot(topRows, 'Best Performing Tokens', '#10b981'),
      html_bottom: makePlot(bottomRows, 'Worst Performing Tokens', '#ef4444'),
      count: topRows.length + bottomRows.length,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
