"use client"

import { Check } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Navy header band with an orange glow — the same look as the trial page's hero.
 * Colours come from the brand variables, so each client's theme still applies.
 * Every portal page starts with one.
 */
export function PageHero({ eyebrow, title, chips, aside, actions }: {
  eyebrow?: ReactNode
  title: ReactNode
  chips?: ReactNode
  aside?: ReactNode
  actions?: ReactNode
}) {
  return (
    <section
      className="relative mb-6 overflow-hidden rounded-[22px] px-6 py-6 sm:px-9 sm:py-8"
      style={{
        background: "radial-gradient(900px 320px at 92% -30%, rgb(var(--brand-accent-rgb) / 0.30), transparent 60%), linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-navy-mid) 100%)",
        boxShadow: "0 24px 48px -28px rgba(15,30,54,0.55)",
      }}
    >
      <div className="relative flex flex-wrap items-center justify-center gap-6 text-center">
        <div className="min-w-0 flex-1" style={{ flexBasis: 320 }}>
          {eyebrow && (
            <div className="mb-3 flex items-center justify-center gap-2 font-mono text-[11.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--brand-accent)" }}>
              {eyebrow}
            </div>
          )}
          <h1 className="text-[32px] font-extrabold leading-[1.08] text-white sm:text-[42px]">{title}</h1>
          {chips && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{chips}</div>}
          {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">{actions}</div>}
        </div>
        {aside}
      </div>
    </section>
  )
}

export function HeroChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white"
      style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>
      {children}
    </span>
  )
}

/** Buttons that sit on the navy band. */
export function HeroButton({ children, onClick, href, primary }: { children: ReactNode; onClick?: () => void; href?: string; primary?: boolean }) {
  const cls = "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold transition-transform hover:-translate-y-px"
  const style = primary
    ? { background: "var(--brand-accent)", color: "var(--brand-navy)", boxShadow: "0 10px 22px -10px rgb(var(--brand-accent-rgb) / 0.9)" }
    : { background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.32)" }
  if (href) return <a href={href} className={cls} style={style}>{children}</a>
  return <button type="button" onClick={onClick} className={cls} style={style}>{children}</button>
}

/** Frosted box with orange check marks. */
export function HeroChecklist({ title, items }: { title: string; items: ReactNode[] }) {
  return (
    <div className="w-full max-w-[360px] rounded-2xl p-5 sm:w-[360px]"
      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.16)", backdropFilter: "blur(6px)" }}>
      <p className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.62)" }}>{title}</p>
      <ul className="space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[14px] text-white">
            <span className="mt-[2px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full" style={{ background: "var(--brand-accent)" }}>
              <Check className="h-3 w-3" style={{ color: "var(--brand-navy)" }} strokeWidth={3.2} />
            </span>
            <span className="leading-snug">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
