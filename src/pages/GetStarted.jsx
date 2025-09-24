
import React, { useMemo } from "react";
import { User } from "@/api/entities";
import { createPageUrl } from "@/utils";
import { ArrowRight, Shield, LogIn } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.1 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.1-.1-2.1-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.9C14.3 16.7 18.8 14 24 14c3 0 5.7 1.1 7.8 3l5.7-5.7C34.1 6 29.3 4 24 4 16.1 4 9.2 8.5 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.1 0 9.9-1.9 13.4-5.1l-6.2-5.2C29 35.4 26.6 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5.1C9.2 39.5 16.1 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1 2.9-3.3 5.2-6.1 6.6l6.2 5.2C38.9 36.7 44 31.1 44 24c0-1.1-.1-2.1-.4-3.5z"/>
    </svg>
  );
}

export default function GetStarted() {
  const signupCallback = React.useMemo(() => {
    return window.location.origin + createPageUrl("Pricing");
  }, []);
  const loginCallback = React.useMemo(() => {
    return window.location.origin + createPageUrl("Dashboard");
  }, []);

  const handleSignUp = async () => {
    await User.loginWithRedirect(signupCallback);
  };

  const handleLogin = async () => {
    await User.loginWithRedirect(loginCallback);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-14">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Get started</h1>
          <p className="text-slate-400 mt-2">
            Continue with Google to create your account and access the Dashboard.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-md p-6 md:p-8">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Left: Sign-in */}
            <div>
              <h2 className="text-lg font-semibold mb-2">Secure sign-in</h2>
              <p className="text-slate-400 text-sm mb-5">
                We use Google for authentication. No passwords needed.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleSignUp}
                  className="rounded-md h-10 px-4 bg-blue-600 hover:bg-blue-700"
                >
                  <span className="flex items-center gap-2">
                    <GoogleIcon />
                    <span>Continue with Google</span>
                  </span>
                </Button>
                <Button
                  onClick={handleLogin}
                  className="rounded-md h-10 px-4 bg-white text-slate-900 border border-slate-300 hover:bg-slate-100"
                  variant="outline"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Log in
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-4">
                By continuing, you agree to our{" "}
                <Link to={createPageUrl("Docs")} className="underline hover:text-slate-300">
                  terms and documentation
                </Link>.
              </p>
            </div>

            {/* Right: What happens next */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                What happens next?
              </h3>
              <ol className="list-decimal list-inside text-slate-300 space-y-2 text-sm">
                <li>Authenticate with Google</li>
                <li>Choose your plan and confirm</li>
                <li>Access Dashboard and downloads</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="mt-8 text-slate-500 text-sm">
          Need help? Use the feedback button or contact support.
        </div>
      </div>
    </div>
  );
}
