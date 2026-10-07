"use client"

import { SpecialRequestsCard } from "@/components/portal/special-requests"
import { RequestOutcomePanel } from "@/components/portal/request-outcome-panel"
import { RequestTimeline } from "@/components/portal/request-timeline"
import { useCallback, useEffect, useRef, useState } from "react"
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
  Pencil,
  Phone,
  Reply,
  AlertTriangle,
  Check,
  CheckSquare,
} from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { isSeaOnly, exwNeedsAddress, isExw, POL_LABEL, POD_LABEL, EXW_ALERT } from "@/lib/shipment-labels"
import { applyTemplate } from "@/lib/template-render"
import {
  AogBadge,
  ConfidenceBadge,
  DgrBadge,
  ModeBadge,
  SourceBadge,
  StatusBadge,
  UrgencyBadge,
} from "@/components/portal/badges"
import { IntakeBadge } from "@/components/portal/intake-badge"
import { EmailDropZone } from "@/components/portal/email-drop-zone"
import { QuoteComparisonPanel } from "@/components/portal/quote-comparison-panel"
import { QuotationBuilder } from "@/components/portal/quotation-builder"
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
    weight: req.weight ?? "", equipment: parseArrayField(req.equipment), incoterm: req.incoterm ?? "", pickup_address: req.pickupAddress ?? "", request_ref: req.requestRef ?? "",
    carrier_name: carrier?.name ?? "", missing_fields: (req.missingFields ?? []).join(", "),
  }
  return applyTemplate(t.body, map, { keepUnknown: true })
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

// Map from display label to DB field key
const LABEL_TO_FIELD: Record<string, string> = {
  "Cargo Type":          "cargo_type",
  "Weight":              "weight",
  "Quantity":            "quantity",
  "Dimensions":          "dimensions",
  "Equipment / Container": "equipment",
  "Incoterm":            "incoterm",
  "Pickup Address (EXW)": "pickup_address",
  [POL_LABEL]:           "origin_city",
  [POD_LABEL]:           "destination_city",
  "BL Type":             "bl_type",
  "Preferred Carrier":   "preferred_carrier",
}

