'use client'

import { ContainerCard } from '@/components/container-card'
import { FadeUp } from '@/components/fade-up'
import { Anchor, Lock, Sparkles, UserCheck } from 'lucide-react'

export function FounderCredibility() {
  return (
    <section id="founders" className="bg-[#0B1521] py-20 text-white relative overflow-hidden">
      {/* Background industrial grid overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none container-ridges" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <FadeUp className="text-center max-w-3xl mx-auto">
          <span className="font-stencil text-xs font-bold text-[#F97316] tracking-widest uppercase">
            FOUNDER LED & FIELD TESTED
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight text-white">
            Built on the Freight Desk. Not in Silicon Valley.
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-slate-300">
            Freight forwarders don’t need generic software from people who’ve never seen a Bill of Lading.
            Logistricks was created by an active freight operator and an AI engineer in Amman, Jordan.
          </p>
        </FadeUp>

        {/* 3 Core Trust Cards */}
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          <FadeUp delay={0.1}>
            <ContainerCard
              bolts="orange"
              serial="INSIDER-OPS-01"
              className="bg-[#142437] border border-slate-700/80 p-6 h-full"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#F97316]/15 text-[#F97316]">
                <Anchor size={22} />
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">Designed for Real Freight Chaos</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Osama runs an international shipping company in Amman. He knows the daily grind of 15 open WhatsApp tabs,
                cryptic carrier emails, and missing deals by 30 minutes. We built the exact tool his team needed.
              </p>
            </ContainerCard>
          </FadeUp>

          <FadeUp delay={0.2}>
            <ContainerCard
              bolts="orange"
              serial="PRIVACY-GUARANTEE"
              className="bg-[#142437] border border-slate-700/80 p-6 h-full"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Lock size={22} />
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">100% Rate & Margin Privacy</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Your negotiated carrier contracts, volume tiers, and client profit margins are strictly confidential.
                Your data is never shared across companies or used to train public models.
              </p>
            </ContainerCard>
          </FadeUp>

          <FadeUp delay={0.3}>
            <ContainerCard
              bolts="orange"
              serial="BILINGUAL-NLP-03"
              className="bg-[#142437] border border-slate-700/80 p-6 h-full"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#F97316]/15 text-[#F97316]">
                <Sparkles size={22} />
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">Native Arabic & English Intelligence</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                MENA trade runs on informal WhatsApp exchanges. Our AI models are natively tuned to understand
                messy Arabic shipping slang, colloquial voice notes, and mixed English shipping acronyms.
              </p>
            </ContainerCard>
          </FadeUp>
        </div>

        {/* Founder Quote & Credibility Banner */}
        <FadeUp delay={0.35} className="mt-12">
          <div className="rounded-xl border border-slate-700 bg-gradient-to-r from-[#142437] to-[#111e2e] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
            <div className="space-y-2 text-center md:text-left">
              <p className="text-base sm:text-lg italic text-slate-200">
                &ldquo;We didn’t build this to replace freight forwarders — we built this so our own team could stop wasting 3 hours copying numbers from WhatsApp to Excel and focus on closing shipments.&rdquo;
              </p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2 text-sm font-semibold">
                <span className="text-[#F97316]">Osama</span>
                <span className="text-slate-400 font-normal">· Co-Founder & Managing Director of Shipping Agency</span>
                <span className="text-slate-600 hidden sm:inline">|</span>
                <span className="text-[#F97316]">Abdulaziz</span>
                <span className="text-slate-400 font-normal">· Co-Founder & AI Systems Architect</span>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-4 py-2 text-xs font-semibold text-emerald-400">
              <UserCheck size={16} />
              <span>Tested on Live Shipments in Jordan & MENA</span>
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}
