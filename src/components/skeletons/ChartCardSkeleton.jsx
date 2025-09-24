import React from "react";

export default function ChartCardSkeleton({ height = 256 }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md animate-pulse">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="h-5 w-48 bg-slate-800 rounded" />
        <div className="h-8 w-24 bg-slate-800 rounded" />
      </div>
      <div className="p-4">
        <div
          className="relative bg-slate-800/60 rounded-md overflow-hidden"
          style={{ height }}
        >
          {/* Axes and grid mimic */}
          <div className="absolute inset-x-0 bottom-8 h-px bg-slate-700/60" />
          <div className="absolute inset-y-0 left-10 w-px bg-slate-700/60" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="absolute inset-y-6 w-px bg-slate-800" style={{ left: `${20 + i * 15}%` }} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="absolute inset-x-6 h-px bg-slate-800" style={{ top: `${20 + i * 18}%` }} />
          ))}
          {/* Wavy placeholder line */}
          <div className="absolute inset-0">
            <div className="h-1 w-1/2 bg-slate-700 rounded absolute left-[10%] top-1/2" />
            <div className="h-1 w-1/3 bg-slate-700 rounded absolute left-[35%] top-1/3" />
            <div className="h-1 w-2/5 bg-slate-700 rounded absolute left-[55%] top-[60%]" />
          </div>
        </div>
      </div>
    </div>
  );
}