import React from "react";
import { createClient } from "@supabase/supabase-js";
import { createPageUrl } from "@/utils";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/api/config";

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export default function AuthCallback() {
  React.useEffect(() => {
    if (!supabase) {
      window.location.replace(createPageUrl("GetStarted"));
      return;
    }
    const finalize = async () => {
      try {
        await supabase.auth.getSession();
      } finally {
        window.location.replace(createPageUrl("Dashboard?tab=regression"));
      }
    };
    finalize();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
      <div className="text-sm bg-slate-900/70 border border-slate-800 px-6 py-4 rounded-lg">
        Finishing sign-in…
      </div>
    </div>
  );
}

