import { Check, Plus, Sparkles } from 'lucide-react'
import { ContainerCard } from '@/components/container-card'
import { CtaButton } from '@/components/cta-button'
import { FadeUp } from '@/components/fade-up'
import { cn } from '@/lib/utils'

type Plan = {
  badge: string
  price: string
  serial: string
  features: string[]
  cardClass: string
  bolts: 'navy' | 'white' | 'orange'
  textMuted: string
  checkClass: string
  badgeClass: string
  cta: React.ReactNode
  popular?: boolean
}

const plans: Plan[] = [
  {
    badge: 'STARTER',
    price: '$179',
    serial: 'LGST-TIER-STARTER',
    features: [
      'Up to 75 quotes/month',
      'Up to 6 carriers per quote',
      '1 WhatsApp inbox integration',
      'Human approval on all quotes',
      'Quote pipeline dashboard',
      'Standard email support',
    ],
    cardClass: 'border-2 border-[#0D1B2A] bg-white text-[#0D1B2A]',
    bolts: 'navy',
    textMuted: 'text-gray-600',
    checkClass: 'text-[#F97316]',
    badgeClass: 'text-[#0D1B2A]',
    cta: (
      <CtaButton variant="outline-orange" fullWidth>
        Book a Free Demo
      </CtaButton>
    ),
  },
  {
    badge: 'MOST POPULAR',
    price: '$399',
    serial: 'LGST-TIER-GROWTH',
    features: [
      'Up to 250 quotes/month',
      'Up to 12 carriers per quote',
      'Analytics & win/loss tracking',
      'Custom branded PDF quotes',
      'Document Intelligence included',
      'Priority WhatsApp onboarding',
    ],
    cardClass: 'bg-[#F97316] text-white',
    bolts: 'white',
    textMuted: 'text-white/90',
    checkClass: 'text-white',
    badgeClass: 'bg-white text-[#F97316]',
    popular: true,
    cta: (
      <CtaButton variant="white" fullWidth>
        Book a Free Demo
      </CtaButton>
    ),
  },
  {
    badge: 'BUSINESS',
    price: '$799',
    serial: 'LGST-TIER-ENTERPRISE',
    features: [
      'Up to 600 quotes/month',
      'Unlimited carriers query',
      'Multi-seat & branch offices',
      'Shipment Tracking included',
      'Carrier Performance included',
      'Dedicated logistics engineer',
    ],
    cardClass: 'bg-[#0D1B2A] text-white',
    bolts: 'orange',
    textMuted: 'text-slate-300',
    checkClass: 'text-[#F97316]',
    badgeClass: 'text-white',
    cta: (
      <CtaButton variant="primary" fullWidth>
        Book a Free Demo
      </CtaButton>
    ),
  },
]

const addOns = [
  {
    name: 'Document Intelligence',
    price: '+$79/mo',
    desc: 'Route document checklists, bill of lading & commercial invoice cross-checks to prevent customs fines.',
  },
  {
    name: 'End-to-End Shipment Tracking',
    price: '+$99/mo',
    desc: 'Live tracking portal with white-label client links (your domain & branding, not ours).',
  },
  {
    name: 'Carrier Performance Analytics',
    price: '+$89/mo',
    desc: 'Historical lane benchmarks, real carrier on-time records, and rollover dispute tracking.',
  },
  {
    name: 'Automated Invoice Reconciliation',
    price: '+$99/mo',
    desc: 'Flag line-item discrepancies between carrier final invoices and initial spot quotes before paying.',
  },
  {
    name: 'Client WhatsApp Gateway',
    price: '+$129/mo',
    desc: 'Automated 24/7 AI conversational status updates for your shippers in Arabic and English.',
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeUp className="text-center">
          <span className="font-stencil text-xs font-bold text-[#F97316] tracking-widest uppercase">
            TRANSPARENT TIERED PRICING
          </span>
          <h2 className="mt-3 text-4xl font-black text-[#0D1B2A]">
            Simple Pricing. Built for Freight Forwarders.
          </h2>
          <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
            Start with a free 2-week pilot. Connect your own carriers. Live on your desk in 3 days.
          </p>
        </FadeUp>

        {/* 3 Core Tier Cards */}
        <div className="mt-14 grid grid-cols-1 items-center gap-6 md:grid-cols-3">
          {plans.map((p, i) => (
            <FadeUp key={p.badge} delay={i * 0.1} className="h-full">
              <ContainerCard
                bolts={p.bolts}
                serial={p.serial}
                sealBadge={p.popular ? 'RECOMMENDED' : undefined}
                className={cn(
                  'h-full p-8',
                  p.cardClass,
                  p.popular && 'md:scale-105 shadow-2xl',
                )}
              >
                <span
                  className={cn(
                    'w-fit text-xs font-bold tracking-widest',
                    p.popular
                      ? 'inline-flex items-center rounded-full px-3 py-1'
                      : '',
                    p.badgeClass,
                  )}
                >
                  {p.badge}
                </span>

                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl font-black">{p.price}</span>
                  <span className={cn('mb-1 text-sm', p.textMuted)}>
                    /month
                  </span>
                </div>

                <hr
                  className={cn(
                    'my-6 border-t',
                    p.popular ? 'border-white/30' : 'border-[#E5E7EB]',
                    p.badge === 'BUSINESS' && 'border-white/15',
                  )}
                />

                <ul className="flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        size={18}
                        className={cn('mt-0.5 shrink-0', p.checkClass)}
                      />
                      <span className={cn('text-sm', p.textMuted)}>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">{p.cta}</div>
              </ContainerCard>
            </FadeUp>
          ))}
        </div>

        {/* Modular Operational Add-ons Section */}
        <FadeUp delay={0.25} className="mt-20">
          <div className="rounded-xl border border-gray-200 bg-[#FFFBF7] p-8">
            <div className="text-center max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-0.5 text-xs font-bold text-orange-800">
                <Plus size={13} />
                <span>A LA CARTE OPERATIONAL MODULES</span>
              </div>
              <h3 className="mt-2 text-2xl font-black text-[#0D1B2A]">
                Scale Your Freight Desk With Modular Add-Ons
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Start with core AI rate collection. Add deep operational intelligence as your volume expands.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {addOns.map((add) => (
                <div
                  key={add.name}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-2xs hover:border-[#F97316] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-[#0D1B2A]">{add.name}</h4>
                    <span className="font-stencil text-xs font-black text-[#F97316]">{add.price}</span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 leading-relaxed">{add.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </FadeUp>

        {/* Trust Guarantee Box */}
        <div className="mx-auto mt-10 max-w-2xl rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-sm">
            <Sparkles size={16} />
            <span>14-Day Zero-Risk Live Pilot</span>
          </div>
          <p className="mt-1 text-xs text-emerald-700">
            We onboard your actual carrier WhatsApp contacts and test real quote requests for two weeks. If it doesn’t save you hours on day 3, pay nothing.
          </p>
        </div>
      </div>
    </section>
  )
}
