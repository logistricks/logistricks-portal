"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, FileText, Loader2, Mail, Send, X, XCircle, Zap } from "lucide-react"
import type { CarrierQuote } from "@/lib/carrier-quotes-queries"
import { ConfirmStepsDialog } from "@/components/portal/confirm-steps-dialog"
import { isExpiredDate } from "@/lib/validity"
import { SendQuotationModal, type Quotation } from "@/components/portal/quotation-builder"

const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-4 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"

/**
 * "Forward to sender": pick one ACTIVE carrier quote, build the quotation from the quotation template (or reuse the one
 * already built for it), then send it to the original sender manually (from the user's own mailbox) or automatically
 * (through the client's SMTP). Both are logged.
 */
export function ForwardQuotationDialog({
  requestId, senderEmail, senderName, gmailThreadId, quotes, onClose, onDone,
}: {
  requestId: string
  senderEmail: string
  senderName: string
  gmailThreadId: string | null
  quotes: CarrierQuote[]
  onClose: () => void
  onDone: () => void
}) {
  const [quoteId, setQuoteId] = useState<number | null>(quotes[0]?.id ?? null)
  const [method, setMethod] = useState<"manual" | "automatic">("manual")
  const [smtpOk, setSmtpOk] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [step, setStep] = useState<"select" | "review" | "manual" | "done">("select")
  const [doneInfo, setDoneInfo] = useState<string | null>(null)
  const [expiredMsg, setExpiredMsg] = useState<string | null>(null)   // prompt shown when the quote or quotation validity has passed
  const [ack, setAck] = useState(false)                                // user confirmed sending an expired quote

  useEffect(() => {
    fetch(`/api/requests/${requestId}/send-rfq`).then((r) => (r.ok ? r.json() : null))
      .then((d) => setSmtpOk(!!d?.smtp?.configured && !!d?.smtp?.enabled)).catch(() => setSmtpOk(false))
  }, [requestId])

  async function prepare() {
    if (!quoteId) return
    setBusy(true); setError(null)
    try {
      const list = await fetch(`/api/quotations?freight_request_id=${requestId}`).then((r) => (r.ok ? r.json() : []))
      let q: Quotation | undefined = (list as Quotation[]).find((x) => x.carrier_quote_id === quoteId)   // newest first
      if (!q) {
        const mk = await fetch(`/api/carrier-quotes/markup?freight_request_id=${requestId}`).then((r) => (r.ok ? r.json() : { markups: {} }))
        const m = mk.markups?.[String(quoteId)] ?? {}
        const res = await fetch("/api/quotations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            freight_request_id: requestId, carrier_quote_id: quoteId,
            markup_type: m.markup_type ?? "flat", markup_amount: m.markup_amount ?? 0, show_markup_percent: !!m.show_markup_percent,
            charges_style: m.charges_style ?? undefined, line_overrides: m.price_lines ?? undefined,
          }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error ?? "Could not build the quotation")
        q = d as Quotation
      }
      setQuotation(q)
      const cq = quotes.find((x) => x.id === quoteId)
      const day = (d?: string | null) => new Date(String(d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      const msg = ack ? null
        : isExpiredDate(cq?.validityDate) ? `The ${cq?.carrierName} quote expired on ${day(cq?.validityDate)}. The carrier may no longer honour this price.`
        : isExpiredDate(q.valid_until) ? `Quotation ${q.quotation_number ?? q.id} expired on ${day(q.valid_until)}.`
        : null
      if (msg) { setExpiredMsg(msg); return }
      setStep(method === "manual" ? "manual" : "review")
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function post(manual: boolean) {
    if (!quotation) return false
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/quotations/forward", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotation_id: quotation.id, manual, confirm_expired: ack }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `Server error ${res.status}`)
      setDoneInfo(manual ? "Logged as sent manually." : `Sent to ${d.to}.`)
      setStep("done"); onDone()
      return true
    } catch (e) { setError((e as Error).message); return false } finally { setBusy(false) }
  }

  if (step === "manual" && quotation) {
    return (
      <SendQuotationModal
        quotation={quotation}
        recipient={senderEmail}
        threadId={gmailThreadId}
        onClose={onClose}
        onSaved={(id, subject, body) => setQuotation((q) => (q && q.id === id ? { ...q, generated_subject: subject, generated_body: body } : q))}
        onMarkSent={async () => { await post(true) }}
        pageSize="a4"
      />
    )
  }

  const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" } as const
  const fmt = quotation?.generated_format
  return (
    <>
    <ConfirmStepsDialog
        open={expiredMsg !== null}
        steps={[{ title: "This quote has expired", body: <>{expiredMsg} <strong>Send it to {senderName || senderEmail} anyway?</strong></>, confirmLabel: "Send anyway" }]}
        onConfirm={() => { setAck(true); setExpiredMsg(null); setStep(method === "manual" ? "manual" : "review") }}
        onCancel={() => setExpiredMsg(null)}
      />
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl shadow-2xl" style={card} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Forward quotation to sender">
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--divider)" }}>
          <div>
            <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Forward to {senderName || senderEmail}</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Sends the quotation built from your quotation template to {senderEmail}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5" style={{ color: "var(--text-muted)" }}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {step === "select" && (
            <>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Active quote to forward</p>
                <div className="space-y-2">
                  {quotes.map((q) => (
                    <label key={q.id} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm" style={{ borderColor: quoteId === q.id ? "var(--brand-accent)" : "var(--card-border)", color: "var(--text-primary)" }}>
                      <input type="radio" name="fwd-quote" checked={quoteId === q.id} onChange={() => setQuoteId(q.id)} />
                      <span className="flex-1 font-semibold">{q.carrierName}{isExpiredDate(q.validityDate) && <span className="ml-2 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Expired</span>}</span>
                      <span className="tabular-nums">{q.rateUsd != null ? `$${q.rateUsd.toLocaleString("en-US")}` : q.rateOriginal != null ? `${q.rateOriginal.toLocaleString()} ${q.rateCurrency}` : "—"}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>How to send</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setMethod("manual")} className="rounded-lg border p-3 text-left" style={{ borderColor: method === "manual" ? "var(--brand-accent)" : "var(--card-border)", color: "var(--text-primary)" }}>
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><Mail className="h-4 w-4" /> Send manually</span>
                    <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>Review, then send from your own mailbox</span>
                  </button>
                  <button type="button" disabled={smtpOk === false} onClick={() => setMethod("automatic")} className="rounded-lg border p-3 text-left disabled:opacity-50" style={{ borderColor: method === "automatic" ? "var(--brand-accent)" : "var(--card-border)", color: "var(--text-primary)" }}>
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><Zap className="h-4 w-4" /> Send automatically</span>
                    <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{smtpOk === false ? "Set up the email server in Settings first" : "Sent now through your email server (PDF attached if the template is PDF)"}</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {step === "review" && quotation && (
            <div className="space-y-2 text-sm" style={{ color: "var(--text-primary)" }}>
              <p className="flex items-center gap-2"><FileText className="h-4 w-4" /> Quotation <strong>{quotation.quotation_number ?? quotation.id}</strong> · final price <strong>${quotation.final_price_usd?.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></p>
              <p><span style={{ color: "var(--text-muted)" }}>To:</span> {senderEmail}</p>
              <p><span style={{ color: "var(--text-muted)" }}>Subject:</span> {quotation.generated_subject}</p>
              <p><span style={{ color: "var(--text-muted)" }}>Format:</span> {fmt === "pdf" ? "Email text + PDF attachment" : fmt === "html" ? "Formatted email" : "Plain text email"}</p>
              {quotation.status === "sent" && <p className="rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-400" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>This quotation was already marked as sent. Sending again will send it a second time.</p>}
            </div>
          )}

          {step === "done" && (
            <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}><CheckCircle2 className="h-5 w-5 text-emerald-500" /> {doneInfo}</p>
          )}

          {error && <p className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--divider)" }}>
          <button type="button" onClick={onClose} className={`${btn} border`} style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>{step === "done" ? "Close" : "Cancel"}</button>
          {step === "select" && (
            <button type="button" disabled={busy || !quoteId} onClick={prepare} className={`${btn} text-white`} style={{ background: "var(--brand-accent)" }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Continue
            </button>
          )}
          {step === "review" && (
            <button type="button" disabled={busy} onClick={() => void post(false)} className={`${btn} text-white`} style={{ background: "var(--brand-accent)" }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Send now
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
