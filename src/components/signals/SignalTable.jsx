import React from "react";
import { Card } from "@/components/ui/card";

export default function SignalTable({ title, rows = [] }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md overflow-hidden">
      <div className="p-4 border-b border-slate-800">
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-slate-300">
            <tr>
              <th className="px-4 py-2 text-left">Rank</th>
              <th className="px-4 py-2 text-left">Symbol</th>
              <th className="px-4 py-2 text-left">Pred 1d Return</th>
              <th className="px-4 py-2 text-left">P(up 1d)</th>
              <th className="px-4 py-2 text-left">Percentile</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.symbol} className="border-t border-slate-800">
                <td className="px-4 py-2">{r.rank}</td>
                <td className="px-4 py-2 font-semibold">{r.symbol}</td>
                <td className={`px-4 py-2 ${r.pred_return_1d >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {(r.pred_return_1d * 100).toFixed(2)}%
                </td>
                <td className="px-4 py-2 text-blue-300">{(r.pred_proba_up_1d * 100).toFixed(0)}%</td>
                <td className="px-4 py-2">{r.percentile.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}