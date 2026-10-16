"use client"

import { useState } from "react"
import { Plus, StickyNote, X } from "lucide-react"
import { parseSpecial } from "@/lib/special"

/** Notes only the team sees (booked legs, weight remarks, comments). Never sent to carriers or customers. Needs migration 076. */
export function RequestNotesCard({ requestId, notes, onChanged }: { requestId: string; notes: string[]; onChanged: () => void }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  async function save(next: string[]) {
    setBusy(true); setErr("")
    try {
      const r = await fetch("/api/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: requestId, notes: next }) })
      if (!r.ok) throw new Error()
      setText(""); onChanged()
    } catch { setErr("Could not save the note.") }
    setBusy(false)
  }

  return (
    <div className="ds-card p-6">
      <div className="mb-1 flex items-center gap-2">
        <StickyNote className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
        <h4 className="font-display text-[20px] font-extrabold" style={{ color: "var(--text-primary)" }}>Notes</h4>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--hover-bg)", color: "var(--text-secondary)", border: "1px solid var(--card-border)" }}>Only you see these</span>
      </div>
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>Never sent to carriers or the customer.</p>
      {notes.length === 0 ? (
        <p className="mb-3 text-sm" style={{ color: "var(--text-muted)" }}>No notes.</p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {notes.map((n, i) => {
            const p = parseSpecial(n)
            return (
              <li key={i} className="group flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--brand-accent)" }} />
                <span className="min-w-0 flex-1 break-words">{p.label ? <><b className="font-semibold" style={{ color: "var(--text-primary)" }}>{p.label}:</b> {p.value}</> : n}</span>
                <button onClick={() => save(notes.filter((_, j) => j !== i))} disabled={busy} aria-label="Remove note" className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" style={{ color: "var(--text-muted)" }}><X className="h-3.5 w-3.5" /></button>
              </li>
            )
          })}
        </ul>
      )}
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void save([...notes, text.trim()]) }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note" aria-label="Add a note" className="h-9 min-w-0 flex-1 rounded-lg px-3 text-sm outline-none" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-primary)" }} />
        <button type="submit" disabled={busy || !text.trim()} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--brand-accent)" }}><Plus className="h-3.5 w-3.5" />Add</button>
      </form>
      {err && <p className="mt-2 text-xs" style={{ color: "#ef4444" }}>{err}</p>}
    </div>
  )
}
