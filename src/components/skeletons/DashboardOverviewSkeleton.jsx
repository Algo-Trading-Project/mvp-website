import React from "react";

export default function DashboardOverviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top: two Signal Health cards */}
      <div className="grid lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-md">
            <div className="p-6 border-b border-slate-800">
              <div className="h-5 w-40 bg-slate-800 rounded" />
            </div>
            <div className="p-6 space-y-6">
              {/* Rolling IC group */}
              <div>
                <div className="h-4 w-56 bg-slate-800 rounded mb-3" />
                <div className="grid grid-cols-3 gap-4">
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="p-3 bg-slate-800/60 rounded-md">
                      <div className="h-6 w-16 bg-slate-700 rounded mx-auto mb-2" />
                      <div className="h-3 w-12 bg-slate-700 rounded mx-auto" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Hit rate group */}
              <div>
                <div className="h-4 w-44 bg-slate-800 rounded mb-3" />
                <div className="grid grid-cols-3 gap-4">
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="p-3 bg-slate-800/60 rounded-md">
                      <div className="h-6 w-16 bg-slate-700 rounded mx-auto mb-2" />
                      <div className="h-3 w-12 bg-slate-700 rounded mx-auto" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Decile spread group */}
              <div>
                <div className="h-4 w-64 bg-slate-800 rounded mb-3" />
                <div className="grid grid-cols-3 gap-4">
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="p-3 bg-slate-800/60 rounded-md">
                      <div className="h-6 w-16 bg-slate-700 rounded mx-auto mb-2" />
                      <div className="h-3 w-12 bg-slate-700 rounded mx-auto" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom: Top/Bottom signals (compact) */}
      <div className="grid md:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-md">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="h-4 w-44 bg-slate-800 rounded" />
              <div className="h-7 w-20 bg-slate-800 rounded" />
            </div>
            <div className="p-4 space-y-2">
              {[0, 1, 2, 3, 4].map((r) => (
                <div key={r} className="flex items-center p-2 rounded-md bg-slate-800/60">
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
        ))}
      </div>
    </div>
  );
}