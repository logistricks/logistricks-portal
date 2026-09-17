'use client'

import { motion } from 'framer-motion'
import { Check, FileCheck, MessageSquare, Send } from 'lucide-react'
import { CtaButton } from '@/components/cta-button'
import { FadeUp } from '@/components/fade-up'

const steps = [
  {
    n: '1',
    icon: MessageSquare,
    title: 'Request Arrives',
    body: 'A shipment inquiry comes in via WhatsApp or email. Logistricks reads it and extracts every detail automatically.',
  },
  {
    n: '2',
    icon: Send,
    title: 'All Carriers Contacted',
    body: 'Rate requests fire out to your entire carrier network simultaneously — their WhatsApp, their email, every carrier at once.',
  },
  {
    n: '3',
    icon: FileCheck,
    title: 'Quote Ready',
    body: 'Responses parsed automatically regardless of format. A professional quote is waiting for your approval in minutes.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeUp className="text-center">
          <h2 className="text-4xl font-black text-[#0D1B2A]">
            Three Steps. One Platform.
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            Logistricks handles the entire workflow from inbound inquiry to
            outgoing quote.
          </p>
        </FadeUp>

        <div className="relative mt-16">
          {/* Animated dashed connector — desktop only */}
          <svg
            aria-hidden
            className="absolute left-0 right-0 top-7 hidden h-2 w-full md:block"
            preserveAspectRatio="none"
            viewBox="0 0 100 2"
          >
            <motion.line
              x1="16"
              y1="1"
              x2="84"
              y2="1"
              stroke="#F97316"
              strokeWidth="0.5"
              strokeDasharray="2 1.5"
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />
          </svg>

          <div className="relative grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-6">
            {steps.map((s, i) => {
              const Icon = s.icon
              return (
                <FadeUp
                  key={s.n}
                  delay={i * 0.15}
                  className="flex flex-col items-center text-center"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F97316] text-xl font-black text-white shadow-lg shadow-orange-500/30">
                    {s.n}
                  </div>
                  <Icon size={28} className="mt-5 text-[#F97316]" />
                  <h3 className="mt-3 text-lg font-bold text-[#0D1B2A]">
                    {s.title}
                  </h3>
                  <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray-500">
                    {s.body}
                  </p>
                </FadeUp>
              )
            })}
          </div>
        </div>

        <FadeUp delay={0.2} className="mt-16 text-center">
          <p className="mx-auto max-w-2xl text-base font-semibold text-[#0D1B2A]">
            And the quote is only the beginning.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-gray-500">
            Every shipment flows straight into a live operations dashboard —
            real-time tracking with branded links for your clients, document
            management that flags customs mismatches before they cost you,
            carrier performance analytics built from your own history, and
            automated invoice reconciliation that catches overcharges before you
            pay. Logistricks runs the entire freight desk, not just the first
            reply.
          </p>

          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              'Live quote & deal dashboard',
              'End-to-end shipment tracking',
              'Document management',
              'Carrier performance analytics',
              'Invoice reconciliation',
              'Client update automation',
            ].map((f) => (
              <div
                key={f}
                className="flex items-center gap-2 rounded-[6px] border border-[#E5E7EB] bg-[#FFF7ED] px-3 py-2.5 text-left text-sm font-medium text-[#0D1B2A]"
              >
                <Check size={16} className="shrink-0 text-[#F97316]" />
                {f}
              </div>
            ))}
          </div>

          <div className="mt-10">
            <CtaButton size="lg">Book a Free Demo</CtaButton>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}
