import React from "react";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function AuthOverlay({ mode = "auth", title, message }) {
  const isUpgrade = mode === "upgrade";
  const titleText = title || "Unlock this section";
  const messageText =
    message ||
    (isUpgrade
      ? "Upgrade your plan to access OOS & EDA, Regime & Analytics, and Performance."
      : "Sign in and upgrade to access OOS & EDA, Regime & Analytics, and Performance.");

  return (
    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex items-start justify-center z-10 pt-16 md:pt-20">
      <div className="text-center p-6 bg-slate-900/85 border border-slate-800 rounded-md max-w-md shadow-xl">
        <div className="mx-auto w-12 h-12 rounded-md bg-slate-800 flex items-center justify-center mb-3">
          <Lock className="w-6 h-6 text-slate-300" />
        </div>
        <h4 className="text-lg font-semibold mb-2">{titleText}</h4>
        <p className="text-slate-400 text-sm mb-4">
          {messageText}
        </p>
        <div className="flex gap-3 justify-center">
          {!isUpgrade && (
            <Link to={createPageUrl("GetStarted")}>
              <Button className="bg-blue-600 hover:bg-blue-700 rounded-md">Sign In</Button>
            </Link>
          )}
          <Link to={createPageUrl("Pricing")}>
            <Button variant="outline" className="rounded-md border-slate-300 bg-white text-slate-900 hover:bg-slate-100">
              View Plans
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}