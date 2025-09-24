import React from "react";
import TableSkeleton from "./TableSkeleton";

export default function LoadingOverlay({ variant = "downloads" }) {
  if (variant === "downloads") {
    return (
      <div className="min-h-screen py-8 bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <div className="h-8 w-48 bg-slate-800 rounded-md animate-pulse" />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <TableSkeleton cols={4} rows={5} />
            <TableSkeleton cols={4} rows={5} />
            <TableSkeleton cols={4} rows={5} />
            <TableSkeleton cols={4} rows={5} />
          </div>
        </div>
      </div>
    );
  }
  return null;
}