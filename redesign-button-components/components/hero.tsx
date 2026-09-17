'use client'

import { motion } from 'framer-motion'
import { ArrowRight, MessageCircle, ShieldCheck, Zap } from 'lucide-react'
import { CtaButton } from '@/components/cta-button'
import { HeroBackground } from '@/components/hero-background'
import { HeroQuoteDemo } from '@/components/hero-quote-demo'

const stats = [
  { value: '< 30 min', label: 'Average Quote Time' },
  { value: '94%', label: 'AI Rate Extraction Accuracy' },
  { value: '10+ Car.', label: 'Simultaneous Carrier Query' },
]

export function Hero() {
  return (
    <section
      id="top"
      className="dot-grid relative flex min-h-[92vh] items-center overflow-hidden bg-white pt-24 pb-16"
    >
      <HeroBackground />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: Core Value Proposition & CTAs */}
          <div className="text-left lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-[#F97316]/30 bg-[#FFF7ED] px-3.5 py-1 text-xs font-semibold text-[#F97316]"
            >
              <Zap size={14} className="text-[#F97316]" />
              <span>AI-Powered Freight OS · MENA & Global Trade</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-5 text-4xl font-black tracking-tight text-[#0D1B2A] sm:text-5xl lg:text-6xl leading-[1.08]"
            >
              From Carrier WhatsApp
              <br />
              to Customer Quote.
              <br />
              <span className="text-[#F97316]">In Under 30 Minutes.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-gray-600"
            >
              Logistricks reads incoming quote inquiries from WhatsApp and email,
              blasts your preferred carriers simultaneously, normalizes all hidden fees,
              and generates a branded, profitable quote before your competitors even open their inbox.
            </motion.p>

            {/* Micro feature pills */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-[#0D1B2A]"
            >
              {[
                'WhatsApp & Email Native',
                'Arabic & English NLP',
                'Auto Fee Normalization',
                'Zero Manual Data Entry',
              ].map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-gray-200 bg-gray-50/80 px-3 py-1 text-gray-700 shadow-2xs"
                >
                  {pill}
                </span>
              ))}
            </motion.div>

            {/* CTAs: Demo Modal + Direct WhatsApp Option */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4"
            >
              <CtaButton
                size="lg"
                variant="primary"
                className="group flex-1 sm:flex-initial"
              >
                <span>Book a Free Demo</span>
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-1 shrink-0" />
              </CtaButton>

              <CtaButton
                href="https://wa.me/962799999999?text=Hi%20Osama%2C%20I%20run%20a%20freight%20forwarding%20desk%20and%20want%20to%20see%20how%20Logistricks%20automates%20quotes."
                size="lg"
                variant="emerald"
                className="group flex-1 sm:flex-initial"
              >
                <MessageCircle size={18} className="shrink-0" />
                <span>Chat on WhatsApp</span>
              </CtaButton>
            </motion.div>

            {/* Trust and Privacy guarantees */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-6 flex items-center gap-4 text-xs text-gray-500"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldCheck size={16} className="text-emerald-600" />
                100% Private Carrier Rates
              </span>
              <span className="text-gray-300">·</span>
              <span>2-Week Live Pilot on Your Desk</span>
            </motion.div>

            {/* Quick stats row */}
            <motion.dl
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-8 grid grid-cols-3 gap-4 border-t border-gray-100 pt-6 max-w-lg"
            >
              {stats.map((s) => (
                <div key={s.label}>
                  <dd className="text-xl sm:text-2xl font-black text-[#0D1B2A]">{s.value}</dd>
                  <dt className="mt-0.5 text-xs text-gray-500 font-medium">{s.label}</dt>
                </div>
              ))}
            </motion.dl>
          </div>

          {/* Right Column: Interactive Freight Desk Simulator */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="w-full lg:col-span-5"
          >
            <div className="relative mx-auto max-w-lg lg:max-w-none">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-orange-500/20 to-navy-900/10 blur-xl -z-10" />
              <HeroQuoteDemo />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
