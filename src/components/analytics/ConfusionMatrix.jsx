import React from "react";

export default function ConfusionMatrix({ tp, tn, fp, fn }) {
  return (
    <div className="w-full max-w-sm">
      <div className="grid grid-cols-2 grid-rows-2 w-full h-full border border-slate-700">
        <div className="flex items-center justify-center border-r border-b border-slate-700 bg-emerald-500/15 text-emerald-300 font-semibold text-lg py-8">
          TP: {tp}
        </div>
        <div className="flex items-center justify-center border-b border-slate-700 bg-red-500/15 text-red-300 font-semibold text-lg py-8">
          FN: {fn}
        </div>
        <div className="flex items-center justify-center border-r border-slate-700 bg-red-500/15 text-red-300 font-semibold text-lg py-8">
          FP: {fp}
        </div>
        <div className="flex items-center justify-center bg-emerald-500/15 text-emerald-300 font-semibold text-lg py-8">
          TN: {tn}
        </div>
      </div>
    </div>
  );
}