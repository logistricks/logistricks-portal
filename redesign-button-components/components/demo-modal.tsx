'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, X } from 'lucide-react'

type DemoModalContextValue = { open: () => void }

const DemoModalContext = createContext<DemoModalContextValue | null>(null)

export function useDemoModal() {
  const ctx = useContext(DemoModalContext)
  if (!ctx) {
    throw new Error('useDemoModal must be used within a DemoModalProvider')
  }
  return ctx
}

export function DemoModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const open = useCallback(() => {
    setSubmitted(false)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // move focus into the dialog
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [isOpen, close])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <DemoModalContext.Provider value={{ open }}>
      {children}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="absolute inset-0 bg-[#0D1B2A]/70 backdrop-blur-sm"
              onClick={close}
              aria-hidden
            />

            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="demo-modal-title"
              tabIndex={-1}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-[6px] bg-white shadow-[0_8px_32px_rgba(13,27,42,0.12)]"
            >
              {/* corner bolts to match the shipping-container language */}
              {[
                'left-2 top-2',
                'right-2 top-2',
                'bottom-2 left-2',
                'bottom-2 right-2',
              ].map((pos) => (
                <span
                  key={pos}
                  aria-hidden
                  className={`absolute ${pos} h-1.5 w-1.5 rounded-full bg-[#F97316]`}
                />
              ))}

              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[#FFF7ED] hover:text-[#F97316]"
              >
                <X size={20} />
              </button>

              <div className="p-8">
                {submitted ? (
                  <div className="py-6 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF7ED]">
                      <Check size={30} className="text-[#F97316]" />
                    </div>
                    <h2
                      id="demo-modal-title"
                      className="mt-5 text-2xl font-black text-[#0D1B2A]"
                    >
                      You&apos;re on the list.
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-gray-500">
                      Thanks for your interest in Logistricks. Our team will
                      reach out shortly to schedule your free demo and 2-week
                      pilot.
                    </p>
                    <button
                      type="button"
                      onClick={close}
                      className="mt-6 inline-flex items-center justify-center rounded-lg border border-[#C2410C] bg-[#EA580C] px-8 py-3 font-semibold text-white shadow-xs transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-[#C2410C] hover:shadow-md active:translate-y-0 active:scale-[0.985]"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="font-stencil text-[10px] font-bold text-[#F97316] uppercase tracking-wider">
                        QUICK ONBOARDING
                      </span>
                    </div>

                    <h2
                      id="demo-modal-title"
                      className="mt-1 text-2xl font-black text-[#0D1B2A]"
                    >
                      Experience Logistricks Live
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-gray-500">
                      See how Logistricks turns 3-hour quote chaos into under 30 minutes. 2-week free pilot on your real desk.
                    </p>

                    {/* Instant WhatsApp Channel option */}
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900">Want an immediate answer?</span>
                        <span className="rounded bg-emerald-200/70 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          FASTEST
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-emerald-700">
                        Chat directly with Osama on WhatsApp to discuss your trade lanes and carrier setup.
                      </p>
                      <a
                        href="https://wa.me/962799999999?text=Hi%20Osama%2C%20I%20run%20a%20freight%20desk%20and%20want%20to%20see%20how%20Logistricks%20automates%20quotes."
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-500"
                      >
                        <span>Chat Directly on WhatsApp →</span>
                      </a>
                    </div>

                    <div className="relative my-4 text-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                      </div>
                      <span className="relative bg-white px-2 text-[11px] font-medium uppercase text-gray-400">
                        Or schedule a screen share
                      </span>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                      <Field
                        id="demo-name"
                        label="Full name"
                        type="text"
                        placeholder="Jane Forwarder"
                        autoComplete="name"
                      />
                      <Field
                        id="demo-company"
                        label="Forwarding Agency / Company"
                        type="text"
                        placeholder="Amman Express Freight"
                        autoComplete="organization"
                      />
                      <Field
                        id="demo-email"
                        label="Work email"
                        type="email"
                        placeholder="jane@ammanexpress.com"
                        autoComplete="email"
                      />

                      <div>
                        <label
                          htmlFor="demo-mode"
                          className="block text-xs font-semibold text-[#111827]"
                        >
                          Primary Freight Modes
                        </label>
                        <select
                          id="demo-mode"
                          name="demo-mode"
                          className="mt-1 w-full rounded-[6px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-xs text-[#111827] outline-none transition-colors focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20"
                        >
                          <option value="ocean-fcl">Ocean Freight (FCL / LCL)</option>
                          <option value="air-cargo">Air Freight</option>
                          <option value="cross-border-land">Cross-Border Land Transport (Trucking)</option>
                          <option value="multimodal">Multimodal (Ocean + Land + Air)</option>
                        </select>
                      </div>

                      <button
                        type="submit"
                        className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-[#C2410C] bg-[#EA580C] px-6 py-3 text-sm font-semibold text-white shadow-xs transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-[#C2410C] hover:shadow-md active:translate-y-0 active:scale-[0.985]"
                      >
                        Schedule 15-Min Live Demo
                      </button>
                    </form>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DemoModalContext.Provider>
  )
}

function Field({
  id,
  label,
  type,
  placeholder,
  autoComplete,
}: {
  id: string
  label: string
  type: string
  placeholder: string
  autoComplete: string
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-[#111827]"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="mt-1 w-full rounded-[6px] border border-[#E5E7EB] px-3 py-2 text-xs text-[#111827] outline-none transition-colors placeholder:text-gray-400 focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20"
      />
    </div>
  )
}