function EditableFieldRow({
  requestId,
  label,
  value,
  lockReason,
  onSaved,
  optional,
}: {
  requestId: string
  label: string
  value: string | null
  lockReason: string | null
  onSaved: (field: string, newVal: string) => void
  optional?: boolean
}) {
  const display = value && value !== "—" ? value : null
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState("")
  const [saving, setSaving]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(display ?? "")
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function save() {
    const field = LABEL_TO_FIELD[label]
    if (!field) { setEditing(false); return }
    setSaving(true)
    try {
      const res = await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId, fields: { [field]: draft } }),
      })
      if (!res.ok) throw new Error("Save failed")
      onSaved(field, draft)
      setEditing(false)
    } catch {
      /* keep editing open so user can retry */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid var(--divider)" }}>
      <span className="shrink-0 text-xs font-medium pt-0.5" style={{ color: "var(--text-muted)", minWidth: 140 }}>{label}</span>
      {editing ? (
        <div className="flex flex-1 items-center gap-1.5">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false) }}
            className="flex-1 rounded border px-2 py-1 text-sm"
            style={{ borderColor: "var(--brand-accent)", background: "var(--card-bg)", color: "var(--text-primary)", outline: "none" }}
          />
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--brand-accent)" }}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded px-2 py-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-end gap-1.5">
          <span className="text-sm font-medium whitespace-pre-line text-right" style={{ color: display ? "var(--text-primary)" : optional ? "var(--text-muted)" : "#ef4444" }}>
            {display ?? (optional ? "— only needed for EXW" : "— Missing")}
          </span>
          {LABEL_TO_FIELD[label] && (
            lockReason ? (
              <span title={lockReason} className="cursor-not-allowed opacity-40">
                <Lock className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
              </span>
            ) : (
              <button
                onClick={startEdit}
                title="Edit field"
                className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--brand-accent)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)" }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </div>
      )}
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
  const [specialOpen, setSpecialOpen] = useState(false)
  const [rfqRefreshSignal, setRfqRefreshSignal] = useState(0)
  const [sending, setSending]       = useState(false)
  const [aog, setAog]               = useState(false)
  const [dgr, setDgr]               = useState(false)
  const [fieldValues, setFieldValues] = useState<Record<string, string | null>>({})

  function handleFieldSaved(field: string, newVal: string) {
    const DB_TO_CAMEL: Record<string, string> = {
      cargo_type: "cargoType", equipment: "equipment", weight: "weight",
      quantity: "quantity", dimensions: "dimensions", incoterm: "incoterm",
      bl_type: "blType", preferred_carrier: "preferredCarrier",
      pickup_address: "pickupAddress", origin_city: "originCity", destination_city: "destinationCity",
    }
    const camel = DB_TO_CAMEL[field] ?? field
    setFieldValues((prev) => ({ ...prev, [camel]: newVal }))
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/requests/${id}`)
      if (!res.ok) throw new Error("Not found")
      const data: FreightRequest = await res.json()
      setRequest(data)
      setAog(data.aog)
      setDgr(data.dgr)
      setFieldValues({
        cargoType:        data.cargoType,
        equipment:        data.equipment,
        weight:           data.weight,
        quantity:         data.quantity,
        dimensions:       data.dimensions,
        incoterm:         data.incoterm,
        blType:           data.blType,
        preferredCarrier: data.preferredCarrier,
        pickupAddress:    data.pickupAddress ?? "",
        originCity:       data.originCity,
        destinationCity:  data.destinationCity,
      })
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
  const seaOnly = isSeaOnly(request.modes)
  const curIncoterm = fieldValues.incoterm ?? request.incoterm
  const exwMissing = exwNeedsAddress(curIncoterm, fieldValues.pickupAddress ?? request.pickupAddress)
  const replyThread: ConversationMessage[] = Array.isArray(request.conversation) ? (request.conversation as ConversationMessage[]) : []
  const emailTemplates  = templates.filter((t) => t.type === "Email"    && t.active)
  const whatsappTemplates = templates.filter((t) => t.type === "WhatsApp" && t.active)

  return (
    <div className="portal-page flex flex-col" style={{ minHeight: "100vh" }}>

      {/* ── Back bar + header ────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-navy-mid) 60%, var(--brand-navy-light) 100%)" }}>
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
            <div
              className="font-mono text-[13px] font-medium mb-0.5"
              style={{ color: "rgba(255,255,255,0.55)", letterSpacing: "0.02em" }}
            >
              {request.requestRef ?? (request.id ? `LT-${request.id}` : "")}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">{request.senderName}</h1>
              {aog && <AogBadge />}
              {dgr && <DgrBadge />}
              <StatusBadge status={request.status} />
            </div>
            {/* route / POL → POD */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {seaOnly && <span className="text-[10px] font-bold uppercase tracking-wide text-white/50">POL</span>}
              <span className="text-sm font-semibold text-white">{request.originFlag} {fieldValues.originCity ?? request.originCity}</span>
              <ArrowRight className="h-4 w-4 text-white/40" />
              {seaOnly && <span className="text-[10px] font-bold uppercase tracking-wide text-white/50">POD</span>}
              <span className="text-sm font-semibold text-white">{request.destinationFlag} {fieldValues.destinationCity ?? request.destinationCity}</span>
              {exwMissing && (
                <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}>
                  <AlertTriangle className="h-3 w-3" /> {EXW_ALERT}
                </span>
              )}
              <div className="flex items-center gap-1.5 ml-2 flex-wrap">
                {request.modes.map((m) => <ModeBadge key={m} mode={m} />)}
                <UrgencyBadge urgency={request.urgency} />
                <ConfidenceBadge confidence={request.confidence} />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5"><SourceBadge source={request.source} /><IntakeBadge source={request.intakeSource} light />{request.intakeFilename && <span className="text-[10px] text-white/40">{request.intakeFilename}</span>}</div>
        </div>

        {/* outcome & booking: the decision on this request, always at the top */}
        <div className="px-6 pb-3">
          <RequestOutcomePanel requestId={request.id} refreshSignal={rfqRefreshSignal} status={request.status} />
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
          <div>
            <div className="mb-4">
              <EmailDropZone kind="carrier_reply" freightRequestId={request.id} compact onDone={() => setRfqRefreshSignal((n) => n + 1)} />
            </div>
            <QuoteComparisonPanel
              key={rfqRefreshSignal}
              freightRequestId={request.id}
              locked={request.status === "Closed"}
              onChanged={() => setRfqRefreshSignal((n) => n + 1)}
            />
            <QuotationBuilder request={request} refreshSignal={rfqRefreshSignal} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">

            {/* Left — cargo + actions */}
            <div className="space-y-4 lg:col-span-3">

              {/* Cargo Details */}
              {(() => {
                const lastMsg = replyThread[replyThread.length - 1]
                const awaitingSenderReply = lastMsg?.role === "system"
                const carrierRfqSent = ["Sent to Carrier", "Quoted", "Closed"].includes(request.status)
                const fieldLockReason: string | null = carrierRfqSent
                  ? "Locked — carrier RFQ already sent"
                  : awaitingSenderReply
                  ? "Waiting for reply from sender"
                  : null

                const displayFields = [
                  ...(seaOnly ? [
                    { label: POL_LABEL, camel: "originCity" },
                    { label: POD_LABEL, camel: "destinationCity" },
                  ] : []),
                  { label: "Cargo Type",           camel: "cargoType" },
                  { label: "Weight",                camel: "weight" },
                  { label: "Quantity",              camel: "quantity" },
                  { label: "Dimensions",            camel: "dimensions" },
                  { label: "Equipment / Container", camel: "equipment" },
                  { label: "Incoterm",              camel: "incoterm" },
                  { label: "Pickup Address (EXW)", camel: "pickupAddress" },
                  { label: "BL Type",               camel: "blType" },
                  { label: "Preferred Carrier",     camel: "preferredCarrier" },
                ]

                return (
                  <div className="ds-card">
                    <div className="ds-card-header">
                      <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Cargo Details</h3>
                      <div className="flex items-center gap-2">
                        {missingCount > 0 && (
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                            {missingCount} missing
                          </span>
                        )}
                        {fieldLockReason && (
                          <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: carrierRfqSent ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)", color: carrierRfqSent ? "#ef4444" : "#b45309" }}>
                            <Lock className="h-3 w-3" />
                            {carrierRfqSent ? "Locked" : "Awaiting reply"}
                          </span>
                        )}
                      </div>
                    </div>
                    {exwMissing && (
                      <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Needs attention: incoterm is EXW but there is no pickup address from the requester or a carrier quote. Add one below or ask the requester.</span>
                      </div>
                    )}
                    <div className="group px-5 pb-4">
                      {displayFields.map(({ label, camel }) => (
                        <EditableFieldRow
                          key={label}
                          requestId={request.id}
                          label={label}
                          value={fieldValues[camel] ?? null}
                          lockReason={fieldLockReason}
                          onSaved={handleFieldSaved}
                          optional={camel === "pickupAddress" && !isExw(curIncoterm)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Special requests (preview + pop-up) */}
              <SpecialRequestsCard
                requirements={request.specialRequirements ?? []}
                questions={request.availabilityQuestions ?? []}
                reference={request.requestRef}
                openState={[specialOpen, setSpecialOpen]}
              />

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
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace" }}>
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
                <RequestTimeline requestId={request.id} refreshKey={request.status} />
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
      {activeTab !== "quotes" && (
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
      )}
    </div>
  )
}
