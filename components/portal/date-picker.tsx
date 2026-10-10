"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"

const pad = (n: number) => String(n).padStart(2, "0")
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1) }
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

/** A themed date picker (replaces the browser's native one). Value is "YYYY-MM-DD". */
export function DatePicker({ value, onChange, min, max, label }: { value: string; onChange: (v: string) => void; min?: string; max?: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => { const d = value ? parse(value) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const w = 300
    setPos({ top: Math.min(r.bottom + 8, window.innerHeight - 360), left: Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false) } }
    document.addEventListener("mousedown", down)
    window.addEventListener("keydown", key, true)
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key, true) }
  }, [open])

  const sel = value ? parse(value) : null
  const today = new Date()
  const first = new Date(view.getFullYear(), view.getMonth(), 1)
  const start = new Date(first); start.setDate(1 - first.getDay())
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  const off = (d: Date) => (min && toIso(d) < min) || (max && toIso(d) > max)
  const pick = (d: Date) => { if (off(d)) return; onChange(toIso(d)); setOpen(false) }
  const text = sel ? sel.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Select date"

  return (
    <>
      <button ref={btn} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => { if (sel) setView(new Date(sel.getFullYear(), sel.getMonth(), 1)); setOpen((o) => !o) }} className="dp-btn">
        <Calendar className="h-3.5 w-3.5" />{text}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={pop} role="dialog" aria-label={label} className="dp-pop" style={{ top: pos.top, left: pos.left }}>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="Previous month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></button>
            <span className="dp-title">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
            <button type="button" className="dp-nav" aria-label="Next month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="dp-grid dp-dow">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
          <div className="dp-grid">
            {cells.map((d) => {
              const other = d.getMonth() !== view.getMonth()
              const isSel = !!sel && toIso(d) === toIso(sel)
              const isToday = toIso(d) === toIso(today)
              return (
                <button key={toIso(d)} type="button" disabled={!!off(d)} onClick={() => pick(d)}
                  className={`dp-day${other ? " is-other" : ""}${isSel ? " is-sel" : ""}${isToday ? " is-today" : ""}`}>{d.getDate()}</button>
              )
            })}
          </div>
          <div className="dp-foot">
            <button type="button" onClick={() => { const t = toIso(today); if (!off(today)) { onChange(t); setOpen(false) } else setView(new Date(today.getFullYear(), today.getMonth(), 1)) }}>Today</button>
          </div>
        </div>, document.body)}
    </>
  )
}
