import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function CTASection() {
  return (
    <section className="py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="glass rounded-2xl p-8 md:p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            See The Edge <span className="gradient-text">In Minutes</span>
          </h2>
          <p className="text-slate-300 text-lg mb-8 max-w-2xl mx-auto">
            Live, auditable performance. Inspect rolling IC, spreads, and various visualizations—then choose the plan that fits you best.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={createPageUrl("Pricing")}>
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white px-8 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group"
              >
                View Plans
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
              </Button>
            </Link>
            <Link to={createPageUrl("Dashboard?tab=regression")}>
              <Button 
                size="lg"
                className="bg-white text-slate-900 hover:bg-slate-100 border border-slate-200 px-8 py-4 text-lg font-semibold rounded-xl"
              >
                View Performance
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
