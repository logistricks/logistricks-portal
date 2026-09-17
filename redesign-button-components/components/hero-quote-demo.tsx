'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Layers,
  MessageSquare,
  Send,
  Sparkles,
  Zap,
} from 'lucide-react'

const steps = [
  { id: 'inbound', label: '1. Inbound WhatsApp', icon: MessageSquare },
  { id: 'carriers', label: '2. Multi-Carrier AI Parse', icon: Layers },
  { id: 'quote', label: '3. Instant Client Quote', icon: CheckCircle2 },
]

export function HeroQuoteDemo() {
  const [activeTab, setActiveTab] = useState<'inbound' | 'carriers' | 'quote'>('inbound')
  const [isPaused, setIsPaused] = useState(false)

  // Auto rotate tabs every 6 seconds unless user hovers
  useEffect(() => {
    if (isPaused) return
    const timer = setInterval(() => {
      setActiveTab((curr) => {
        if (curr === 'inbound') return 'carriers'
        if (curr === 'carriers') return 'quote'
        return 'inbound'
      })
    }, 5500)
    return () => clearInterval(timer)
  }, [isPaused])

  return (
    <div
      className="relative w-full rounded-xl border border-slate-700/60 bg-[#0D1B2A] text-left shadow-2xl shadow-orange-500/10 overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Container top bar with ISO stamp and interactive tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-700/60 bg-[#142437] px-4 py-2.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="font-stencil text-[11px] font-bold text-slate-400 tracking-wider">
            LOGISTRICKS OS · DESK SIMULATOR
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded bg-[#F97316]/20 px-2 py-0.5 text-[10px] font-semibold text-[#F97316]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F97316] animate-pulse" />
            LIVE AUTOMATION
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-slate-700/50 bg-[#0B1724] text-xs font-semibold">
        {steps.map((step) => {
          const Icon = step.icon
          const isActive = activeTab === step.id
          return (
            <button
              key={step.id}
              onClick={() => setActiveTab(step.id as any)}
              className={`flex items-center justify-center gap-1.5 py-3 px-2 transition-all border-b-2 ${
                isActive
                  ? 'border-[#F97316] bg-[#142437] text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#101F31]'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-[#F97316]' : 'text-slate-500'} />
              <span className="truncate">{step.label}</span>
            </button>
          )
        })}
      </div>

      {/* Main Interactive Screen Area */}
      <div className="p-4 sm:p-5 min-h-[360px] flex flex-col justify-between">
        <AnimatePresence mode="wait">
          {activeTab === 'inbound' && (
            <motion.div
              key="inbound"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              {/* WhatsApp Header mockup */}
              <div className="flex items-center justify-between rounded-lg bg-[#1F2C34] px-3.5 py-2 text-white text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 font-bold text-xs">
                    GC
                  </div>
                  <div>
                    <p className="font-semibold text-slate-100">Gulf Cargo Movers (Dubai)</p>
                    <p className="text-[10px] text-emerald-400">WhatsApp Business · Inbound Quote Inquiry</p>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400">10:42 AM</span>
              </div>

              {/* Chat bubble */}
              <div className="rounded-lg rounded-tl-none bg-[#005C4B] p-3 text-white text-xs space-y-1.5 shadow-md">
                <p className="leading-relaxed text-[13px]">
                  Hi Osama, need an urgent rate for <strong>2x 40ft trailers</strong> from{' '}
                  <strong>Dubai (Jebel Ali) to Riyadh</strong>. Cargo ready Tuesday, 24T per trailer. Please include customs clearance at Al-Batha border.
                </p>
                <div className="border-t border-emerald-400/20 pt-1 text-[11px] text-emerald-100/80">
                  <span className="font-medium text-amber-200">AI Read:</span> Rate request: 2x40ft FTL, Dubai → Riyadh, ready Tue, 24T/trailer, customs at Al-Batha incl.
                </div>
              </div>

              {/* Instant extraction preview card */}
              <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-3 text-xs">
                <div className="flex items-center justify-between text-[#F97316] font-semibold text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={13} />
                    Logistricks AI Auto-Extracted Parameters:
                  </span>
                  <span className="text-slate-400 text-[10px]">0.3s processing</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="rounded bg-[#142437] px-2 py-1.5 text-slate-200">
                    <span className="text-slate-400">ORIGIN:</span> Jebel Ali, DXB
                  </div>
                  <div className="rounded bg-[#142437] px-2 py-1.5 text-slate-200">
                    <span className="text-slate-400">DEST:</span> Riyadh, RUH
                  </div>
                  <div className="rounded bg-[#142437] px-2 py-1.5 text-slate-200">
                    <span className="text-slate-400">EQUIP:</span> 2x 40ft Trailer
                  </div>
                  <div className="rounded bg-[#142437] px-2 py-1.5 text-slate-200">
                    <span className="text-slate-400">CUSTOMS:</span> Al-Batha Incl.
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-300">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 size={13} /> Dispatched to 6 carriers simultaneously
                  </span>
                  <button
                    onClick={() => setActiveTab('carriers')}
                    className="text-[#F97316] hover:underline flex items-center gap-1 font-semibold"
                  >
                    View Carrier Replies <ArrowRight size={11} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'carriers' && (
            <motion.div
              key="carriers"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">Parsed Responses (4 of 4 Received)</span>
                <span className="font-stencil text-[10px] text-emerald-400">NORM_FEE_PARSER · OK</span>
              </div>

              {/* Carrier Rows */}
              <div className="space-y-1.5 text-xs">
                {/* Almajdouie */}
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-bold text-[10px] text-emerald-300">
                      BEST RATE
                    </span>
                    <span className="font-bold text-white">Almajdouie</span>
                    <span className="text-slate-400 text-[11px]">via WhatsApp text</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-emerald-300 text-sm">$1,750</span>
                    <span className="text-[10px] text-slate-400 block">per trailer · 2 days</span>
                  </div>
                </div>

                {/* Tristar */}
                <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-[#142437] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-bold text-[10px] text-blue-300">
                      FASTEST
                    </span>
                    <span className="font-bold text-white">Tristar</span>
                    <span className="text-slate-400 text-[11px]">via Email PDF</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-white text-sm">$1,920</span>
                    <span className="text-[10px] text-slate-400 block">per trailer · 36 hrs</span>
                  </div>
                </div>

                {/* RSA Global */}
                <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-[#142437] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">RSA Global</span>
                    <span className="text-slate-400 text-[11px]">via WhatsApp</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-white text-sm">$1,810</span>
                    <span className="text-[10px] text-slate-400 block">per trailer · 2 days</span>
                  </div>
                </div>
              </div>

              <div className="rounded bg-slate-800/80 p-2.5 text-[11px] text-slate-300 flex items-center justify-between">
                <span>⚡ AI normalized fuel surcharge, customs & border fees automatically. Zero manual math.</span>
                <button
                  onClick={() => setActiveTab('quote')}
                  className="font-bold text-[#F97316] hover:underline flex items-center gap-1"
                >
                  Generate Quote <ArrowRight size={11} />
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'quote' && (
            <motion.div
              key="quote"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              {/* Branded customer quote card */}
              <div className="rounded-lg border border-slate-700 bg-[#142437] p-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                  <div>
                    <span className="font-stencil text-[10px] text-[#F97316] font-bold">QUOTE #LGST-2026-089</span>
                    <h4 className="font-bold text-white text-sm">Dubai → Riyadh (2x 40ft Trailer)</h4>
                  </div>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-[10px] text-emerald-400">
                    APPROVED & READY
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">CARRIER</span>
                    <span className="font-semibold text-white">Almajdouie</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">TRANSIT</span>
                    <span className="font-semibold text-white">2 Days</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">CUSTOMS</span>
                    <span className="font-semibold text-emerald-400">Al-Batha Incl.</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-700/70 pt-2">
                  <div>
                    <span className="text-[10px] text-slate-400">Client Total (incl. $250/trailer margin)</span>
                    <div className="text-lg font-black text-[#F97316]">$4,000 USD</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">⏱ Generated in 18 min</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 font-bold text-white shadow hover:bg-emerald-500 transition-colors"
                >
                  <Send size={13} /> Send via WhatsApp
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 font-bold text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  <Download size={13} /> Branded PDF Quote
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom indicator & progress hint */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <Clock size={11} className="text-[#F97316]" />
            Traditional quote: 3.5 hours · Logistricks: <strong>&lt; 30 minutes</strong>
          </span>
          <span className="text-slate-500">Click steps to test flow</span>
        </div>
      </div>
    </div>
  )
}
