"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Clock, Loader2, ShieldAlert, Send, XCircle } from "lucide-react"

type Step = { sort_order: number; assigned_usernames: string[]; step_status: string; decided_by: string | null; notes: string | null; committee_mode: string }
type St = { required: boolean; needed: boolean; status: "pending" | "approved" | "rejected" | null; stale: boolean; cycle: { name: string; mode: string; after: "manual" | "auto" } | null; chain: Step[]; approved_by: string | null }

/**
 * Where a quotation stands on approval (when the sender's approval cycle asks for it): send it for approval, waiting, approved, rejected.
 * onBlocked(true) tells the parent to hold back its "Send" buttons.
 */
export function QuotationApprovalBar({ quotationId, refreshKey, locked, onBlocked }: {
  quotationId: number
  /** change this (for example the quotation text) to re-read the status after an edit */
  refreshKey?: string | number | null
  locked?: boolean
  onBlocked?: (blocked: boolean) => void
}) {
  const [st, setSt] = useState<St | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  const load = useCallback(async () => {
    const r = await fetch(`/api/quotation-approvals?quotation_id=${quotationId}`, { cache: "no-store" })
    if (!r.ok) return
    const j = (await r.json()) as St
    setSt(j); onBlocked?.(!!j.needed && !locked)
  }, [quotationId, onBlocked, locked])

  useEffect(() => { void load() }, [load, refreshKey])
  // while it waits for an approver, look again now and then
  useEffect(() => {
    if (st?.status !== "pending") return
    const t = setInterval(() => void load(), 20000)
    return () => clearInterval(t)
  }, [st?.status, load])

  async function submit() {
    setBusy(true); setMsg("")
    try {
      const r = await fetch("/api/quotation-approvals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quotation_id: quotationId }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j.error ?? "Could not send for approval"); return }
      await load()
    } finally { setBusy(false) }
  }

  if (!st || (!st.required && !st.status) || (locked && st.status !== "approved")) return null
  const rejected = st.chain.find((c) => c.step_status === "rejected")
  const active = st.chain.find((c) => c.step_status === "active")
  const row = (tone: "amber" | "green" | "red" | "blue", icon: React.ReactNode, text: React.ReactNode, action?: React.ReactNode) => {
    const c = { amber: ["rgba(245,158,11,0.1)", "#b45309"], green: ["rgba(16,185,129,0.1)", "#047857"], red: ["rgba(220,38,38,0.08)", "#dc2626"], blue: ["rgba(37,99,235,0.07)", "#2563eb"] }[tone]
    return (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: c[0], color: c[1] }}>
        <span className="flex items-start gap-1.5">{icon}<span>{text}</span></span>
        {action}
        {msg && <span className="w-full text-[11px]">{msg}</span>}
      </div>
    )
  }
  const btn = (
    <button type="button" disabled={busy} onClick={() => void submit()} className="inline-flex items-center gap-1.5 rounded border bg-white/70 px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 dark:bg-black/20" style={{ borderColor: "currentColor" }}>
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send for approval
    </button>
  )

  if (st.status === "pending" && !st.stale) {
    const total = st.chain.length, n = active ? st.chain.findIndex((c) => c === active) + 1 : total
    return row("blue", <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />, <>Waiting for approval{total > 1 ? ` (step ${n} of ${total})` : ""}{active ? <>: {active.assigned_usernames.join(", ")}</> : null}.{st.cycle?.after === "auto" ? " It will be sent to the requester automatically once approved." : ""}</>)
  }
  if (st.status === "approved" && !st.stale)
    return row("green", <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />, <>Approved{st.approved_by ? ` by ${st.approved_by}` : ""}. {st.cycle?.after === "auto" ? "It is sent automatically." : "You can send it now."}</>)
  if (st.status === "rejected" && !st.stale)
    return row("red", <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />, <>Rejected{rejected?.decided_by ? ` by ${rejected.decided_by}` : ""}{rejected?.notes ? `: ${rejected.notes}` : ""}. Change the quotation, then send it for approval again.</>, btn)
  return row("amber", <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />,
    st.stale ? <>The quotation changed after it was submitted, so it needs approval again.</> : <>This quotation needs approval before it can be sent{st.cycle?.mode === "warnings" ? " (the AI review found something, or it was not reviewed)" : ""}.</>, btn)
}
