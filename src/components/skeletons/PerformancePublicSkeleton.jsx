import React from "react";
import ChartCardSkeleton from "./ChartCardSkeleton";

export default function PerformancePublicSkeleton() {
  return (
    <div className="min-h-screen py-8 bg-slate-950 animate-pulse">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
        <div className="mb-8">
          <div className="h-8 w-72 bg-slate-800 rounded mb-2" />
          <div className="h-4 w-[420px] max-w-full bg-slate-800 rounded" />
        </div>

        <div className="space-y-6">
          <ChartCardSkeleton height={288} />
          <ChartCardSkeleton height={288} />
          <ChartCardSkeleton height={288} />
          <ChartCardSkeleton height={288} />
          <ChartCardSkeleton height={288} />
        </div>

        <div className="h-3 w-80 bg-slate-800 rounded mt-6" />
      </div>
    </div>
  );
}