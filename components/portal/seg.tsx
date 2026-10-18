"use client"

import { useLayoutEffect, useRef, useState } from "react"

/** A group of options joined into one row (single border, thin dividers). */
export function Seg({ items, label }: { items: { key: string; label: React.ReactNode; on: boolean; onClick: () => void; count?: number }[]; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const btns = useRef<Record<string, HTMLButtonElement | null>>({})
  const [rects, setRects] = useState<{ key: string; left: number; width: number }[]>([])
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const sig = items.map((i) => `${i.key}:${i.on ? 1 : 0}:${i.count ?? ""}`).join("|")
  useLayoutEffect(() => {
    // neighbouring selected options share one pill
    const measure = () => {
      const runs: { key: string; left: number; width: number }[] = []
      let run: { key: string; left: number; right: number } | null = null
      for (const i of items) {
        const el = btns.current[i.key]
        if (i.on && el) {
          if (run) run.right = el.offsetLeft + el.offsetWidth
          else run = { key: i.key, left: el.offsetLeft, right: el.offsetLeft + el.offsetWidth }
        } else if (run) { runs.push({ key: run.key, left: run.left, width: run.right - run.left }); run = null }
      }
      if (run) runs.push({ key: (run as any).key, left: (run as any).left, width: (run as any).right - (run as any).left })
      setRects(runs)
    }
    measure()
    const id = requestAnimationFrame(() => setReady(true)) // no slide on the first paint
    window.addEventListener("resize", measure)
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", measure) }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box} role="group" aria-label={label} className="relative inline-flex max-w-full gap-1 overflow-x-auto overflow-y-hidden rounded-2xl p-1 [&::-webkit-scrollbar]:hidden" style={{ border: "1px solid var(--card-border)", background: "var(--table-header-bg, var(--page-bg))", scrollbarWidth: "none" }}>
      {rects.map((r, i) => (
        <span key={i} aria-hidden className="pointer-events-none absolute bottom-1 top-1 rounded-xl"
          style={{
            left: r.left, width: r.width, background: "var(--brand-accent)",
            boxShadow: "0 6px 14px -8px rgb(var(--brand-accent-rgb) / 0.9)",
            filter: hover && items.some((x) => x.key === hover && x.on) ? "brightness(0.92)" : "none",
            transition: ready ? "left .38s cubic-bezier(.34,1.45,.5,1), width .38s cubic-bezier(.34,1.45,.5,1), filter .15s" : "none",
          }} />
      ))}
      {items.map((it) => (
        <button key={it.key} ref={(el) => { btns.current[it.key] = el }} type="button" aria-pressed={it.on} onClick={it.onClick}
          onMouseEnter={() => setHover(it.key)} onMouseLeave={() => setHover(null)}
          className="relative z-10 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-[13px] font-bold transition-colors duration-200"
          style={{ background: !it.on && hover === it.key ? "color-mix(in srgb, var(--brand-accent) 16%, transparent)" : "transparent", color: it.on ? "var(--brand-navy)" : hover === it.key ? "var(--text-primary)" : "var(--text-secondary)" }}>
          {it.label}
          {it.count !== undefined && <span className="text-[11px] font-bold tabular-nums" style={{ opacity: it.on ? 0.75 : 0.5 }}>{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

