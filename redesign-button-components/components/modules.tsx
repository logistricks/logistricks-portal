import {
  BarChart2,
  FileText,
  MapPin,
  MessageCircle,
  Receipt,
  Zap,
} from 'lucide-react'
import { ContainerCard } from '@/components/container-card'
import { FadeUp } from '@/components/fade-up'

const modules = [
  {
    icon: Zap,
    title: 'AI Rate Collection',
    body: 'Reads WhatsApp, emails, and PDFs from any carrier. Parses rates automatically regardless of format.',
  },
  {
    icon: FileText,
    title: 'Document Intelligence',
    body: 'Generates document checklists per route and cargo type. Catches mismatches before customs does.',
  },
  {
    icon: MapPin,
    title: 'Shipment Tracking',
    body: 'One dashboard for all active shipments. Branded tracking links for your clients — your logo, not ours.',
  },
  {
    icon: BarChart2,
    title: 'Carrier Performance',
    body: 'Real data on which carriers are on time, on rate, on every lane you operate. Built from your own shipment history.',
  },
  {
    icon: Receipt,
    title: 'Invoice Reconciliation',
    body: 'Catches carrier overcharges before you pay them. Flags every line-item discrepancy automatically.',
  },
  {
    icon: MessageCircle,
    title: 'Client WhatsApp Gateway',
    body: 'Your clients message you for updates. The AI handles every routine query 24/7 in Arabic and English.',
  },
]

export function Modules() {
  return (
    <section id="features" className="bg-[#0D1B2A] py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeUp className="text-center">
          <h2 className="text-4xl font-black text-white">
            Everything Your Operation Needs
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Start with AI rate collection. Add modules as you grow.
          </p>
        </FadeUp>

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((m, i) => {
            const Icon = m.icon
            return (
              <FadeUp key={m.title} delay={(i % 3) * 0.1} className="h-full">
                <ContainerCard
                  bolts="orange"
                  className="group min-h-[12rem] border border-transparent bg-[#1E3A5F] p-6 transition-all duration-200 hover:border-[#F97316] hover:shadow-lg hover:shadow-orange-500/10"
                  contentClassName="justify-center"
                >
                  <Icon size={28} className="text-[#F97316]" />
                  <h3 className="mt-4 text-lg font-bold text-white">
                    {m.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {m.body}
                  </p>
                </ContainerCard>
              </FadeUp>
            )
          })}
        </div>
      </div>
    </section>
  )
}
