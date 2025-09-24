import React from "react";

export default function TableSkeleton({ rows = 5 }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md animate-pulse">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="h-5 w-40 bg-slate-800 rounded" />
        <div className="h-7 w-20 bg-slate-800 rounded" />
      </div>
      <div className="p-4 space-y-2">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="flex items-center p-2 rounded-md bg-slate-800/60">
            {/* Rank + symbol */}
            <div className="flex items-center space-x-3 min-w-[120px]">
              <div className="w-6 h-6 bg-slate-700 rounded-sm" />
              <div className="h-4 w-10 bg-slate-700 rounded" />
            </div>
            <div className="h-6 w-px bg-slate-700 mx-3" />
            {/* Two metrics */}
            <div className="flex-1 grid grid-cols-2 divide-x divide-slate-700">
              <div className="px-2 text-center">
                <div className="h-4 w-14 bg-slate-700 rounded mx-auto mb-1" />
                <div className="h-3 w-10 bg-slate-800 rounded mx-auto" />
              </div>
              <div className="px-2 text-center">
                <div className="h-4 w-14 bg-slate-700 rounded mx-auto mb-1" />
                <div className="h-3 w-12 bg-slate-800 rounded mx-auto" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}