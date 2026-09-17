import { CtaButton } from '@/components/cta-button'

const product = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Integrations', href: '#features' },
]

const company = [
  { label: 'About', href: '#top' },
  { label: 'Blog', href: '#top' },
  { label: 'Careers', href: '#top' },
  { label: 'Contact', href: '#contact' },
]

export function Footer() {
  return (
    <footer className="border-t border-[#1E3A5F] bg-[#0D1B2A] pb-8 pt-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Col 1 — brand */}
          <div>
            <div className="text-[22px] leading-none">
              <span className="font-black text-white">Logis</span>
              <span className="font-black text-[#F97316]">tricks</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Every carrier. Every rate. One reply.
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
              The complete AI operating system for international freight
              forwarders.
            </p>
          </div>

          {/* Col 2 — product */}
          <div>
            <h3 className="text-sm font-semibold text-white">Product</h3>
            <ul className="mt-4 space-y-3">
              {product.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-slate-400 transition-colors hover:text-white"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — company */}
          <div>
            <h3 className="text-sm font-semibold text-white">Company</h3>
            <ul className="mt-4 space-y-3">
              {company.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-slate-400 transition-colors hover:text-white"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4 — get started */}
          <div>
            <h3 className="text-sm font-semibold text-white">Get Started</h3>
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-relaxed text-slate-400">
                Free 2-week pilot. No credit card. Live in 3 days.
              </p>
              <CtaButton fullWidth>Book a Free Demo</CtaButton>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-[#1E3A5F] pt-6">
          <p className="text-xs text-slate-500">© 2026 Logistricks.</p>
          <p className="text-xs text-slate-500">
            Built for freight forwarders.
          </p>
        </div>
      </div>
    </footer>
  )
}
