"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  Reply,
  AlertTriangle,
  Check,
  CheckSquare,
} from "lucide-react"
import { useToast } from "@/components/ui/toast"
import {
  AogBadge,
  ConfidenceBadge,
  DgrBadge,
  ModeBadge,
  SourceBadge,
  StatusBadge,
  UrgencyBadge,
} from "@/components/portal/badges"
import { QuoteComparisonPanel } from "@/components/portal/quote-comparison-panel"
import {
  type Carrier,
  type CarrierRow,
  type ConversationMessage,
  type FreightRequest,
  type Template,
  type TemplateRow,
  templateVariables,
} from "@/lib/portal-data"

// ── helpers ──────────────────────────────────────────────────────────────────

function groupCarrierRows(rows: CarrierRow[]): Carrier[] {
  const map = new Map<number, Carrier>()
  for (const row of rows) {
    if (!map.has(row.carrier_id)) {
      map.set(row.carrier_id, { carrier_id: row.carrier_id, name: row.name, contacts: [] })
    }
    map.get(row.carrier_id)!.contacts.push({ contact_id: row.contact_id, name: row.contact_name, email: row.email, phone: row.phone ?? "" })
  }
  return Array.from(map.values())
}

function rowToTemplate(row: TemplateRow): Template {
  return {
    row_id: row.id, template_id: row.template_id, template_name: row.template_name, type: row.type,
    subject: row.subject, body: row.body, linked_carrier_ids: row.linked_carrier_ids, is_default: row.is_default,
    is_reply_template: row.is_reply_template, is_missing_reply_template: row.is_missing_reply_template,
    is_complete_reply_template: row.is_complete_reply_template, active: row.active, updated_at: row.updated_at,
  }
}

function parseArrayField(value: string | null | undefined): string {
  if (!value) return ""
  try { const p = JSON.parse(value); if (Array.isArray(p)) return p.join("\n") } catch { /**/ }
  return value
}

function stripHtml(html: string): string {
  if (!html) return ""
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n").trim()
}

function renderTemplateBody(tId: string, req: FreightRequest, carrier: Carrier | undefined, templates: Template[]): string {
  const t = templates.find((x) => String(x.template_id) === tId)
  if (!t) return ""
  const map: Record<string, string> = {
    sender_name: req.senderName, origin: `${req.originCity}, ${req.originCountry}`,
    destination: `${req.destinationCity}, ${req.destinationCountry}`, cargo_type: req.cargoType,
    weight: req.weight ?? "", equipment: parseArrayField(req.equipment), incoterm: req.incoterm ?? "",
    carrier_name: carrier?.name ?? "", missing_fields: (req.missingFields ?? []).join(", "),
  }
  return t.body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => map[key] ?? `{{${key}}}`)
}

const FIELD_MAP: Record<string, { getValue: (r: FreightRequest) => string | null; label: string }> = {
  cargoType:     { label: "Cargo Type",         getValue: (r) => r.cargoType },
  weight:        { label: "Weight",              getValue: (r) => r.weight },
  quantity:      { label: "Quantity",            getValue: (r) => r.quantity },
  dimensions:    { label: "Dimensions",          getValue: (r) => r.dimensions },
  equipment:     { label: "Equipment / Container", getValue: (r) => parseArrayField(r.equipment) },
  incoterm:      { label: "Incoterm",            getValue: (r) => r.incoterm },
  blType:        { label: "BL Type",             getValue: (r) => r.blType },
  preferredCarrier: { label: "Preferred Carrier", getValue: (r) => r.preferredCarrier },
}

function FieldRow({ label, value }: { label: string; value: string | null }) {
  const display = value && value !== "—" ? value : null
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid var(--divider)" }}>
      <span className="shrink-0 text-xs font-medium pt-0.5" style={{ color: "var(--text-muted)", minWidth: 140 }}>{label}</span>
      <span className="text-sm font-medium whitespace-pre-line flex-1 text-right" style={{ color: display ? "var(--text-primary)" : "#ef4444" }}>
        {display ?? "— Missing"}
      </span>
    </div>
  )
}

