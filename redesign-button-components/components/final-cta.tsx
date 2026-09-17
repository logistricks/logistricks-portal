import { CtaButton } from '@/components/cta-button'
import { FadeUp } from '@/components/fade-up'

function BigShip() {
  return (
    <svg
      width="600"
      viewBox="0 0 420 150"
      fill="currentColor"
      aria-hidden
      className="anim-ship-slow absolute bottom-[18%] left-0 text-[#F97316] opacity-[0.04]"
    >
      <rect x="120" y="46" width="52" height="34" />
      <rect x="176" y="46" width="52" height="34" />
      <rect x="232" y="46" width="52" height="34" />
      <rect x="288" y="52" width="40" height="28" />
      <rect x="96" y="30" width="20" height="50" />
      <path d="M40 84 H392 L360 126 H84 Q60 126 52 112 Z" />
    </svg>
  )
}

export function FinalCta() {
  return (
    <section
      id="contact"
      className="relative overflow-hidden bg-[#0D1B2A] py-32"
    >
      <BigShip />

      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6">
        <FadeUp>
          <h2 className="text-4xl font-black text-white md:text-5xl">
            Stop Chasing Carrier Rates.
          </h2>
          <p className="mt-4 text-2xl font-bold text-[#F97316]">
            Start winning more shipments.
          </p>
        </FadeUp>

        <FadeUp delay={0.15}>
          <div className="mt-10">
            <CtaButton size="xl" variant="primary">
              Book a Free Demo
            </CtaButton>
          </div>
          <p className="mt-6 text-sm text-slate-400">
            Free 2-week pilot · No credit card required · Live in 3 days
          </p>
        </FadeUp>
      </div>
    </section>
  )
}
