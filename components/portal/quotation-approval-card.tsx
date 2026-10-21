"use client"

import { useState } from "react"
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, XCircle } from "lucide-react"
import { QuotationCheckPanel } from "@/components/portal/quotation-check-panel"

export interface QuotationApprovalItem {
  step: { id: string; sort_order: number; submitted_by: string; created_at: string }
  quotation: { id: number; quotation_number?: string | null; generated_subject?: string | null; generated_body?: string | null; generated_html?: string | null; generated_format?: string | null; final_price_usd?: number | null; base_rate_usd?: number | null; currency?: string | null; valid_until?: string | null }
  request: { id: string; request_ref?: string | null; sender_name?: string | null; sender_email?: string | null; origin_city?: string | null; origin_country?: string | null; destination_city?: string | null; destination_country?: string | null } | null
}

const place = (c?: string | null, k?: string | null) => [c, k].filter(Boolean).join(", ")
const htmlFrame = (h: string) => `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:12px;font-family:Arial,sans-serif;font-size:13px}</style></head><body>${h}</body></html>`

/** One quotation waiting for my approval: what will be sent, the AI review next to it, approve or reject. */
export function QuotationApprovalCard({ item, onDone }: { item: QuotationApprovalItem; onDone: () => void }) {
  const { step, quotation: q, request: r } = item
  const [open, setOpen] = useState(true)
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)
  const [err, setErr] = useState("")
  const [rejecting, setRejecting] = useState(false)

  async function decide(action: "approve" | "reject") {
    if (action === "reject" && !notes.trim()) { setRejecting(true); setErr("Write the reason for rejecting."); return }
    setBusy(action); setErr("")
    try {
      const res = await fetch(`/api/quotation-approvals/${step.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, notes }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error ?? "Could not save your decision"); if (res.status === 409) onDone(); return }
      onDone()
    } finally { setBusy(null) }
  }

  const border = { borderColor: "var(--card-border)" } as const
  return (
    <div className="ds-card p-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--brand-accent)" }}>Quotation to approve</p>
          <p className="mt-0.5 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {r?.request_ref ?? "Request"} · {q.quotation_number ?? `#${q.id}`}
            <span className="ml-2 font-semibold tabular-nums">${Number(q.final_price_usd ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {place(r?.origin_city, r?.origin_country)} → {place(r?.destination_city, r?.destination_country)} · to {r?.sender_name || r?.sender_email || "the requester"} · from {step.submitted_by}
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <QuotationCheckPanel quotationId={q.id} locked canRun />
          <div className="rounded-lg border p-3" style={border}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Subject</p>
            <p className="mb-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{q.generated_subject}</p>
            {q.generated_html && q.generated_format !== "text" ? (
              <iframe title={`Quotation ${q.id}`} sandbox="" srcDoc={htmlFrame(q.generated_html)} className="h-80 w-full rounded-md border bg-white" style={border} />
            ) : null}
            {(q.generated_format === "text" || q.generated_format === "pdf" || !q.generated_html) && (
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{q.generated_body}</p>
            )}
            <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Carrier price ${Number(q.base_rate_usd ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} · final price ${Number(q.final_price_usd ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}{q.valid_until ? ` · valid until ${String(q.valid_until).slice(0, 10)}` : ""}
              {q.generated_format === "pdf" ? " · sent with a PDF attachment" : ""}
            </p>
          </div>
          {(rejecting || notes) && (
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Reason (required when rejecting, optional when approving)" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ ...border, background: "var(--card-bg)", color: "var(--text-primary)" }} />
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy !== null} onClick={() => void decide("approve")} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "#059669" }}>
              {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
            </button>
            <button type="button" disabled={busy !== null} onClick={() => (rejecting ? void decide("reject") : (setRejecting(true), setErr("")))} className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "#dc2626", color: "#dc2626" }}>
              {busy === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} {rejecting ? "Confirm rejection" : "Reject"}
            </button>
            {!rejecting && !notes && <button type="button" onClick={() => setRejecting(true)} className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>Add a note</button>}
          </div>
        </div>
      )}
    </div>
  )
}