function CopyRow({ icon: Icon, value }: { icon: typeof Mail; value: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  function doCopy() {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={doCopy} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors" style={{ color: "var(--text-secondary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
      <span className="flex-1 truncate">{value}</span>
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 opacity-40" />}
    </button>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { success, error: toastError } = useToast()

  const [request, setRequest]       = useState<FreightRequest | null>(null)
  const [loading, setLoading]       = useState(true)
  const [carriers, setCarriers]     = useState<Carrier[]>([])
  const [templates, setTemplates]   = useState<Template[]>([])
  const [sendMethod, setSendMethod] = useState<"Email" | "Reply" | null>(null)
  const [selectedCarrierIds, setSelectedCarrierIds] = useState<string[]>([])
  const [templateId, setTemplateId] = useState("")
  const [replyTo, setReplyTo]       = useState("")
  const [messageBody, setMessageBody] = useState("")
  const [activeTab, setActiveTab]   = useState<"details" | "quotes">("details")
  const [rawOpen, setRawOpen]       = useState(false)
  const [sending, setSending]       = useState(false)
  const [aog, setAog]               = useState(false)
  const [dgr, setDgr]               = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/requests/${id}`)
      if (!res.ok) throw new Error("Not found")
      const data: FreightRequest = await res.json()
      setRequest(data)
      setAog(data.aog)
      setDgr(data.dgr)
    } catch {
      toastError("Failed to load", "Request not found or not accessible.")
    } finally {
      setLoading(false)
    }
  }, [id, toastError])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch("/api/carriers").then((r) => r.json()).then((rows: CarrierRow[]) => setCarriers(groupCarrierRows(rows))).catch(() => {})
    fetch("/api/templates").then((r) => r.json()).then((rows: TemplateRow[]) => setTemplates(rows.map(rowToTemplate))).catch(() => {})
  }, [])

  async function toggleFlag(flag: "aog" | "dgr") {
    if (!request) return
    const newAog = flag === "aog" ? !aog : aog
    const newDgr = flag === "dgr" ? !dgr : dgr
    setAog(newAog); setDgr(newDgr)
    try {
      await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, ...(flag === "aog" ? { aog: newAog } : { dgr: newDgr }) }),
      })
    } catch {
      setAog(aog); setDgr(dgr)
    }
  }

  async function handleSend() {
    if (!request || sending) return
    setSending(true)
    try {
      const selectedCarriers = carriers.filter((c) => selectedCarrierIds.includes(String(c.carrier_id)))
      const emailPayload = (sendMethod === "Email" && messageBody)
        ? { email_subject: templates.find((t) => String(t.template_id) === templateId)?.subject ?? null, email_body: messageBody }
        : sendMethod === "Reply" && messageBody
        ? { email_body: messageBody }
        : {}
      const res = await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          status: sendMethod === "Email" ? "Sent to Carrier" : "Approved - Reply, Sent",
          carrier_ids: sendMethod === "Email" ? selectedCarrierIds : [],
          ...emailPayload,
        }),
      })
      if (!res.ok) throw new Error("Failed")
      success("Sent!", sendMethod === "Email" ? "Carrier outreach initiated." : "Reply sent.")
      setSendMethod(null)
      setMessageBody("")
      load()
    } catch (e) {
      toastError("Failed to Send", e instanceof Error ? e.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="portal-page flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--brand-accent)" }} />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="portal-page p-6">
        <p style={{ color: "var(--text-secondary)" }}>Request not found.</p>
        <Link href="/requests" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--brand-accent)" }}>
          <ArrowLeft className="h-4 w-4" /> Back to Requests
        </Link>
      </div>
    )
  }

  const missingCount = request.missingFields?.length ?? 0
  const replyThread: ConversationMessage[] = Array.isArray(request.conversation) ? (request.conversation as ConversationMessage[]) : []
  const emailTemplates  = templates.filter((t) => t.type === "Email"    && t.active)
  const whatsappTemplates = templates.filter((t) => t.type === "WhatsApp" && t.active)

  return (
    <div className="portal-page flex flex-col" style={{ minHeight: "100vh" }}>

      {/* ── Back bar + header ────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #0f1e36 0%, #1a3352 60%, #1e3d5c 100%)" }}>
        {/* breadcrumb */}
        <div className="flex items-center gap-2 px-6 pt-4 pb-2">
          <Link href="/requests" className="flex items-center gap-1 text-xs font-medium text-white/50 hover:text-white/80 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Requests
          </Link>
          <span className="text-white/30 text-xs">/</span>
          <span className="text-xs text-white/70 truncate max-w-xs">{request.senderName}</span>
        </div>

        {/* sender + badges */}
        <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">{request.senderName}</h1>
              {aog && <AogBadge />}
              {dgr && <DgrBadge />}
              <StatusBadge status={request.status} />
            </div>
            {/* route */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">{request.originFlag} {request.originCity}</span>
              <ArrowRight className="h-4 w-4 text-white/40" />
              <span className="text-sm font-semibold text-white">{request.destinationFlag} {request.destinationCity}</span>
              <div className="flex items-center gap-1.5 ml-2 flex-wrap">
                {request.modes.map((m) => <ModeBadge key={m} mode={m} />)}
                <UrgencyBadge urgency={request.urgency} />
                <ConfidenceBadge confidence={request.confidence} />
              </div>
            </div>
          </div>
          <SourceBadge source={request.source} />
        </div>

        {/* tabs */}
        <div className="flex px-6 gap-1">
          {(["details", "quotes"] as const).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="px-4 py-2 text-sm font-semibold capitalize transition-colors"
              style={{
                color: activeTab === t ? "var(--brand-accent)" : "rgba(255,255,255,0.5)",
                borderBottom: activeTab === t ? "2px solid var(--brand-accent)" : "2px solid transparent",
              }}>
              {t === "details" ? "Shipment Details" : "Carrier Quotes"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6" style={{ background: "var(--page-bg)" }}>
        {activeTab === "quotes" ? (
          <QuoteComparisonPanel requestId={request.id} />
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">

            {/* Left — cargo + actions */}
            <div className="space-y-4 lg:col-span-3">

              {/* Cargo Details */}
              <div className="ds-card">
                <div className="ds-card-header">
                  <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Cargo Details</h3>
                  {missingCount > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                      {missingCount} missing
                    </span>
                  )}
                </div>
                <div className="px-5 pb-4">
                  {Object.entries(FIELD_MAP).map(([k, { label, getValue }]) => (
                    <FieldRow key={k} label={label} value={getValue(request)} />
                  ))}
                </div>
              </div>

              {/* Special requirements */}
              {request.specialRequirements && request.specialRequirements.length > 0 && (
                <div className="ds-card p-5">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Special Requirements</h4>
                  <ul className="space-y-1.5">
                    {request.specialRequirements.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--brand-accent)" }} />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Availability questions */}
              {request.availabilityQuestions && request.availabilityQuestions.length > 0 && (
                <div className="ds-card p-5">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Availability Questions</h4>
                  <ul className="space-y-1.5">
                    {request.availabilityQuestions.map((q, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                        <span className="mt-0.5 text-[10px] font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>{i + 1}.</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Raw message */}
              {request.rawMessage && (
                <div className="ds-card overflow-hidden">
                  <button onClick={() => setRawOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Raw Message</span>
                    {rawOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {rawOpen && (
                    <div className="border-t px-5 py-4" style={{ borderColor: "var(--divider)" }}>
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>
                        {request.rawMessage}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Send panel */}
              {sendMethod && (
                <div className="ds-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {sendMethod === "Email" ? "Send to Carrier" : `Reply to ${request.senderName}`}
                    </h4>
                    <button onClick={() => { setSendMethod(null); setMessageBody("") }} style={{ color: "var(--text-muted)" }}>
                      ✕
                    </button>
                  </div>
                  {sendMethod === "Email" && (
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Template</label>
                      <select value={templateId} onChange={(e) => {
                        setTemplateId(e.target.value)
                        const c = carriers.find((c) => selectedCarrierIds.includes(String(c.carrier_id)))
                        setMessageBody(renderTemplateBody(e.target.value, request, c, templates))
                      }}
                        className="h-9 w-full rounded-lg px-3 text-sm outline-none"
                        style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}>
                        <option value="">— Select a template —</option>
                        {emailTemplates.map((t) => <option key={t.template_id} value={String(t.template_id)}>{t.template_name}</option>)}
                      </select>
                    </div>
                  )}
                  {sendMethod === "Reply" && (
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Template</label>
                      <select value={templateId} onChange={(e) => {
                        setTemplateId(e.target.value)
                        setMessageBody(renderTemplateBody(e.target.value, request, undefined, templates))
                      }}
                        className="h-9 w-full rounded-lg px-3 text-sm outline-none"
                        style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}>
                        <option value="">— Select a template —</option>
                        {(request.source === "WhatsApp" ? whatsappTemplates : emailTemplates).map((t) => (
                          <option key={t.template_id} value={String(t.template_id)}>{t.template_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <textarea rows={6} value={messageBody} onChange={(e) => setMessageBody(e.target.value)}
                    placeholder="Type your message…"
                    className="w-full rounded-lg p-3 text-sm resize-none outline-none"
                    style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setSendMethod(null); setMessageBody("") }}
                      className="rounded-lg px-4 py-2 text-sm font-medium"
                      style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>
                      Cancel
                    </button>
                    <button onClick={handleSend} disabled={sending || !messageBody.trim()}
                      className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: "var(--brand-accent)" }}>
                      {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right — sidebar */}
            <div className="space-y-4 lg:col-span-2">

              {/* Sender */}
              <div className="ds-card p-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Sender</h4>
                <p className="font-semibold text-sm mb-2" style={{ color: "var(--text-primary)" }}>{request.senderName}</p>
                <CopyRow icon={Mail} value={request.senderEmail ?? ""} />
                <CopyRow icon={Phone} value={request.senderPhone ?? ""} />
                <div className="mt-2 flex items-center justify-between">
                  <SourceBadge source={request.source} />
                  <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{request.receivedRelative}</span>
                </div>
              </div>

              {/* Timeline */}
              <div className="ds-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Timeline</h4>
                  <StatusBadge status={request.status} />
                </div>
                <ul className="space-y-2.5">
                  {(request.history ?? []).map((h, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: h.done ? "var(--brand-accent)" : "var(--card-border)" }} />
                      <div>
                        <p className="text-xs font-medium" style={{ color: h.done ? "var(--text-primary)" : "var(--text-muted)" }}>{h.label}</p>
                        {h.time && <p className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{new Date(h.time).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Special flags */}
              <div className="ds-card p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Special Flags</h4>
                <div className="space-y-2">
                  {[
                    { key: "aog" as const, label: "AOG — Aircraft on Ground", color: "#ef4444", state: aog },
                    { key: "dgr" as const, label: "DGR — Dangerous Goods", color: "#f59e0b", state: dgr },
                  ].map(({ key, label, color, state }) => (
                    <button key={key} onClick={() => toggleFlag(key)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                      style={{ border: `1px solid ${state ? color + "40" : "var(--card-border)"}`, background: state ? color + "0a" : "transparent" }}>
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                        style={{ background: state ? color : "var(--card-border)" }}>
                        {state && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="text-xs font-medium" style={{ color: state ? color : "var(--text-secondary)" }}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reply thread */}
              <div className="ds-card p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Reply Thread</h4>
                {replyThread.length > 0 ? (
                  <div className="space-y-2">
                    {replyThread.map((msg, i) => (
                      <div key={i} className="rounded-lg p-3 text-xs leading-relaxed"
                        style={{
                          border: msg.role === "system" ? "1px solid rgba(59,130,246,0.2)" : "1px solid var(--card-border)",
                          background: msg.role === "system" ? "rgba(59,130,246,0.06)" : "var(--table-header-bg)",
                        }}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="font-semibold" style={{ color: msg.role === "system" ? "#3b82f6" : "var(--text-primary)" }}>
                            {msg.role === "system" ? "System" : request.senderName}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                            {new Date(msg.sent_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{stripHtml(msg.body)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg px-4 py-3 text-center text-xs" style={{ border: "1px dashed var(--card-border)", color: "var(--text-muted)" }}>
                    No replies sent yet.
                  </p>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Footer action bar ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-4 flex gap-3 flex-wrap" style={{ borderTop: "1px solid var(--divider)", background: "var(--card-bg)" }}>
        <button onClick={() => { setSendMethod("Email"); setActiveTab("details") }}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white transition-colors"
          style={{ background: "var(--brand-accent)", minWidth: 160 }}>
          <Mail className="h-4 w-4" /> Send to Carrier
        </button>
        <button
          onClick={() => {
            if (request.source === "WhatsApp") {
              window.open(`https://wa.me/${request.senderPhone}`, "_blank")
            } else {
              setSendMethod("Reply")
              setActiveTab("details")
            }
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-colors"
          style={{ border: "1px solid var(--card-border)", color: "var(--text-primary)", background: "var(--card-bg)", minWidth: 160 }}>
          <Reply className="h-4 w-4" />
          Reply to {request.senderName}
          {missingCount > 0 && (
            <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: "#ef4444" }}>
              {missingCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
