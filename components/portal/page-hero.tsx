"use client"

import { Check } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Navy header band with an orange glow — the same look as the trial page's hero.
 * Colours come from the brand variables, so each client's theme still applies.
 */
export function PageHero({ eyebrow, title, chips, aside }: {
  eyebrow?: ReactNode
  title: ReactNode
  chips?: ReactNode
  aside?: ReactNode
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[22px] px-6 py-7 sm:px-9 sm:py-9"
      style={{
        background: "linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-navy-mid) 100%)",
        boxShadow: "0 24px 48px -28px rgba(15,30,54,0.55)",
      }}
    >
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full"
        style={{ background: "radial-gradient(circle, rgb(var(--brand-accent-rgb) / 0.30) 0%, transparent 65%)" }} />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-3 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--brand-accent)" }}>
              {eyebrow}
            </div>
          )}
          <h1 className="text-[32px] font-extrabold leading-[1.1] text-white sm:text-[40px]">{title}</h1>
          {chips && <div className="mt-4 flex flex-wrap items-center gap-2">{chips}</div>}
        </div>
        {aside}
      </div>
    </section>
  )
}

export function HeroChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold text-white"
      style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}>
      {children}
    </span>
  )
}

/** Frosted box with orange check marks. */
export function HeroChecklist({ title, items }: { title: string; items: ReactNode[] }) {
  return (
    <div className="w-full max-w-[340px] rounded-2xl p-5 sm:w-[340px]"
      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(6px)" }}>
      <p className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.6)" }}>{title}</p>
      <ul className="space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-white">
            <span className="mt-[2px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full" style={{ background: "var(--brand-accent)" }}>
              <Check className="h-3 w-3 text-white" strokeWidth={3} />
            </span>
            <span className="leading-snug">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
