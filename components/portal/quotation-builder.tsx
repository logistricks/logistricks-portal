"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Copy, Download, ExternalLink, FileText, Loader2, Mail, Printer, Send, Sparkles, X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { downloadQuotationPdf } from "@/lib/quotation-pdf"
import { fetchQuotesForRequest, type CarrierQuoteRequest } from "@/lib/carrier-quotes-queries"
import { ConfirmStepsDialog } from "@/components/portal/confirm-steps-dialog"
import { isExpiredDate } from "@/lib/validity"
import { type QuotationTemplate, type FreightRequest } from "@/lib/portal-data"

export interface Quotation {
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
  show_markup_percent?: boolean | null
  generated_html?: string | null
  generated_format?: "text" | "html" | "pdf" | null
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
export function SendQuotationModal({
  quotation,
  recipient,
  threadId,
  onClose,
  onSaved,
  onMarkSent,
  pageSize,
}: {
  quotation: Quotation
  recipient: string
  threadId: string | null
  onClose: () => void
  onSaved: (id: number, subject: string, body: string) => void
  onMarkSent: (id: number) => Promise<void>
  pageSize: "a4" | "letter"
}) {
  const [subject, setSubject] = useState(quotation.generated_subject ?? "")
  const [body, setBody]       = useState(quotation.generated_body ?? "")
  const [notice, setNotice]   = useState<string | null>(null)
  const [opened, setOpened]   = useState(false)
  const [marking, setMarking] = useState(false)

  const isHtml = quotation.generated_format === "html" && !!quotation.generated_html
  const isPdf = quotation.generated_format === "pdf" && !!quotation.generated_html
  const pdfName = `Quotation ${quotation.quotation_number ?? quotation.id}`
  const [pdfBusy, setPdfBusy] = useState(false)

  async function handleDownloadPdf(): Promise<boolean> {
    setPdfBusy(true)
    try { await downloadQuotationPdf({ quotationId: quotation.id }, pdfName); return true }
    catch (e) { setNotice(`Couldn't create the PDF (${(e as Error).message}). Use Print instead.`); return false }
    finally { setPdfBusy(false) }
  }
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
    const pdfOk = isPdf ? await handleDownloadPdf() : true
    const copied = isHtml ? await copyHtml(quotation.generated_html!, body) || await copyText(body) : await copyText(body)
    window.open(gmailThreadUrl(threadId), "_blank", "noopener")
    setOpened(true)
    setNotice(copied
      ? isPdf
        ? `Email text copied${pdfOk ? " and the PDF downloaded" : ""}. Click Reply in the thread, paste the text and attach the PDF.`
        : "Message copied with its formatting. Click Reply in the thread and paste it."
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
            {isPdf && (
              <div className="mb-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>PDF attachment</p>
                <iframe title="PDF preview" sandbox="" srcDoc={htmlFrame(quotation.generated_html!)} className="h-72 w-full rounded-md border bg-white" style={{ borderColor: "var(--card-border)" }} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void handleDownloadPdf()} disabled={pdfBusy} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--brand-accent)" }}>
                    {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download PDF
                  </button>
                  <button type="button" onClick={() => printHtml(quotation.generated_html!)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                    <Printer className="h-3.5 w-3.5" /> Print
                  </button>
                </div>
                <p className="pt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Email text</p>
              </div>
            )}
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


type ChargesStyle = "marked_up" | "detailed" | "total_only"
type PriceLine = { label: string; basis: string; qty: number | null; rate: number | null; amount: number; currency?: string }

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
  const [showPct, setShowPct]     = useState(false)
  const [markupMap, setMarkupMap] = useState<Record<string, { markup_type: "flat" | "percent"; markup_amount: number; show_markup_percent: boolean; charges_style?: ChargesStyle | null; price_lines?: PriceLine[] | null }>>({})
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "unavailable" | "partial">("idle")
  const lastKey = useRef<string>("")
  const savedRef = useRef<typeof markupMap>({}) // what was last saved per quote, so switching quotes back and forth shows current values
  const [templateId, setTemplateId]     = useState<number | null>(null) // null = automatic (matches the quote mode, else the default)
  const [building, setBuilding]         = useState(false)
  const [sendingQuotation, setSendingQuotation] = useState<Quotation | null>(null)
  const [expiredPrompt, setExpiredPrompt] = useState<{ q: Quotation; msg: string } | null>(null)
  const [preview, setPreview] = useState<{ template_name: string; generated_subject: string; generated_html: string | null; generated_body: string; quotation_number: string; final_price_usd?: number; base_rate_usd?: number; charges_style?: ChargesStyle; lines?: PriceLine[]; mixed_currency?: boolean } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [styleOverride, setStyleOverride] = useState<ChargesStyle | null>(null) // null = what the template says (default: markup inside each price)
  const [overrides, setOverrides] = useState<PriceLine[] | null>(null)       // manually edited prices; null = automatic

  async function load() {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      const [quoteRows, tplRes, quoteDocsRes, markupRes] = await Promise.all([
        fetchQuotesForRequest(supabase, request.id),
        fetch("/api/quotation-templates"),
        fetch(`/api/quotations?freight_request_id=${request.id}`),
        fetch(`/api/carrier-quotes/markup?freight_request_id=${request.id}`),
      ])
      setRows(quoteRows)
      if (markupRes.ok) { const m = (await markupRes.json()).markups ?? {}; savedRef.current = m; setMarkupMap(m) }
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
    () => rows.filter((r) => r.status === "responded" && r.quote && !r.quote.disregarded),
    [rows],
  )

  useEffect(() => {
    if (!selectedQuoteId && responded.length > 0) setSelectedQuoteId(responded[0].quote!.id)
  }, [responded, selectedQuoteId])

  const selectedRow = responded.find((r) => r.quote?.id === selectedQuoteId)
  const baseRateSaved = selectedRow?.quote?.rateUsd ?? 0
  const markupNum = Number(markupAmount) || 0
  // The server knows the true carrier price (falls back to the charge lines when no headline rate was stored).
  const baseRate = baseRateSaved || preview?.base_rate_usd || 0

  // Load the markup saved for the selected quote (or start at 0).
  useEffect(() => {
    if (!selectedQuoteId) return
    const saved = savedRef.current[String(selectedQuoteId)] ?? markupMap[String(selectedQuoteId)]
    const t = saved?.markup_type ?? "flat", a = String(saved?.markup_amount ?? 0), p = saved?.show_markup_percent ?? false
    const st = saved?.charges_style ?? null, pl = saved?.price_lines?.length ? saved.price_lines : null
    setMarkupType(t); setMarkupAmount(a); setShowPct(p); setStyleOverride(st); setOverrides(pl); setSaveState(saved ? "saved" : "idle")
    lastKey.current = JSON.stringify([selectedQuoteId, t, Number(a) || 0, p, st, pl])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuoteId, markupMap])

  // Save the markup as soon as it is entered, so it is still there when this request is reopened.
  useEffect(() => {
    if (!selectedQuoteId) return
    const key = JSON.stringify([selectedQuoteId, markupType, markupNum, showPct, styleOverride, overrides])
    if (key === lastKey.current) return
    const timer = setTimeout(async () => {
      setSaveState("saving")
      try {
        const res = await fetch("/api/carrier-quotes/markup", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ carrier_quote_id: selectedQuoteId, markup_type: markupType, markup_amount: markupNum, show_markup_percent: showPct, charges_style: styleOverride, price_lines: overrides }),
        })
        const d = await res.json().catch(() => ({}))
        if (res.ok && d.saved) {
          lastKey.current = key
          savedRef.current = { ...savedRef.current, [String(selectedQuoteId)]: { markup_type: markupType, markup_amount: markupNum, show_markup_percent: showPct, charges_style: styleOverride, price_lines: overrides } }
          setSaveState(d.extras_saved === false && (styleOverride || overrides) ? "partial" : "saved")
        } else setSaveState("unavailable")
      } catch { setSaveState("unavailable") }
    }, 700)
    return () => clearTimeout(timer)
  }, [selectedQuoteId, markupType, markupNum, showPct, styleOverride, overrides])
  const autoFinal = markupType === "percent"
    ? Math.round(baseRate * (1 + markupNum / 100) * 100) / 100
    : Math.round((baseRate + markupNum) * 100) / 100
  const finalPrice = overrides ? Math.round(overrides.reduce((t, l) => t + (Number(l.amount) || 0), 0) * 100) / 100 : autoFinal
  const shownStyle: ChargesStyle = styleOverride ?? preview?.charges_style ?? "marked_up"
  const editableLines = overrides ?? preview?.lines ?? []
  function editLine(i: number, patch: Partial<PriceLine>) {
    setOverrides((cur) => {
      const base = (cur ?? preview?.lines ?? []).map((l) => ({ ...l }))
      base[i] = { ...base[i], ...patch }
      return base
    })
  }
  const removeLine = (i: number) => setOverrides((cur) => (cur ?? preview?.lines ?? []).filter((_, k) => k !== i))
  const addLine = () => setOverrides((cur) => [...(cur ?? preview?.lines ?? []), { label: "", basis: "", qty: null, rate: null, amount: 0 }])

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
            quotation_template_id: templateId ?? undefined, markup_type: markupType, markup_amount: Number(markupAmount) || 0, show_markup_percent: showPct,
            charges_style: styleOverride ?? undefined, line_overrides: overrides ?? undefined,
          }),
        })
        setPreview(res.ok ? await res.json() : null)
      } catch { /* aborted or offline */ }
      finally { setPreviewing(false) }
    }, 400)
    return () => { clearTimeout(timer); ctl.abort() }
  }, [selectedQuoteId, templateId, markupType, markupAmount, showPct, styleOverride, overrides, templates.length, request.id])

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
          show_markup_percent: showPct,
          charges_style: styleOverride ?? undefined,
          line_overrides: overrides ?? undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Server error ${res.status}`)
      }
      const created: Quotation & { rich_saved?: boolean } = await res.json()
      setQuotations((q) => [created, ...q])
      if (created.rich_saved === false) setError("The quotation was saved as plain text because the database update for rich quotations hasn't been run (migrations 042 and 043). Run them, then create the quotation again.")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBuilding(false)
    }
  }

  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null)
  async function handleCardPdf(q: Quotation) {
    setPdfBusyId(q.id); setError(null)
    try { await downloadQuotationPdf({ quotationId: q.id }, `Quotation ${q.quotation_number ?? q.id}`) }
    catch (e) { setError(`Couldn't create the PDF: ${(e as Error).message}`) }
    finally { setPdfBusyId(null) }
  }

  function handleSendToRequester(q: Quotation) {
    if (!request.senderEmail) { setError("This request has no requester email on file."); return }
    setError(null)
    const cq = rows.find((r) => r.quote?.id === q.carrier_quote_id)?.quote
    const day = (d?: string | null) => new Date(String(d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    const msg = isExpiredDate(cq?.validityDate) ? `The carrier quote expired on ${day(cq?.validityDate)}. The carrier may no longer honour this price.`
      : isExpiredDate(q.valid_until) ? `Quotation ${q.quotation_number ?? q.id} expired on ${day(q.valid_until)}.` : null
    if (msg) { setExpiredPrompt({ q, msg }); return }
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
                <span className="ml-2 font-normal normal-case tracking-normal">
                  {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "unavailable" ? "Not saved — database update pending" : saveState === "partial" ? "Markup saved — edited prices need database update 045" : ""}
                </span>
              </label>
              <input
                type="number"
                value={markupAmount}
                onChange={(e) => setMarkupAmount(e.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
              />
            </div>

            {markupType === "percent" && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2" style={{ color: "var(--text-primary)" }}>
                <input type="checkbox" checked={showPct} onChange={(e) => setShowPct(e.target.checked)} className="h-4 w-4" />
                Show the percentage on the quotation (e.g. &ldquo;Service fee (10%)&rdquo;)
              </label>
            )}
          </div>

          {(selectedRow?.quote as { reviewStatus?: string | null } | undefined)?.reviewStatus === "needs_review" && (
            <p className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--text-primary)" }}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This carrier quote was flagged for review (e.g. totals that don&apos;t add up or inferred values). Check it on the Carrier Quotes tab before sending a price to the requester.
            </p>
          )}
          <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--card-border)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>How the markup is shown</label>
              <select
                value={shownStyle}
                onChange={(e) => { setStyleOverride(e.target.value as ChargesStyle); setOverrides(null) }}
                className="h-8 rounded-md border px-2 text-xs"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
              >
                <option value="marked_up">Included in each price (no fee line)</option>
                <option value="detailed">Separate markup row</option>
                <option value="total_only">Total only</option>
              </select>
            </div>
            {shownStyle !== "total_only" && !overrides && preview?.mixed_currency && editableLines.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>This quote has charges in several currencies. They are listed as the carrier stated them; the total is the all-in USD price (carrier total + markup).</p>
                {editableLines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md px-2 py-1 text-xs" style={{ background: "var(--table-header-bg)", color: "var(--text-primary)" }}>
                    <span>{l.label}</span><span className="tabular-nums">{l.currency ?? "USD"} {Number(l.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            )}
            {shownStyle !== "total_only" && editableLines.length > 0 && !(preview?.mixed_currency && !overrides) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Customer prices — edit any amount and the total updates.</span>
                  {overrides && <button type="button" onClick={() => setOverrides(null)} className="text-[11px] font-semibold underline" style={{ color: "var(--text-secondary)" }}>Reset to automatic</button>}
                </div>
                {editableLines.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={l.label} onChange={(e) => editLine(i, { label: e.target.value })} placeholder="Description" className="h-8 min-w-0 flex-1 rounded-md border px-2 text-xs" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }} />
                    <input type="number" step="0.01" value={Number.isFinite(l.amount) ? l.amount : 0} onChange={(e) => editLine(i, { amount: Number(e.target.value) })} className="h-8 w-28 rounded-md border px-2 text-right text-xs tabular-nums" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }} />
                    <button type="button" onClick={() => removeLine(i)} aria-label="Remove line" className="px-1 text-sm" style={{ color: "var(--text-muted)" }}>×</button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <button type="button" onClick={addLine} className="text-[11px] font-semibold underline" style={{ color: "var(--text-secondary)" }}>+ Add a line</button>
                  {overrides && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Manually edited · markup entered above is ignored</span>}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: "var(--table-header-bg)" }}>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {overrides ? <>Base ${baseRate.toLocaleString()} → edited prices → <strong>Total</strong></> : <>Base ${baseRate.toLocaleString()} + markup → <strong>Final price</strong></>}
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
                <div className="flex items-center">
                {q.generated_html && (
                  <button type="button" onClick={() => handleCardPdf(q)} disabled={pdfBusyId === q.id}
                    className="mr-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                    style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                    {pdfBusyId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download PDF
                  </button>
                )}
                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${q.status === "sent" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20" : "bg-[color-mix(in_srgb,var(--brand-accent)_10%,white)] text-[var(--brand-accent)]"}`}>
                  {q.status === "sent" ? <CheckCircle2 className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                  {q.status === "sent" ? "Sent" : "Draft"}
                </span>
                </div>
              </div>
              {q.generated_format === "pdf" && q.generated_html ? (
                <div className="mb-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>PDF attachment</p>
                  <iframe title={`Quotation ${q.id}`} sandbox="" srcDoc={htmlFrame(q.generated_html)} className="h-72 w-full rounded-md border bg-white" style={{ borderColor: "var(--card-border)" }} />
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Email text</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{q.generated_body}</p>
                </div>
              ) : q.generated_format === "html" && q.generated_html ? (
                <iframe title={`Quotation ${q.id}`} sandbox="" srcDoc={htmlFrame(q.generated_html)} className="mb-3 h-72 w-full rounded-md border bg-white" style={{ borderColor: "var(--card-border)" }} />
              ) : (
                <p className="mb-3 whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {q.generated_body}
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  ${q.final_price_usd?.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  <span className="ml-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    base ${q.base_rate_usd?.toLocaleString("en-US", { minimumFractionDigits: 2 })} + markup {q.markup_type === "percent" ? `${q.markup_amount}%` : `$${q.markup_amount?.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                  </span>
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

      <ConfirmStepsDialog
        open={expiredPrompt !== null}
        steps={[{ title: "This quote has expired", body: <>{expiredPrompt?.msg} <strong>Send it to the requester anyway?</strong></>, confirmLabel: "Send anyway" }]}
        onConfirm={() => { const q = expiredPrompt?.q ?? null; setExpiredPrompt(null); if (q) setSendingQuotation(q) }}
        onCancel={() => setExpiredPrompt(null)}
      />

      {sendingQuotation && (
        <SendQuotationModal
          quotation={sendingQuotation}
          recipient={request.senderEmail}
          threadId={request.gmailThreadId}
          onClose={() => setSendingQuotation(null)}
          onSaved={handleEditsSaved}
          onMarkSent={handleMarkSent}
          pageSize={(templates.find((t) => t.template_id === sendingQuotation.quotation_template_id)?.options as { page_size?: string } | null)?.page_size === "letter" ? "letter" : "a4"}
        />
      )}
    </div>
  )
}
