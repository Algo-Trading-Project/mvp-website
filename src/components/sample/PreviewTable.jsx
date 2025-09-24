import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function PreviewTable({ title, subtitle, columns = [], rows = [] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-200">
        <h4 className="font-semibold text-slate-900">{title}</h4>
        {subtitle && <p className="text-xs text-slate-600 mt-1">{subtitle}</p>}
      </div>
      <TooltipProvider>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left whitespace-nowrap font-medium">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">{c}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Column: {c}
                      </TooltipContent>
                    </Tooltip>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 whitespace-nowrap text-slate-900" title={`${c}: ${row[c]}`}>
                      {row[c]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TooltipProvider>
      <div className="px-4 py-3 border-t border-slate-200 text-xs text-slate-600">
        Showing 5 rows (preview)
      </div>
    </div>
  );
}