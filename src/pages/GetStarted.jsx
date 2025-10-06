
import React from "react";
import { User } from "@/api/entities";
import { createPageUrl } from "@/utils";
import { LogIn, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function GetStarted() {
  const [signUpForm, setSignUpForm] = React.useState({ email: "", password: "" });
  const [loginForm, setLoginForm] = React.useState({ email: "", password: "" });
  const [signUpLoading, setSignUpLoading] = React.useState(false);
  const [signUpError, setSignUpError] = React.useState(null);
  const [signUpSuccess, setSignUpSuccess] = React.useState(false);
  const [loginLoading, setLoginLoading] = React.useState(false);
  const [loginError, setLoginError] = React.useState(null);
  const [resetEmail, setResetEmail] = React.useState("");
  const [resetLoading, setResetLoading] = React.useState(false);
  const [resetError, setResetError] = React.useState(null);
  const [resetSuccess, setResetSuccess] = React.useState(false);

  const handleSignUp = async (e) => {
    e.preventDefault();
    setSignUpLoading(true);
    setSignUpError(null);
    try {
      await User.signUp({ email: signUpForm.email, password: signUpForm.password });
      setSignUpSuccess(true);
      setSignUpForm({ email: "", password: "" });
    } catch (error) {
      setSignUpError(error?.message || "Unable to sign up");
    } finally {
      setSignUpLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      await User.signIn({ email: loginForm.email, password: loginForm.password });
      window.location.replace(createPageUrl("Dashboard?tab=regression"));
    } catch (error) {
      setLoginError(error?.message || "Unable to login");
    } finally {
      setLoginLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError(null);
    setResetSuccess(false);
    try {
      await User.resetPassword(resetEmail);
      setResetSuccess(true);
    } catch (error) {
      setResetError(error?.message || "Unable to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-5xl space-y-10">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold">Get started</h1>
          <p className="text-slate-400 text-sm md:text-base max-w-2xl mx-auto">
            Create an account or log in with your email to access the dashboard, API, and daily downloads.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
              <Mail className="w-4 h-4 text-blue-400" />
              Create an account
            </div>
            <p className="text-xs text-slate-400 mb-4">
              We’ll email a verification link. Click it to activate your account, then you’ll be redirected to the dashboard.
            </p>
            <form onSubmit={handleSignUp} className="space-y-4">
              <Input
                type="email"
                required
                placeholder="you@firm.com"
                value={signUpForm.email}
                onChange={(e) => {
                  setSignUpForm({ ...signUpForm, email: e.target.value });
                  setSignUpError(null);
                  setSignUpSuccess(false);
                }}
                className="bg-slate-800 border border-slate-700"
              />
              <Input
                type="password"
                required
                placeholder="Create a password"
                value={signUpForm.password}
                onChange={(e) => {
                  setSignUpForm({ ...signUpForm, password: e.target.value });
                  setSignUpError(null);
                  setSignUpSuccess(false);
                }}
                className="bg-slate-800 border border-slate-700"
              />
              {signUpError ? (
                <div className="text-xs text-red-400">{signUpError}</div>
              ) : null}
              {signUpSuccess ? (
                <div className="flex items-start gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 mt-[2px]" />
                  <span>
                    Confirmation link sent to your inbox. Open the email to verify and you’ll be taken directly to the regression dashboard.
                  </span>
                </div>
              ) : null}
              <Button
                type="submit"
                disabled={signUpLoading}
                className="rounded-md h-10 px-4 bg-blue-600 hover:bg-blue-700 w-full"
              >
                {signUpLoading ? "Sending link…" : "Send verification email"}
              </Button>
            </form>
          </div>

            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <LogIn className="w-4 h-4 text-emerald-400" />
                Login
              </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                type="email"
                required
                placeholder="you@firm.com"
                value={loginForm.email}
                onChange={(e) => {
                  setLoginForm({ ...loginForm, email: e.target.value });
                  setLoginError(null);
                }}
                className="bg-slate-800 border border-slate-700"
              />
              <Input
                type="password"
                required
                placeholder="Password"
                value={loginForm.password}
                onChange={(e) => {
                  setLoginForm({ ...loginForm, password: e.target.value });
                  setLoginError(null);
                }}
                className="bg-slate-800 border border-slate-700"
              />
              {loginError ? (
                <div className="text-xs text-red-400">{loginError}</div>
              ) : null}
              <Button
                type="submit"
                disabled={loginLoading}
                className="rounded-md h-10 px-4 bg-slate-200 text-slate-900 border border-slate-400 hover:bg-slate-100 w-full"
              >
                {loginLoading ? "Signing in…" : "Log in"}
              </Button>
            </form>
              <Dialog>
                <DialogTrigger asChild>
                  <button className="text-xs text-blue-400 hover:text-blue-300">Forgot Password?</button>
                </DialogTrigger>
                <DialogContent className="bg-slate-900 border border-slate-800 text-white">
                  <DialogHeader>
                    <DialogTitle>Reset your password</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      Enter the email address associated with your account. We’ll send you a secure link to create a new password.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handlePasswordReset} className="space-y-4">
                    <Input
                      type="email"
                      required
                      placeholder="you@firm.com"
                      value={resetEmail}
                      onChange={(e) => {
                        setResetEmail(e.target.value);
                        setResetError(null);
                        setResetSuccess(false);
                      }}
                      className="bg-slate-800 border border-slate-700"
                    />
                    {resetError ? <div className="text-xs text-red-400">{resetError}</div> : null}
                    {resetSuccess ? <div className="text-xs text-emerald-300">Reset link sent. Check your inbox.</div> : null}
                    <Button
                      type="submit"
                      disabled={resetLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 rounded-md"
                    >
                      {resetLoading ? "Sending…" : "Send reset link"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

        <div className="text-center text-slate-500 text-sm">
          Need help? Use the feedback button or <a className="underline" href="mailto:team@quantpulse.ai">contact support</a>.
        </div>
      </div>
    </div>
  );
}
