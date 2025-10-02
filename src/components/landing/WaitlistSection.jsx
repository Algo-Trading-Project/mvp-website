import React, { useState } from "react";
import { EmailCapture } from "@/api/entities";
import { Button } from "@/components/ui/button";

export default function WaitlistSection() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      await EmailCapture.create({ email, source: "api_waitlist" });
      setDone(true);
    } catch (e) {
      console.error("waitlist", e);
    }
    setSubmitting(false);
  };

  return (
    <section className="py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2">Join the API Waitlist</h2>
          <p className="text-slate-300 text-sm mb-4">Get notified when API access opens and receive early documentation updates.</p>
          {done ? (
            <div className="text-emerald-400 text-sm">Thanks — you’re on the list. We’ll email you at {email}.</div>
          ) : (
            <form onSubmit={submit} className="flex gap-3">
              <input
                type="email"
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
                required
                placeholder="you@firm.com"
                className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white"
              />
              <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 rounded-md">
                {submitting ? 'Adding...' : 'Join Waitlist'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

