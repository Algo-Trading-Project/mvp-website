import React from "react";
import HeroSection from "../components/landing/HeroSection";
import QuickstartSection from "../components/landing/QuickstartSection";
import ProofSection from "../components/landing/ProofSection";
import SocialProofSection from "../components/landing/SocialProofSection";
import WhyDifferentSection from "../components/landing/WhyDifferentSection";
import HowItWorksSection from "../components/landing/HowItWorksSection";
import CTASection from "../components/landing/CTASection";
import ProductSection from "../components/landing/ProductSection";
import WaitlistSection from "../components/landing/WaitlistSection";

export default function Home() {
  return (
    <div className="flex flex-col">
      <main className="flex-grow">
        <HeroSection />
        <QuickstartSection />
        <ProofSection />
        <SocialProofSection />
        <WhyDifferentSection />
        <ProductSection />
        <WaitlistSection />
        <HowItWorksSection />
        <CTASection />
      </main>
    </div>
  );
}
