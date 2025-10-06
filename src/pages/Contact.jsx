import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function Contact() {
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    company: "",
    message: "",
  });
  const [sending, setSending] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const handleChange = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setSubmitted(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.email || !form.message) return;

    setSending(true);
    const subject = encodeURIComponent(`Support request from ${form.name || "QuantPulse user"}`);
    const body = encodeURIComponent(
      `Name: ${form.name || "—"}\nCompany: ${form.company || "—"}\nEmail: ${form.email}\n\nMessage:\n${form.message}`
    );

    window.location.href = `mailto:team@quantpulse.ai?subject=${subject}&body=${body}`;

    setTimeout(() => {
      setSending(false);
      setSubmitted(true);
    }, 300);
  };

  return (
    <div className="min-h-screen py-16 bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <h1 className="text-3xl font-bold"><span className="gradient-text">Contact</span></h1>
        <p className="text-slate-300 text-sm leading-relaxed">
          Reach the QuantPulse team directly. Fill out the form below and we’ll draft an email for you—feel free to add more details before sending.
        </p>

        <form onSubmit={handleSubmit} className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-5 text-sm text-slate-200">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="contact-name" className="text-xs uppercase tracking-wide text-slate-400">Name</label>
              <Input
                id="contact-name"
                placeholder="Jane Quant"
                value={form.name}
                onChange={handleChange("name")}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="contact-company" className="text-xs uppercase tracking-wide text-slate-400">Company / Fund</label>
              <Input
                id="contact-company"
                placeholder="Acme Capital"
                value={form.company}
                onChange={handleChange("company")}
                className="bg-slate-950 border-slate-800"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="contact-email" className="text-xs uppercase tracking-wide text-slate-400">Email *</label>
            <Input
              id="contact-email"
              type="email"
              required
              placeholder="you@firm.com"
              value={form.email}
              onChange={handleChange("email")}
              className="bg-slate-950 border-slate-800"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="contact-message" className="text-xs uppercase tracking-wide text-slate-400">How can we help? *</label>
            <Textarea
              id="contact-message"
              required
              rows={5}
              placeholder="Tell us about your use case, timelines, and data needs."
              value={form.message}
              onChange={handleChange("message")}
              className="bg-slate-950 border-slate-800"
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">We reply within one business day. Never share secrets or API keys.</p>
            <Button type="submit" disabled={sending || !form.email || !form.message} className="bg-blue-600 hover:bg-blue-700 rounded-md">
              {sending ? "Opening email…" : "Send email to support"}
            </Button>
          </div>

          {submitted && (
            <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
              Email draft opened in your client. Add any extra details and hit send when ready.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
