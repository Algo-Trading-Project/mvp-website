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
  const [mode, setMode] = React.useState("loading");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!supabase) {
      window.location.replace(createPageUrl("GetStarted"));
      return;
    }
    const hash = window.location.hash ? window.location.hash.substring(1) : "";
    const params = new URLSearchParams(hash);
    const type = params.get("type");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    const clearHash = () => {
      if (window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };

    const handleRecovery = async () => {
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
      clearHash();
      setMode("recovery");
    };

    const finalize = async () => {
      try {
        await supabase.auth.getSession();
      } finally {
        window.location.replace(createPageUrl("Dashboard?tab=regression"));
      }
    };

    if (type === "recovery") {
      handleRecovery();
    } else {
      finalize();
    }
  }, []);

  const handleUpdatePassword = async (event) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || "Unable to update password");
        setSubmitting(false);
        return;
      }
      window.location.replace(createPageUrl("Dashboard?tab=regression"));
    } catch (err) {
      setError(err?.message || "Unable to update password");
      setSubmitting(false);
    }
  };

  if (mode === "recovery") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
        <form onSubmit={handleUpdatePassword} className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 space-y-4 w-full max-w-md">
          <h1 className="text-xl font-semibold">Reset password</h1>
          <p className="text-sm text-slate-400">Create a new password to finish signing in.</p>
          <div className="space-y-2">
            <label className="text-xs text-slate-400">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </div>
          {error ? <div className="text-xs text-red-400">{error}</div> : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-blue-600 hover:bg-blue-700 py-2 text-sm font-semibold"
          >
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
      <div className="text-sm bg-slate-900/70 border border-slate-800 px-6 py-4 rounded-lg">
        Finishing sign-in…
      </div>
    </div>
  );
}
