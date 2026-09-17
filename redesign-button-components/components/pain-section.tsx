'use client'

import { ContainerCard } from '@/components/container-card'
import { FadeUp } from '@/components/fade-up'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'

const oldWayItems = [
  {
    title: '2 to 4 Hours per Quote',
    desc: 'Forwarders spend hours manually typing out WhatsApp requests to 10 carriers, waiting for replies, and chasing follow-ups.',
  },
  {
    title: 'Lost Deals to Faster Competitors',
    desc: 'In freight, the first quote with reasonable rates wins 70% of the time. Manual compiling means you are always second.',
  },
  {
    title: 'Disastrous Excel Copy-Paste Mistakes',
    desc: 'Miscalculated THC, wrong currency conversions, or missing demurrage terms discovered after the ship has sailed.',
  },
  {
    title: 'Customs Errors & Demurrage Penalties',
    desc: 'Cargo delayed at the port because weight or HS code mismatches were never caught during initial booking.',
  },
]

const logistricksWayItems = [
  {
    title: 'Quote Sent in Under 30 Minutes',
    desc: 'Inbound message triggers instant simultaneous queries across all your preferred carriers on WhatsApp and Email.',
  },
  {
    title: 'Higher Win Rates on Hot Leads',
    desc: 'Respond while the client is still on WhatsApp. Impress shippers with professional, branded PDF and instant options.',
  },
  {
    title: 'AI Fee Normalization & Margin Guard',
    desc: 'Every surcharge (Ocean Freight, BAF, THC, documentation) parsed, normalized, with your target profit margin auto-applied.',
  },
  {
    title: 'Automated Customs & Document Check',
    desc: 'Pre-clearance document intelligence catches discrepancies before containers arrive at the terminal.',
  },
]

export function PainSection() {
  return (
    <section id="transformation" className="bg-[#FFF7ED] py-24 border-y border-orange-200/50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeUp className="text-center max-w-3xl mx-auto">
          <span className="font-stencil text-xs font-bold text-[#F97316] tracking-widest uppercase">
            THE FREIGHT DESK TRANSFORMATION
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-black text-[#0D1B2A]">
            Still Running on WhatsApp Chaos and Excel Formulas?
          </h2>
          <p className="mt-4 text-base sm:text-lg text-gray-600">
            See the difference when your desk stops chasing rates and starts closing shipments.
          </p>
        </FadeUp>

        <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Column 1: The Old Way */}
          <FadeUp delay={0.1}>
            <ContainerCard
              bolts="dark"
              serial="LEGACY-EXCEL-DESK"
              className="border-2 border-red-200 bg-white p-7 sm:p-8 h-full shadow-md"
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 font-bold">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0D1B2A]">The Manual Way</h3>
                    <p className="text-xs text-red-600 font-semibold">2–4 hours per quote · High Stress</p>
                  </div>
                </div>
                <span className="rounded-full bg-red-100 px-3 py-1 font-stencil text-[11px] font-bold text-red-700">
                  SLOWER
                </span>
              </div>

              <ul className="mt-6 space-y-5">
                {oldWayItems.map((item) => (
                  <li key={item.title} className="flex items-start gap-3 text-sm">
                    <XCircle size={18} className="mt-0.5 shrink-0 text-rose-500" />
                    <div>
                      <strong className="font-semibold text-gray-900 block">{item.title}</strong>
                      <span className="text-gray-600 text-xs leading-relaxed mt-0.5 block">{item.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </ContainerCard>
          </FadeUp>

          {/* Column 2: The Logistricks Way */}
          <FadeUp delay={0.2}>
            <ContainerCard
              bolts="orange"
              serial="LGST-AUTOMATED-DESK"
              sealBadge="AI ENABLED"
              className="border-2 border-[#F97316] bg-[#0D1B2A] text-white p-7 sm:p-8 h-full shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F97316]/20 text-[#F97316] font-bold">
                    <span className="font-stencil text-base">30m</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">The Logistricks Way</h3>
                    <p className="text-xs text-orange-400 font-semibold">Under 30 min · Autonomous AI Flow</p>
                  </div>
                </div>
                <span className="rounded-full bg-[#F97316] px-3 py-1 font-stencil text-[11px] font-bold text-white">
                  3X CLOSING SPEED
                </span>
              </div>

              <ul className="mt-6 space-y-5">
                {logistricksWayItems.map((item) => (
                  <li key={item.title} className="flex items-start gap-3 text-sm">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />
                    <div>
                      <strong className="font-semibold text-white block">{item.title}</strong>
                      <span className="text-slate-300 text-xs leading-relaxed mt-0.5 block">{item.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </ContainerCard>
          </FadeUp>
        </div>
      </div>
    </section>
  )
}
