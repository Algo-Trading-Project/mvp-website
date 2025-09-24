import React from "react";

export default function AccountPageSkeleton() {
  return (
    <div className="min-h-screen py-8 bg-slate-950 animate-pulse">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-4 lg:px-6">
        <div className="h-8 w-64 bg-slate-800 rounded mb-8" />

        <div className="grid gap-8 md:grid-cols-2">
          {/* Profile card */}
          <div className="bg-slate-900 border border-slate-800 rounded-md">
            <div className="p-6 border-b border-slate-800">
              <div className="h-5 w-28 bg-slate-800 rounded" />
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="h-3 w-16 bg-slate-800 rounded mb-2" />
                <div className="h-5 w-48 bg-slate-800 rounded" />
              </div>
              <div>
                <div className="h-3 w-14 bg-slate-800 rounded mb-2" />
                <div className="h-5 w-64 bg-slate-800 rounded" />
              </div>
            </div>
          </div>

          {/* Subscription card */}
          <div className="bg-slate-900 border border-slate-800 rounded-md">
            <div className="p-6 border-b border-slate-800">
              <div className="h-5 w-32 bg-slate-800 rounded" />
            </div>
            <div className="p-6 space-y-4">
              <div className="h-5 w-36 bg-slate-800 rounded" />
              <div className="h-5 w-28 bg-slate-800 rounded" />
              <div className="h-5 w-44 bg-slate-800 rounded" />
              <div className="h-9 w-40 bg-slate-800 rounded mt-2" />
            </div>
          </div>

          {/* API Access */}
          <div className="bg-slate-900 border border-slate-800 rounded-md md:col-span-2">
            <div className="p-6 border-b border-slate-800">
              <div className="h-5 w-28 bg-slate-800 rounded" />
            </div>
            <div className="p-6 space-y-4">
              <div className="h-4 w-[520px] max-w-full bg-slate-800 rounded" />
              <div className="p-3 bg-slate-950 rounded-md flex items-center justify-between border border-slate-700">
                <div className="h-5 w-64 bg-slate-800 rounded" />
                <div className="h-8 w-36 bg-slate-800 rounded" />
              </div>
              <div className="h-4 w-44 bg-slate-800 rounded" />
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-slate-900 border border-slate-800 rounded-md md:col-span-2">
            <div className="p-6 border-b border-slate-800">
              <div className="h-5 w-28 bg-slate-800 rounded" />
            </div>
            <div className="p-6 space-y-6">
              {[0,1,2].map((i)=>(
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <div className="h-4 w-40 bg-slate-800 rounded mb-2" />
                    <div className="h-3 w-64 bg-slate-800 rounded" />
                  </div>
                  <div className="h-6 w-12 bg-slate-800 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}