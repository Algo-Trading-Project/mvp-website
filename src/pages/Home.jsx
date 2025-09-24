import React from "react";
import HeroSection from "../components/landing/HeroSection";
import ProofSection from "../components/landing/ProofSection";
import HowItWorksSection from "../components/landing/HowItWorksSection";
import CTASection from "../components/landing/CTASection";
import ProductSection from "../components/landing/ProductSection";

export default function Home() {
  return (
    <div className="flex flex-col">
      <main className="flex-grow">
        <HeroSection />
        <ProofSection />
        <ProductSection />
        <HowItWorksSection />
        <CTASection />
      </main>
    </div>
  );
}