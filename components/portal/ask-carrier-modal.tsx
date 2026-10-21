"use client"

import { useEffect, useState } from "react"
import { Loader2, Send, X } from "lucide-react"
import { useToast } from "@/components/ui/toast"

type Draft = { to: string; cc: string[]; subject: string; body: string; asked: number; max: number; carrier_name: string }

/** The ready-made email asking a carrier to fix a flagged quote. Editable, then one click to send. */
export function AskCarrierModal({ quoteId, onClose }: { quoteId: string | number; onClose: () => void }) {
  const { error: toastError, success } = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [err, setErr] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch(`/api/carrier-quotes/ask?id=${encodeURIComponent(String(quoteId))}`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error ?? "Could not prepare the email"); return }
      setDraft(j); setSubject(j.subject); setBody(j.body)
    }).catch((e) => setErr(e.message))
  }, [quoteId])

  async function send() {
    setSending(true)
    try {
      const r = await fetch("/api/carrier-quotes/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: quoteId, subject, body }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toastError("Could not send", j.error); return }
      success("Sent to the carrier", j.to); onClose()
    } finally { setSending(false) }
  }

  const line = { borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" } as const
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border p-5 shadow-2xl" style={{ ...line }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-bold">Ask the carrier to fix this quote</p>
            {draft && <p className="text-xs" style={{ color: "var(--text-muted)" }}>To {draft.to}{draft.cc.length ? ` · CC ${draft.cc.join(", ")}` : ""}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {!draft && !err && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {err && <p className="mt-4 rounded-lg px-3 py-2 text-[13px]" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>{err}</p>}
        {draft && (
          <>
            {draft.asked > 0 && (
              <p className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(245,158,11,0.12)", color: "#b45309" }}>
                This carrier has already been asked {draft.asked} time{draft.asked === 1 ? "" : "s"} about this request{draft.asked >= draft.max ? ` (the automatic limit is ${draft.max})` : ""}.
              </p>
            )}
            <label className="mt-3 block text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-[13px]" style={line} />
            <label className="mt-3 block text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Message</label>
            <textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-[13px]" style={{ ...line, fontFamily: "inherit" }} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-[13px] font-bold" style={line}>Cancel</button>
              <button type="button" onClick={() => void send()} disabled={sending || !body.trim()} className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-extrabold disabled:opacity-60"
                style={{ background: "var(--brand-accent)", color: "var(--brand-navy)" }}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
