"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, FileText, Loader2, Mail, Printer, Send, Sparkles, X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { fetchQuotesForRequest, type CarrierQuoteRequest } from "@/lib/carrier-quotes-queries"
import { type QuotationTemplate, type FreightRequest } from "@/lib/portal-data"

interface Quotation {
  id: number
  carrier_quote_id: number | null
  quotation_template_id: number
  base_rate_usd: number | null
  markup_type: "flat" | "percent"
  markup_amount: number
  final_price_usd: number | null
  generated_subject: string | null
  generated_body: string | null
  status: "draft" | "sent"
  sent_at: string | null
  created_at: string
  generated_html?: string | null
  generated_format?: "text" | "html" | null
  quotation_number?: string | null
  valid_until?: string | null
  currency?: string | null
}

/** Deep link to a Gmail thread. `#all/` resolves regardless of label or inbox state. */
function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`
}

/** Copies formatted HTML (pastes with layout into Gmail / Outlook) with a plain-text fallback. */
async function copyHtml(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined") return false
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    })])
    return true
  } catch {
    return false
  }
}

function printHtml(html: string) {
  const w = window.open("", "_blank")
  if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:24px;font-family:Arial,Helvetica,sans-serif}table{border-collapse:collapse}</style></head><body>${html}</body></html>`)
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
}

