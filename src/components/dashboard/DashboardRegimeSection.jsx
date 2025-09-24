
import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Activity, Waves, Calendar } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";
import Section from "@/components/dashboard/Section";

// Generate full time series data outside component to avoid re-running on every render  
const fullData = Array.from({ length: 365 }).map((_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (365 - i));
  return {
    date: d.toISOString().slice(0, 10),
    breadth: 60 + Math.sin(i / 15) * 15 + (Math.random() - 0.5) * 5,
    dispersion: 7 + Math.cos(i / 10) * 2 + (Math.random() - 0.5) * 1,
    vol: 25 + Math.sin(i / 9) * 8 + (Math.random() - 0.5) * 3,
    corr: 0.45 + Math.cos(i / 14) * 0.15 + (Math.random() - 0.5) * 0.05,
  };
});

export default function DashboardRegimeSection() {
  const [dateRange, setDateRange] = useState({
    start: "2025-01-01", // Changed to year-to-date
    end: new Date().toISOString().split('T')[0]
  });

  const handleDateChange = (e) => {
    setDateRange(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const filteredData = useMemo(() => {
    return fullData.filter(d => d.date >= dateRange.start && d.date <= dateRange.end);
  }, [dateRange]);

  const dateControls = (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-slate-400" />
        <span className="text-slate-400">From</span>
        <input 
          type="date" 
          name="start" 
          className="bg-slate-800 border border-slate-700 px-2 py-1 rounded" 
          value={dateRange.start} 
          onChange={handleDateChange} 
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-slate-400">To</span>
        <input 
          type="date" 
          name="end" 
          className="bg-slate-800 border border-slate-700 px-2 py-1 rounded" 
          value={dateRange.end} 
          onChange={handleDateChange} 
        />
      </div>
    </div>
  );

  const regimeMetrics = [
    { name: "Volatility (30d ann.)", value: "35.2%", status: "Elevated" },
    { name: "Correlation (avg. 30d)", value: "0.58", status: "Moderate" },
    { name: "Momentum (4w breadth)", value: "68%", status: "Bullish" },
    { name: "Volume (24h vs 30d avg)", value: "+15.2%", status: "High" }
  ];

  return (
    <div className="space-y-6">
      <Section
        title="Custom Market Regime & Analytics"
        subtitle="Select a range to analyze breadth, dispersion, volatility, and cross-sectional correlation"
        rightSlot={dateControls}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {regimeMetrics.map(m => (
            <div key={m.name} className="p-4 bg-slate-800/60 rounded-md">
              <p className="text-xs text-slate-400">{m.name}</p>
              <p className="text-xl font-bold mt-1 text-white">{m.value}</p>
              <Badge className="mt-2 bg-blue-500/20 text-blue-300 text-xs">{m.status}</Badge>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Market Internals"
        subtitle="Rolling market breadth and return dispersion"
      >
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fill: "#94a3b8", fontSize: 12 }}/>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} formatter={(v) => `${v.toFixed(1)}%`}/>
                <Line type="monotone" dataKey="breadth" stroke="#34d399" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fill: "#94a3b8", fontSize: 12 }}/>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} formatter={(v) => `${v.toFixed(2)}%`}/>
                <Line type="monotone" dataKey="dispersion" stroke="#a78bfa" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      <Section
        title="Volatility & Correlation"
        subtitle="Realized volatility and average pairwise correlation"
      >
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fill: "#94a3b8", fontSize: 12 }}/>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} formatter={(v) => `${v.toFixed(1)}%`}/>
                <Line type="monotone" dataKey="vol" stroke="#f59e0b" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis domain={[0, 1]} tick={{ fill: "#94a3b8", fontSize: 12 }}/>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}/>
                <Line type="monotone" dataKey="corr" stroke="#60a5fa" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>
    </div>
  );
}
