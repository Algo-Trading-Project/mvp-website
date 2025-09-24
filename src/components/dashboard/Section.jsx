import React from "react";
import { cn } from "@/lib/utils";

export default function Section({ title, subtitle, rightSlot, children, className }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={cn("bg-slate-900 border border-slate-800 rounded-md", className)}>
      <div className="p-4 border-b border-slate-800 flex items-start md:items-center justify-between gap-3">
        <div>
          <h3 className="text-base md:text-lg font-semibold">{title}</h3>
          {subtitle && <p className="text-xs md:text-sm text-slate-400 mt-1">{subtitle}</p>}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
      <div className={`p-4 md:p-6 transition-opacity duration-300 ease-out ${visible ? "opacity-100" : "opacity-0"}`}>
        {children}
      </div>
    </div>
  );
}