
import React, { useState } from "react";
import { EmailCapture } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle }
from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Download, Eye, Lock, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import PreviewTable from "@/components/sample/PreviewTable";
import TableSkeleton from "@/components/skeletons/TableSkeleton";

export default function SampleDay() {
  const [email, setEmail] = useState("");
  const [hasAccess, setHasAccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewEmail, setPreviewEmail] = useState("");
  const [previewSubmitting, setPreviewSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  // Check if user already has access (you might want to check localStorage or session)
  React.useEffect(() => {
    const storedAccess = localStorage.getItem('sample_day_access');
    if (storedAccess) {
      setHasAccess(true);
    }
    const t = setTimeout(() => setPageLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    try {
      await EmailCapture.create({
        email,
        source: 'sample_day',
        has_accessed_sample: true
      });
      
      localStorage.setItem('sample_day_access', 'true');
      setHasAccess(true);
    } catch (error) {
      console.error('Error capturing email:', error);
    }
    setIsSubmitting(false);
  };

  // Sample data for previews
  const scoresColumns = ["symbol_id", "date", "pred_proba_up", "pred_return_7d"];
  const scoresRows = [
    { symbol_id: "BTC", date: "2025-08-25", pred_proba_up: 0.812, pred_return_7d: 0.056 },
    { symbol_id: "ETH", date: "2025-08-25", pred_proba_up: 0.774, pred_return_7d: 0.042 },
    { symbol_id: "SOL", date: "2025-08-25", pred_proba_up: 0.752, pred_return_7d: 0.038 },
    { symbol_id: "AVAX", date: "2025-08-25", pred_proba_up: 0.731, pred_return_7d: 0.034 },
    { symbol_id: "NEAR", date: "2025-08-25", pred_proba_up: 0.708, pred_return_7d: 0.029 }
  ];

  const portfolioColumns = ["symbol_id", "allocation_weight", "allocation_weight_vol_targeted"];
  const portfolioRows = [
    { symbol_id: "BTC", allocation_weight: 0.12, allocation_weight_vol_targeted: 0.126 },
    { symbol_id: "ETH", allocation_weight: 0.10, allocation_weight_vol_targeted: 0.098 },
    { symbol_id: "SOL", allocation_weight: 0.08, allocation_weight_vol_targeted: 0.090 },
    { symbol_id: "AVAX", allocation_weight: 0.08, allocation_weight_vol_targeted: 0.082 },
    { symbol_id: "NEAR", allocation_weight: 0.07, allocation_weight_vol_targeted: 0.071 }
  ];

  const equityColumns = ["date", "strategy_equity", "benchmark_equity"];
  const equityRows = Array.from({ length: 5 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (4 - i)); // Adjusted for 5 rows
    return {
      date: d.toISOString().slice(0, 10),
      strategy_equity: (100 + i * 0.6).toFixed(2),
      benchmark_equity: (100 + i * 0.35).toFixed(2),
    };
  });

  const returnsColumns = ["date", "daily_return"];
  const returnsRows = Array.from({ length: 5 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (4 - i)); // Adjusted for 5 rows
    return { date: d.toISOString().slice(0, 10), daily_return: (Math.sin(i/3) * 0.02).toFixed(4) };
  });

  const handlePreviewEmailSubmit = async (e) => {
    e.preventDefault();
    if (!previewEmail) return;
    setPreviewSubmitting(true);
    try {
      await EmailCapture.create({
        email: previewEmail,
        source: "sample_day_preview",
        has_accessed_sample: true
      });
      setPreviewEmail(""); // Clear email on success
    } catch (error) {
      console.error('Error capturing preview email:', error);
    }
    setPreviewSubmitting(false);
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen py-16">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="h-8 w-64 bg-slate-800 rounded-md mb-6 animate-pulse" />
          <div className="grid md:grid-cols-2 gap-6">
            <TableSkeleton cols={4} rows={5} />
            <TableSkeleton cols={4} rows={5} />
            <TableSkeleton cols={3} rows={5} />
            <TableSkeleton cols={2} rows={5} />
          </div>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen py-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-3xl font-bold mb-4">
            Get a <span className="gradient-text">Sample Day</span>
          </h1>
          <p className="text-xl text-slate-300 mb-8">
            See exactly what you'll get with our signal files and analytics. 
            Enter your email to unlock a free sample.
          </p>

          <form onSubmit={handleEmailSubmit} className="max-w-md mx-auto mb-8">
            <div className="flex gap-3">
              <Input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 bg-slate-800 border-slate-600"
                required
              />
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700"
              >
                {isSubmitting ? "Sending..." : "Get Sample"}
              </Button>
            </div>
          </form>

          <div className="glass rounded-xl p-6 text-left max-w-md mx-auto">
            <h3 className="font-semibold mb-4 text-center">What's Included:</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full" />
                <span>Top 5 daily signals with scores and percentiles</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                <span>Sample analytics dashboard (watermarked)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full" />
                <span>Limited performance charts</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-amber-400 rounded-full" />
                <span>Methodology overview</span>
              </div>
            </div>
          </div>

          <p className="text-slate-400 text-sm mt-8">
            No spam, unsubscribe anytime. Just want to show you our alpha signals work.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-4">
            Sample Day: <span className="gradient-text">January 15, 2024</span>
          </h1>
          <p className="text-slate-300 max-w-2xl mx-auto">
            Here's exactly what subscribers get each day. This sample is watermarked and limited—
            full access includes complete data and analytics.
          </p>
        </div>

        {/* Preview Tables */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          <PreviewTable
            title="scores.parquet"
            subtitle="Ranked predictions with probabilities and 7d return estimates"
            columns={scoresColumns}
            rows={scoresRows}
          />
          <PreviewTable
            title="portfolio.csv"
            subtitle="Top-decile daily long basket with vol-targeted weights"
            columns={portfolioColumns}
            rows={portfolioRows}
          />
          <PreviewTable
            title="equity_curve.csv"
            subtitle="Vol-targeted equity curve vs benchmark (index=100)"
            columns={equityColumns}
            rows={equityRows}
          />
          <PreviewTable
            title="daily_returns.csv"
            subtitle="Daily strategy returns for risk analysis"
            columns={returnsColumns}
            rows={returnsRows}
          />
        </div>

        {/* Email capture below previews */}
        <div className="glass rounded-xl p-6 mb-10">
          <h3 className="font-semibold text-lg mb-2 text-center">Email me the full sample</h3>
          <p className="text-slate-400 text-sm text-center mb-4">
            Get a copy of today's sample files delivered to your inbox.
          </p>
          <form onSubmit={handlePreviewEmailSubmit} className="max-w-md mx-auto flex gap-3">
            <Input
              type="email"
              placeholder="Enter your email address"
              value={previewEmail}
              onChange={(e) => setPreviewEmail(e.target.value)}
              className="bg-slate-800 border-slate-600 flex-1"
              required
            />
            <Button 
              type="submit" 
              disabled={previewSubmitting}
              className="bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700"
            >
              {previewSubmitting ? "Sending..." : "Send Sample"}
            </Button>
          </form>
        </div>

        {/* CTA */}
        <div className="text-center">
          <div className="glass rounded-2xl p-8 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">
              Ready for the <span className="gradient-text">Full Experience?</span>
            </h2>
            <p className="text-slate-300 mb-6">
              This sample shows you just a taste. Subscribers get complete signal files, 
              full analytics, historical data, and daily updates.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to={createPageUrl("Pricing")}>
                <Button className="bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 px-8">
                  Subscribe Now
                </Button>
              </Link>
              <Link to={createPageUrl("Home")}>
                <Button variant="outline" className="bg-white text-slate-900 border-slate-300 hover:bg-slate-100">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