function htmlFrame(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1e293b}table{border-collapse:collapse}img{max-width:100%}</style></head><body>${html}</body></html>`
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Popup shown when sending a quotation to the requester. The price was just
 * built in the portal, so the email is sent by the user from their own mailbox:
 * the popup copies the text and jumps straight to the requester's original
 * thread so the reply lands in the same conversation.
 */
function SendQuotationModal({
  quotation,
  recipient,
  threadId,
  onClose,
  onSaved,
  onMarkSent,
}: {
  quotation: Quotation
  recipient: string
  threadId: string | null
  onClose: () => void
  onSaved: (id: number, subject: string, body: string) => void
  onMarkSent: (id: number) => Promise<void>
}) {
  const [subject, setSubject] = useState(quotation.generated_subject ?? "")
  const [body, setBody]       = useState(quotation.generated_body ?? "")
  const [notice, setNotice]   = useState<string | null>(null)
  const [opened, setOpened]   = useState(false)
  const [marking, setMarking] = useState(false)

  const isHtml = quotation.generated_format === "html" && !!quotation.generated_html
  const dirty = subject !== (quotation.generated_subject ?? "") || (!isHtml && body !== (quotation.generated_body ?? ""))

  // Persist edits so the stored quotation matches what was actually sent.
  async function saveEdits() {
    if (!dirty) return
    const res = await fetch("/api/quotations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isHtml ? { id: quotation.id, generated_subject: subject } : { id: quotation.id, generated_subject: subject, generated_body: body }),
    })
    if (res.ok) onSaved(quotation.id, subject, body)
  }

  async function handleOpenThread() {
    if (!threadId) return
    const copied = isHtml ? await copyHtml(quotation.generated_html!, body) || await copyText(body) : await copyText(body)
    window.open(gmailThreadUrl(threadId), "_blank", "noopener")
    setOpened(true)
    setNotice(copied
      ? "Message copied with its formatting. Click Reply in the thread and paste it."
      : "Couldn't copy automatically — use Copy message, then paste it into the reply.")
    void saveEdits()
  }

  function handleOpenMailApp() {
    window.open(
      `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 1800))}`,
      "_blank",
    )
    setOpened(true)
    void saveEdits()
  }

  async function handleCopyFormatted() {
    const ok = await copyHtml(quotation.generated_html!, body)
    setNotice(ok ? "Formatted quotation copied — paste it into your email." : "Your browser couldn't copy formatted text. Use \"Copy plain text\" instead.")
  }

  async function handleCopy(what: "subject" | "body") {
    const ok = await copyText(what === "subject" ? subject : body)
    setNotice(ok ? `${what === "subject" ? "Subject" : "Message"} copied.` : "Copy failed — select the text and copy it manually.")
  }

  async function handleMarkSent() {
    setMarking(true)
    await saveEdits()
    await onMarkSent(quotation.id)
    setMarking(false)
    onClose()
  }

  const inputStyle = { borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl shadow-2xl"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Send quotation to requester"
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--divider)" }}>
          <div>
            <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Send quotation to requester</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Final price ${quotation.final_price_usd?.toLocaleString("en-US", { minimumFractionDigits: 2 })} · review, then send from your mailbox
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5" style={{ color: "var(--text-muted)" }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>To</label>
            <div className="flex h-10 items-center rounded-md border px-3 text-sm" style={inputStyle}>{recipient}</div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Subject</label>
              <button type="button" onClick={() => handleCopy("subject")} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: "var(--brand-accent)" }}>
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-10 w-full rounded-md border px-3 text-sm" style={inputStyle} />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Message</label>
              <button type="button" onClick={() => handleCopy("body")} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: "var(--brand-accent)" }}>
                <Copy className="h-3 w-3" /> Copy plain text
              </button>
            </div>
            {isHtml ? (
              <div className="space-y-2">
                <iframe title="Quotation preview" sandbox="" srcDoc={htmlFrame(quotation.generated_html!)} className="h-80 w-full rounded-md border bg-white" style={{ borderColor: "var(--card-border)" }} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleCopyFormatted} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                    <Copy className="h-3.5 w-3.5" /> Copy formatted
                  </button>
                  <button type="button" onClick={() => printHtml(quotation.generated_html!)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                    <Printer className="h-3.5 w-3.5" /> Print / Save PDF
                  </button>
                </div>
              </div>
            ) : (
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="w-full rounded-md border px-3 py-2 text-sm leading-relaxed" style={inputStyle} />
            )}
          </div>

          {notice && (
            <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)" }}>{notice}</p>
          )}
          {!threadId && (
            <p className="rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-400" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
              This request has no linked email thread, so the message will open as a new email instead.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4" style={{ borderColor: "var(--divider)" }}>
          <button
            type="button"
            onClick={handleMarkSent}
            disabled={marking}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--card-border)", color: opened ? "var(--text-primary)" : "var(--text-muted)" }}
          >
            {marking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            I&apos;ve sent it — mark as sent
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenMailApp}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}
            >
              <Mail className="h-3.5 w-3.5" /> New email
            </button>
            {threadId && (
              <button
                type="button"
                onClick={handleOpenThread}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-white"
                style={{ background: "var(--brand-accent)" }}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Copy &amp; open email thread
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function QuotationBuilder({
  request,
  refreshSignal,
}: {
  request: FreightRequest
  refreshSignal: number
}) {
  const [rows, setRows]           = useState<CarrierQuoteRequest[]>([])
  const [templates, setTemplates] = useState<QuotationTemplate[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null)
  const [markupType, setMarkupType]     = useState<"flat" | "percent">("flat")
  const [markupAmount, setMarkupAmount] = useState<string>("0")
  const [templateId, setTemplateId]     = useState<number | null>(null) // null = automatic (matches the quote mode, else the default)
  const [building, setBuilding]         = useState(false)
  const [sendingQuotation, setSendingQuotation] = useState<Quotation | null>(null)
  const [preview, setPreview] = useState<{ template_name: string; generated_subject: string; generated_html: string | null; generated_body: string; quotation_number: string } | null>(null)
  const [previewing, setPreviewing] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      const [quoteRows, tplRes, quoteDocsRes] = await Promise.all([
        fetchQuotesForRequest(supabase, request.id),
        fetch("/api/quotation-templates"),
        fetch(`/api/quotations?freight_request_id=${request.id}`),
      ])
      setRows(quoteRows)
      if (tplRes.ok) {
        const tpls: QuotationTemplate[] = await tplRes.json()
        setTemplates(tpls.filter((t) => t.active))
      }
      if (quoteDocsRes.ok) setQuotations(await quoteDocsRes.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [request.id, refreshSignal])

  const responded = useMemo(
    () => rows.filter((r) => r.status === "responded" && r.quote),
    [rows],
  )

  useEffect(() => {
    if (!selectedQuoteId && responded.length > 0) setSelectedQuoteId(responded[0].quote!.id)
  }, [responded, selectedQuoteId])

  const selectedRow = responded.find((r) => r.quote?.id === selectedQuoteId)
  const baseRate = selectedRow?.quote?.rateUsd ?? 0
  const markupNum = Number(markupAmount) || 0
  const finalPrice = markupType === "percent"
    ? Math.round(baseRate * (1 + markupNum / 100) * 100) / 100
    : Math.round((baseRate + markupNum) * 100) / 100

  // Live preview of the chosen template with the chosen quote and markup (nothing is saved).
  useEffect(() => {
    if (!selectedQuoteId || templates.length === 0) { setPreview(null); return }
    const ctl = new AbortController()
    const timer = setTimeout(async () => {
      setPreviewing(true)
      try {
        const res = await fetch("/api/quotations", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
          body: JSON.stringify({
            preview: true, freight_request_id: request.id, carrier_quote_id: selectedQuoteId,
            quotation_template_id: templateId ?? undefined, markup_type: markupType, markup_amount: Number(markupAmount) || 0,
          }),
        })
        setPreview(res.ok ? await res.json() : null)
      } catch { /* aborted or offline */ }
      finally { setPreviewing(false) }
    }, 400)
    return () => { clearTimeout(timer); ctl.abort() }
  }, [selectedQuoteId, templateId, markupType, markupAmount, templates.length, request.id])

  async function handleBuild() {
    if (!selectedRow?.quote || templates.length === 0) return
    setBuilding(true); setError(null)
    try {
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freight_request_id: request.id,
          carrier_quote_id: selectedRow.quote.id,
          quotation_template_id: templateId ?? undefined,
          markup_type: markupType,
          markup_amount: markupNum,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Server error ${res.status}`)
      }
      const created: Quotation = await res.json()
      setQuotations((q) => [created, ...q])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBuilding(false)
    }
  }

  function handleSendToRequester(q: Quotation) {
    if (!request.senderEmail) { setError("This request has no requester email on file."); return }
    setError(null)
    setSendingQuotation(q)
  }

  // Only called once the user confirms they actually sent the email.
  async function handleMarkSent(id: number) {
    const res = await fetch("/api/quotations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "sent" }),
    })
    if (res.ok) {
      setQuotations((list) => list.map((x) => x.id === id ? { ...x, status: "sent", sent_at: new Date().toISOString() } : x))
    } else {
      setError("Couldn't mark the quotation as sent. Try again.")
    }
  }

  function handleEditsSaved(id: number, subject: string, body: string) {
    setQuotations((list) => list.map((x) => x.id === id ? { ...x, generated_subject: subject, generated_body: body } : x))
    setSendingQuotation((cur) => cur && cur.id === id ? { ...cur, generated_subject: subject, generated_body: body } : cur)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-4 border-t pt-6" style={{ borderColor: "var(--divider)" }}>
      <h3 className="flex items-center gap-2 text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
        <Sparkles className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
        Build Quotation for Requester
      </h3>

      {error && <p className="rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</p>}

      {responded.length === 0 ? (
        <div className="rounded border border-dashed px-4 py-6 text-center text-sm" style={{ borderColor: "var(--card-border)", color: "var(--text-muted)" }}>
          Waiting for at least one carrier to respond with a rate before a quotation can be built.
        </div>
      ) : (
        <div className="ds-card space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Carrier Quote</label>
              <select
                value={selectedQuoteId ?? ""}
                onChange={(e) => setSelectedQuoteId(Number(e.target.value))}
                className="h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
              >
                {responded.map((r) => (
                  <option key={r.quote!.id} value={r.quote!.id}>
                    {r.carrierName} — ${r.quote!.rateUsd?.toLocaleString() ?? "—"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Quotation Template</label>
              <select
                value={templateId ?? ""}
                onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
                className="h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
              >
                {templates.length === 0 ? <option value="">No templates yet — add one in Templates → Quotation</option> : <option value="">Automatic (matches the mode, else the default)</option>}
                {templates.map((t) => (
                  <option key={t.template_id} value={t.template_id}>{t.template_name}{t.is_default ? " (Default)" : ""}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Markup Type</label>
              <select
                value={markupType}
                onChange={(e) => setMarkupType(e.target.value as "flat" | "percent")}
                className="h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
              >
                <option value="flat">Flat amount ($)</option>
                <option value="percent">Percentage (%)</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                {markupType === "percent" ? "Markup %" : "Markup $"}
              </label>
              <input
                type="number"
                value={markupAmount}
                onChange={(e) => setMarkupAmount(e.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
              />
            </div>
          </div>

          {(selectedRow?.quote as { reviewStatus?: string | null } | undefined)?.reviewStatus === "needs_review" && (
            <p className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--text-primary)" }}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This carrier quote was flagged for review (e.g. totals that don&apos;t add up or inferred values). Check it on the Carrier Quotes tab before sending a price to the requester.
            </p>
          )}
          <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: "var(--table-header-bg)" }}>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Base ${baseRate.toLocaleString()} + markup → <strong>Final price</strong>
            </span>
            <span className="text-lg font-black tabular-nums" style={{ color: "var(--text-primary)" }}>
              ${finalPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>

          {(preview || previewing) && (
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Preview{preview?.template_name ? ` — ${preview.template_name}` : ""}
                {previewing && <Loader2 className="h-3 w-3 animate-spin" />}
              </p>
              {preview && (
                <>
                  <p className="mb-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>Subject: <span className="font-semibold">{preview.generated_subject}</span></p>
                  {preview.generated_html ? (
                    <iframe title="Quotation preview" sandbox="" srcDoc={htmlFrame(preview.generated_html)} className="h-96 w-full rounded-md border bg-white" style={{ borderColor: "var(--card-border)" }} />
                  ) : (
                    <p className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-xs" style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}>{preview.generated_body}</p>
                  )}
                </>
              )}
            </div>
          )}

          <button
            onClick={handleBuild}
            disabled={building || templates.length === 0}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--brand-accent)" }}
          >
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Create Quotation
          </button>
        </div>
      )}

      {quotations.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Generated Quotations</p>
          {quotations.map((q) => (
            <div key={q.id} className="ds-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {q.generated_subject || "Quotation"}
                  {q.quotation_number && <span className="ml-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>{q.quotation_number}</span>}
                </span>
                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${q.status === "sent" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20" : "bg-[#FFF7ED] text-[#F97316]"}`}>
                  {q.status === "sent" ? <CheckCircle2 className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                  {q.status === "sent" ? "Sent" : "Draft"}
                </span>
              </div>
              {q.generated_format === "html" && q.generated_html ? (
                <iframe title={`Quotation ${q.id}`} sandbox="" srcDoc={htmlFrame(q.generated_html)} className="mb-3 h-72 w-full rounded-md border bg-white" style={{ borderColor: "var(--card-border)" }} />
              ) : (
                <p className="mb-3 whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {q.generated_body}
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  ${q.final_price_usd?.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
                {q.status === "draft" && (
                  <button
                    onClick={() => handleSendToRequester(q)}
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold"
                    style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send to Requester
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {sendingQuotation && (
        <SendQuotationModal
          quotation={sendingQuotation}
          recipient={request.senderEmail}
          threadId={request.gmailThreadId}
          onClose={() => setSendingQuotation(null)}
          onSaved={handleEditsSaved}
          onMarkSent={handleMarkSent}
        />
      )}
    </div>
  )
}
