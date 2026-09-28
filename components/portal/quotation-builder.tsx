"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, FileText, Loader2, Mail, Send, Sparkles } from "lucide-react"
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
  const [templateId, setTemplateId]     = useState<number | null>(null)
  const [building, setBuilding]         = useState(false)
  const [sendingId, setSendingId]       = useState<number | null>(null)

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
        setTemplates(tpls)
        const def = tpls.find((t) => t.is_default && t.active)
        setTemplateId((prev) => prev ?? def?.template_id ?? tpls[0]?.template_id ?? null)
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

  async function handleBuild() {
    if (!selectedRow?.quote || !templateId) return
    setBuilding(true); setError(null)
    try {
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freight_request_id: request.id,
          carrier_quote_id: selectedRow.quote.id,
          quotation_template_id: templateId,
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

  async function handleSendToRequester(q: Quotation) {
    if (!request.senderEmail) { setError("This request has no requester email on file."); return }
    setSendingId(q.id)
    try {
      window.open(
        `mailto:${request.senderEmail}?subject=${encodeURIComponent(q.generated_subject ?? "")}&body=${encodeURIComponent(q.generated_body ?? "")}`,
        "_blank",
      )
      const res = await fetch("/api/quotations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: q.id, status: "sent" }),
      })
      if (res.ok) {
        setQuotations((list) => list.map((x) => x.id === q.id ? { ...x, status: "sent", sent_at: new Date().toISOString() } : x))
      }
    } finally {
      setSendingId(null)
    }
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
                onChange={(e) => setTemplateId(Number(e.target.value))}
                className="h-10 w-full rounded-md border px-3 text-sm"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
              >
                {templates.length === 0 && <option value="">No templates yet</option>}
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

          <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: "var(--table-header-bg)" }}>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Base ${baseRate.toLocaleString()} + markup → <strong>Final price</strong>
            </span>
            <span className="text-lg font-black tabular-nums" style={{ color: "var(--text-primary)" }}>
              ${finalPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <button
            onClick={handleBuild}
            disabled={building || !templateId}
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
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{q.generated_subject || "Quotation"}</span>
                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${q.status === "sent" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20" : "bg-[#FFF7ED] text-[#F97316]"}`}>
                  {q.status === "sent" ? <CheckCircle2 className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                  {q.status === "sent" ? "Sent" : "Draft"}
                </span>
              </div>
              <p className="mb-3 whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {q.generated_body}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  ${q.final_price_usd?.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
                {q.status === "draft" && (
                  <button
                    onClick={() => handleSendToRequester(q)}
                    disabled={sendingId === q.id}
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}
                  >
                    {sendingId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send to Requester
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
