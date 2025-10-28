import HeroSection from "../components/landing/HeroSection";
import ProofSection from "../components/landing/ProofSection";
import WhyDifferentSection from "../components/landing/WhyDifferentSection";
import HowItWorksSection from "../components/landing/HowItWorksSection";
import CTASection from "../components/landing/CTASection";
import ProductSection from "../components/landing/ProductSection";
import TrustSection from "../components/landing/TrustSection";
import PerformancePreviewSection from "../components/landing/PerformancePreviewSection";
import PricingTeaserSection from "../components/landing/PricingTeaserSection";

export default function Home() {
  return (
    <div className="flex flex-col">
      <main className="flex-grow">
        <HeroSection />
        <TrustSection />
        <PerformancePreviewSection />
        <ProductSection />
        <WhyDifferentSection />
        <HowItWorksSection />
        <PricingTeaserSection />
        <CTASection />
      </main>
    </div>
  );
}
