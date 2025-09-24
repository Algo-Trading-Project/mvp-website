import React from "react";
import TableSkeleton from "./TableSkeleton";

export default function SignalsPageSkeleton() {
  return (
    <div className="min-h-screen py-8 bg-slate-950 animate-pulse">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-4 lg:px-6">
        <div className="mb-6">
          <div className="h-8 w-64 bg-slate-800 rounded mb-2" />
          <div className="h-4 w-[520px] max-w-full bg-slate-800 rounded" />
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-md">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="h-5 w-40 bg-slate-800 rounded" />
              <div className="h-7 w-20 bg-slate-800 rounded" />
            </div>
            <div className="p-4">
              <TableSkeleton rows={5} />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-md">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="h-5 w-48 bg-slate-800 rounded" />
              <div className="h-7 w-20 bg-slate-800 rounded" />
            </div>
            <div className="p-4">
              <TableSkeleton rows={5} />
            </div>
          </div>

          <div className="p-4 rounded-md bg-slate-900 border border-slate-800">
            <div className="h-5 w-32 bg-slate-800 rounded mb-3" />
            <div className="h-4 w-[420px] max-w-full bg-slate-800 rounded mb-3" />
            <div className="h-8 w-32 bg-slate-800 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}