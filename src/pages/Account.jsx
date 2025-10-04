
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User as UserIcon, KeyRound, CreditCard, LogIn, Loader2, Copy, ShieldAlert } from 'lucide-react';
import { User } from '@/api/entities';
import { Navigate, useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import AccountPageSkeleton from "@/components/skeletons/AccountPageSkeleton";

export default function Account() {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // New states for preferences and API key
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [productUpdates, setProductUpdates] = useState(true);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    const checkUser = async () => {
      setLoading(true);
      try {
        const me = await User.me();
        setUser(me);
        // derive subscription from user.subscription_level if available
        if (me?.subscription_level && me.subscription_level !== "free") {
          setSubscription({
            plan: me.subscription_level,
            status: "active",
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        } else {
          setSubscription(null);
        }
      } catch (e) {
        setUser(null);
        setSubscription(null);
      }
      setLoading(false);
    };
    checkUser();
  }, []);
  
  if (loading) {
    return <AccountPageSkeleton />;
  }

  if (!user) {
    return (
      <div className="min-h-screen py-16 bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl font-bold mb-4">My <span className="gradient-text">Account</span></h1>
          <p className="text-slate-400 mb-6">You’re not signed in. Sign in to manage your account and subscription.</p>
          <Link to={createPageUrl("GetStarted")}>
            <Button className="bg-blue-600 hover:bg-blue-700 rounded-md">
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 bg-slate-950">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-4 lg:px-6">
        <h1 className="text-3xl font-bold mb-8">
          My <span className="gradient-text">Account</span>
        </h1>
        <div className="grid gap-8 md:grid-cols-2">
          {/* Profile card */}
          <div className="bg-slate-900 border border-slate-800 rounded-md">
            <div className="p-6 border-b border-slate-800">
              <h3 className="flex items-center space-x-2 font-semibold">
                <UserIcon className="w-5 h-5 text-blue-400" />
                <span>Profile</span>
              </h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm text-slate-400">Name</Label>
                  <p className="font-semibold text-lg">{user.full_name || user.email}</p>
                </div>
                <div>
                  <Label className="text-sm text-slate-400">Email</Label>
                  <p className="font-semibold text-lg">{user.email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Subscription card */}
          <div className="bg-slate-900 border border-slate-800 rounded-md">
            <div className="p-6 border-b border-slate-800">
              <h3 className="flex items-center space-x-2 font-semibold">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Subscription</span>
              </h3>
            </div>
            <div className="p-6">
              {subscription ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-slate-400">Plan</Label>
                    <p className="font-semibold text-lg capitalize">{subscription.plan}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400">Status</Label>
                    <p className="font-semibold text-emerald-400 capitalize">{subscription.status}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400">Next Renewal</Label>
                    <p className="font-semibold">{new Date(subscription.current_period_end).toLocaleDateString()}</p>
                  </div>
                  <Button className="bg-blue-600 hover:bg-blue-700 mt-2 rounded-md" onClick={() => navigate(createPageUrl('Pricing'))}>
                    Manage Billing
                  </Button>
                </div>
              ) : (
                 <div className="text-center">
                    <p className="text-slate-400 mb-4">You don't have an active subscription.</p>
                    <Button onClick={() => navigate(createPageUrl('Pricing'))} className="rounded-md">View Plans</Button>
                 </div>
              )}
            </div>
          </div>

          {/* API Access with modal */}
          <div className="bg-slate-900 border border-slate-800 rounded-md md:col-span-2">
            <div className="p-6 border-b border-slate-800">
              <h3 className="flex items-center space-x-2 font-semibold">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <span>API Access</span>
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-400">
                API access is available on Pro and Desk plans. Use your key to download signals programmatically.
              </p>

              <div className="p-3 bg-slate-950 rounded-md flex items-center justify-between border border-slate-700">
                <span className="font-mono text-slate-500">
                  {apiKey || "No key generated"}
                </span>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md border-slate-700 bg-white text-slate-900 hover:bg-slate-100"
                    >
                      Generate New Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-900 border border-slate-700 text-white">
                    <DialogHeader>
                      <DialogTitle>Generate a new API key</DialogTitle>
                      <DialogDescription className="text-slate-400">
                        API key generation will be available soon. Contact support if you need credentials provisioned.
                      </DialogDescription>
                    </DialogHeader>
                  </DialogContent>
                </Dialog>
              </div>

              <Link to={createPageUrl('Contact')} className="text-blue-400 hover:text-blue-300 text-sm">
                Request API documentation
              </Link>
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-slate-900 border border-slate-800 rounded-md md:col-span-2">
            <div className="p-6 border-b border-slate-800">
              <h3 className="font-semibold">Preferences</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="marketing" className="text-slate-200">Marketing emails</Label>
                  <p className="text-xs text-slate-400">Receive occasional updates, promotions, and news.</p>
                </div>
                <Switch
                  id="marketing"
                  checked={marketingOptIn}
                  onCheckedChange={(v) => {
                    setMarketingOptIn(v);
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="weekly" className="text-slate-200">Weekly summary</Label>
                  <p className="text-xs text-slate-400">Get a weekly digest of performance and signals.</p>
                </div>
                <Switch id="weekly" checked={weeklySummary} onCheckedChange={setWeeklySummary} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="product" className="text-slate-200">Product updates</Label>
                  <p className="text-xs text-slate-400">Be notified of new features and improvements.</p>
                </div>
                <Switch id="product" checked={productUpdates} onCheckedChange={setProductUpdates} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
