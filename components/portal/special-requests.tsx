"use client"

import { useEffect } from "react"
import { Expand, ListChecks, X } from "lucide-react"

type Props = { requirements: string[]; questions?: string[]; reference?: string }

/** Full list in a pop-up — special requests can be long, so the page only shows a preview. */
export function SpecialRequestsDialog({ requirements, questions = [], reference, onClose }: Props & { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" style={{ animation: "lt-fade-in .15s ease-out" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Special requests" className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl shadow-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", animation: "lt-pop-in .18s ease-out" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid var(--divider)" }}>
          <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            <ListChecks className="h-4 w-4" style={{ color: "var(--brand-accent)" }} /> Special requests{reference ? ` — ${reference}` : ""}
          </h3>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1" style={{ color: "var(--text-muted)" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Requirements ({requirements.length})</h4>
            {requirements.length === 0
              ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing was picked up from the email.</p>
              : <ol className="space-y-2">{requirements.map((s, i) => (
                  <li key={i} className="flex gap-3 rounded-lg px-3 py-2.5 text-sm" style={{ border: "1px solid var(--card-border)", color: "var(--text-primary)" }}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "var(--brand-accent)" }}>{i + 1}</span>
                    <span className="whitespace-pre-wrap break-words">{s}</span>
                  </li>))}</ol>}
          </section>
          {questions.length > 0 && (
            <section>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Questions for carriers ({questions.length})</h4>
              <ul className="space-y-2">{questions.map((q, i) => (
                <li key={i} className="flex gap-3 rounded-lg px-3 py-2.5 text-sm" style={{ border: "1px solid var(--card-border)", color: "var(--text-primary)" }}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "#3b82f6" }}>?</span>
                  <span className="whitespace-pre-wrap break-words">{q}</span>
                </li>))}</ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

/** Card: a short preview with a button that opens the full list. Always shown, so a missing list is visible too. */
export function SpecialRequestsCard({ requirements, questions = [], reference, openState }: Props & { openState: [boolean, (v: boolean) => void] }) {
  const [open, setOpen] = openState
  const total = requirements.length + questions.length
  const preview = requirements.slice(0, 2)
  return (
    <div className="ds-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Special requests{total ? ` (${requirements.length}${questions.length ? ` + ${questions.length} questions` : ""})` : ""}
        </h4>
        {total > 0 && (
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold" style={{ color: "var(--brand-accent)", border: "1px solid var(--card-border)" }}>
            <Expand className="h-3.5 w-3.5" /> View all
          </button>
        )}
      </div>
      {total === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>None picked up from this email.</p>
      ) : (
        <ul className="space-y-1.5">
          {preview.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--brand-accent)" }} />
              <span className="line-clamp-2 break-words">{s}</span>
            </li>
          ))}
          {total > preview.length && (
            <li><button onClick={() => setOpen(true)} className="text-xs font-semibold" style={{ color: "var(--brand-accent)" }}>+ {total - preview.length} more — open full list</button></li>
          )}
        </ul>
      )}
      {open && <SpecialRequestsDialog requirements={requirements} questions={questions} reference={reference} onClose={() => setOpen(false)} />}
    </div>
  )
}
