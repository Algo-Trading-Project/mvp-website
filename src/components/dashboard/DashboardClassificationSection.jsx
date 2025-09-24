
import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ChartCardSkeleton from "../skeletons/ChartCardSkeleton";
import Section from "./Section";

// Import the new consolidated functions (precisionRecallPlot removed)
import { getTokenPerformanceCharts } from "@/api/functions";
import { getDecilePerformanceChart } from "@/api/functions";

function Plot({ html, loading }) {
  if (loading) return <ChartCardSkeleton />;
  if (!html) return <div className="h-full flex items-center justify-center text-slate-500">No data</div>;
  return <iframe srcDoc={html} className="w-full h-full border-0 rounded-md" sandbox="allow-scripts" />;
}

export default function DashboardClassificationSection({ lastMetrics, subscription, isPublic }) {
  const [horizon, setHorizon] = useState("1d");
  const [direction, setDirection] = useState("long");
  const [windowDays, setWindowDays] = useState(30);

  // State for the consolidated functions (removed precision-recall)
  const [tokenPerformance, setTokenPerformance] = useState({ html_top: null, html_bottom: null, count: 0 });
  const [decilePerformance, setDecilePerformance] = useState({ html: null, n: 0 });
  
  // Loading states (removed prLoading)
  const [tokenLoading, setTokenLoading] = useState(true);
  const [decileLoading, setDecileLoading] = useState(true);

  // Effect to load chart data (removed precision-recall logic)
  useEffect(() => {
    const loadCharts = async () => {
      const params = { horizon, direction, windowDays };

      setTokenLoading(true);
      try {
        const { data: perfData } = await getTokenPerformanceCharts(params);
        setTokenPerformance(perfData);
      } catch (e) {
        console.error("Error loading token performance charts:", e);
        toast.error(`Error loading token performance charts: ${e.message}`);
        setTokenPerformance({ html_top: null, html_bottom: null, count: 0 });
      } finally {
        setTokenLoading(false);
      }

      setDecileLoading(true);
      try {
        const { data: decileData } = await getDecilePerformanceChart(params);
        setDecilePerformance(decileData);
      } catch (e) {
        console.error("Error loading decile performance chart:", e);
        toast.error(`Error loading decile performance chart: ${e.message}`);
        setDecilePerformance({ html: null, n: 0 });
      } finally {
        setDecileLoading(false);
      }
    };
    loadCharts();
  }, [horizon, direction, windowDays]);

  const ControlHeader = ({ title, tooltipText }) => (
    <div className="flex items-center space-x-2 mb-3">
      <h4 className="text-sm font-semibold text-slate-300">{title}</h4>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <HelpCircle className="h-4 w-4 text-slate-500" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{tooltipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );

  return (
    <Section title="Model Performance Deep Dive" isPublic={isPublic} subscription={subscription}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-md p-4 h-fit">
          <ControlHeader title="Prediction Horizon" tooltipText="Analyze 1-day or 7-day ahead predictions." />
          <RadioGroup value={horizon} onValueChange={setHorizon} className="flex space-x-4">
            <div className="flex items-center space-x-2"><RadioGroupItem value="1d" id="h1" /><Label htmlFor="h1">1-day</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="7d" id="h7" /><Label htmlFor="h7">7-day</Label></div>
          </RadioGroup>

          <ControlHeader title="Signal Direction" tooltipText="Focus on long (buy) or short (sell) signals." />
          <RadioGroup value={direction} onValueChange={setDirection} className="flex space-x-4">
            <div className="flex items-center space-x-2"><RadioGroupItem value="long" id="d_long" /><Label htmlFor="d_long">Long</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="short" id="d_short" /><Label htmlFor="d_short">Short</Label></div>
          </RadioGroup>

          <ControlHeader title="Lookback Window" tooltipText="Set the number of past days to include in the analysis." />
          <div className="flex items-center space-x-4">
            <Slider value={[windowDays]} onValueChange={(v) => setWindowDays(v[0])} min={7} max={365} step={1} />
            <span className="text-sm font-medium text-slate-300 w-20 text-right">{windowDays} days</span>
          </div>
        </div>

        {/* Charts - Removed precision-recall chart, now showing 3 charts in a responsive layout */}
        <div className="lg:col-span-9 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4 min-h-[380px]">
            <h3 className="text-md font-semibold text-white mb-2">Decile-wise Performance</h3>
            <Plot html={decilePerformance.html} loading={decileLoading} />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4 min-h-[380px]">
             <h3 className="text-md font-semibold text-white mb-2">Best Performing Tokens</h3>
            <Plot html={tokenPerformance.html_top} loading={tokenLoading} />
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4 min-h-[380px] xl:col-span-2">
            <h3 className="text-md font-semibold text-white mb-2">Worst Performing Tokens</h3>
            <Plot html={tokenPerformance.html_bottom} loading={tokenLoading} />
          </div>
        </div>
      </div>
    </Section>
  );
}
