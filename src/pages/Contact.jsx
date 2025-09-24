import React, { useState } from "react";
import { ContactSubmission } from "@/api/entities";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await ContactSubmission.create(form);
    setSubmitting(false);
    setSuccess(true);
    setForm({ name: "", email: "", subject: "", message: "" });
  };

  return (
    <div className="min-h-screen py-16 bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-6"><span className="gradient-text">Contact Us</span></h1>
        <p className="text-slate-300 mb-8">
          Have a question or request? Send us a message and we'll get back to you.
        </p>
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-md p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input name="name" placeholder="Name" value={form.name} onChange={handleChange} className="bg-slate-800 border-slate-700" />
            <Input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} className="bg-slate-800 border-slate-700" required />
          </div>
          <Input name="subject" placeholder="Subject" value={form.subject} onChange={handleChange} className="bg-slate-800 border-slate-700" />
          <Textarea name="message" placeholder="Message" value={form.message} onChange={handleChange} className="bg-slate-800 border-slate-700 h-40" required />
          <div className="flex justify-end">
            <Button disabled={submitting} className="bg-blue-600 hover:bg-blue-700 rounded-md">
              {submitting ? "Sending..." : "Send Message"}
            </Button>
          </div>
          {success && <div className="text-emerald-400 text-sm">Thanks! Your message has been received.</div>}
        </form>
      </div>
    </div>
  );
}