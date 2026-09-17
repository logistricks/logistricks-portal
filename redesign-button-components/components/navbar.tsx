'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle, Menu, X } from 'lucide-react'
import { CtaButton } from '@/components/cta-button'
import { cn } from '@/lib/utils'

const links = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Before & After', href: '#transformation' },
  { label: 'ROI Calculator', href: '#calculator' },
  { label: 'Modules', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Founders', href: '#founders' },
]

function Logo() {
  return (
    <a href="#top" className="text-[22px] leading-none tracking-tight">
      <span className="font-black text-[#0D1B2A]">Logis</span>
      <span className="font-black text-[#F97316]">tricks</span>
    </a>
  )
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 bg-white/95 backdrop-blur-md transition-shadow duration-200',
        scrolled ? 'shadow-sm border-b border-gray-100' : 'shadow-none',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        <div className="hidden items-center gap-6 lg:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-xs font-semibold text-gray-600 transition-colors hover:text-[#F97316]"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <CtaButton
            href="https://wa.me/962799999999?text=Hi%20Osama%2C%20I%20run%20a%20freight%20forwarding%20desk%20and%20want%20to%20see%20how%20Logistricks%20automates%20quotes."
            size="sm"
            variant="emerald"
            className="px-3"
          >
            <MessageCircle size={14} className="shrink-0" />
            <span>WhatsApp</span>
          </CtaButton>
          <CtaButton size="sm" variant="primary">
            Book a Free Demo
          </CtaButton>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center text-[#0D1B2A] md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={26} /> : <Menu size={26} />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-[#E5E7EB] bg-white md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-3 text-base font-medium text-gray-700 transition-colors hover:bg-[#FFF7ED] hover:text-[#F97316]"
                >
                  {l.label}
                </a>
              ))}
              <CtaButton
                className="mt-2"
                fullWidth
                size="md"
                variant="primary"
                onClick={() => setOpen(false)}
              >
                Book a Free Demo
              </CtaButton>
              <CtaButton
                href="https://wa.me/962799999999?text=Hi%20Osama%2C%20I%20run%20a%20freight%20forwarding%20desk%20and%20want%20to%20see%20how%20Logistricks%20automates%20quotes."
                className="mt-2"
                fullWidth
                size="md"
                variant="emerald"
                onClick={() => setOpen(false)}
              >
                <MessageCircle size={16} className="shrink-0" />
                <span>Chat on WhatsApp</span>
              </CtaButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
