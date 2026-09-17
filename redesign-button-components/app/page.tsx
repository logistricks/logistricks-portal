import { DemoModalProvider } from '@/components/demo-modal'
import { Navbar } from '@/components/navbar'
import { Hero } from '@/components/hero'
import { FounderCredibility } from '@/components/founder-credibility'
import { PainSection } from '@/components/pain-section'
import { HowItWorks } from '@/components/how-it-works'
import { RoiCalculator } from '@/components/roi-calculator'
import { Modules } from '@/components/modules'
import { Stats } from '@/components/stats'
import { Pricing } from '@/components/pricing'
import { FinalCta } from '@/components/final-cta'
import { Footer } from '@/components/footer'

export default function Page() {
  return (
    <DemoModalProvider>
      <Navbar />
      <main>
        <Hero />
        <FounderCredibility />
        <PainSection />
        <HowItWorks />
        <RoiCalculator />
        <Modules />
        <Stats />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </DemoModalProvider>
  )
}
