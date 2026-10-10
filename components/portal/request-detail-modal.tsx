"use client"

import { SpecialRequestsCard } from "@/components/portal/special-requests"
import { RequestTimeline } from "@/components/portal/request-timeline"
import { isSeaOnly, exwNeedsAddress, isExw, EXW_ALERT } from "@/lib/shipment-labels"
import { applyTemplate, templateHasRef } from "@/lib/template-render"
import { useEffect, useRef, useState } from "react"
import { useToast } from "@/components/ui/toast"
import {
  AlertTriangle, ArrowRight, Check, CheckSquare, ChevronDown, ChevronUp,
  Copy, Loader2, Lock, Mail, MessageCircle, Pencil, Phone, Reply, X
} from "lucide-react"
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
import { QuotationBuilder } from "@/components/portal/quotation-builder"
import {
  type Carrier,
  type CarrierRow,
  type ConversationMessage,
  type FreightRequest,
  type Template,
  type TemplateRow,
} from "@/lib/portal-data"

function groupCarrierRows(rows: CarrierRow[]): Carrier[] {
  const map = new Map<number, Carrier>()
  for (const row of rows) {
    if (!row.is_cc) {
      map.set(row.carrier_id, {
        row_id: row.id,
        carrier_id: row.carrier_id,
        carrier_name: row.carrier_name,
        person_name: row.person_name,
        role: row.role,
        email: row.email,
        number: row.number,
        is_sea: row.is_sea,
        is_air: row.is_air,
        is_land: row.is_land,
        lang: row.lang,
        routes: row.routes,
        active: row.active,
        auto_send_rfq: row.auto_send_rfq,
        cc_emails: [],
      })
    }
  }
  for (const row of rows) {
    if (row.is_cc && row.email) {
      const c = map.get(row.carrier_id)
      if (c) c.cc_emails.push(row.email)
    }
  }
  return Array.from(map.values())
}

function rowToTemplate(row: TemplateRow): Template {
  return {
    row_id: row.id,
    template_id: row.template_id,
    template_name: row.template_name,
    type: row.type,
    subject: row.subject,
    body: row.body,
    linked_carrier_ids: row.linked_carrier_ids,
    is_default: row.is_default,
    is_reply_template: row.is_reply_template,
    is_missing_reply_template: row.is_missing_reply_template,
    active: row.active,
    updated_at: row.updated_at,
  }
}

const FIELD_MAP: Record<string, { getValue: (r: FreightRequest) => string | null; label: string }> = {
  cargo_type: { getValue: (r) => r.cargoType,  label: "Cargo type" },
  weight:     { getValue: (r) => r.weight,     label: "Weight / tonnage" },
  dimensions: { getValue: (r) => r.dimensions, label: "Dimensions" },
  equipment:  { getValue: (r) => r.equipment,  label: "Equipment / container type" },
  incoterm:   { getValue: (r) => r.incoterm,   label: "Incoterm" },
  bl_type:    { getValue: (r) => r.blType,     label: "BL type" },
  // Only required when the shipment is EXW (non-EXW counts as filled).
  pickup_address: { getValue: (r) => (isExw(r.incoterm) ? (r.pickupAddress || null) : "n/a"), label: "Pickup address (EXW)" },
}

/* ── Sub-components ─────────────────────────────────────────── */

function FieldRow({ label, value }: { label: string; value: string | null }) {
  const display = parseArrayField(value)
  const missing = !display || display === "—"
  return (
    <div className="flex items-start gap-3 py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
      <span className="shrink-0 text-xs font-medium pt-0.5" style={{ color: "var(--text-muted)", minWidth: 120 }}>{label}</span>
      <span className={`text-sm font-medium whitespace-pre-line flex-1 text-right ${missing ? "text-red-500" : ""}`} style={{ color: missing ? "#ef4444" : "var(--text-primary)" }}>
        {missing ? "— Missing" : display}
      </span>
    </div>
  )
}

// Map from human label to DB field key
const LABEL_TO_FIELD: Record<string, string> = {
  "Cargo Type":    "cargo_type",
  "Equipment":     "equipment",
  "Weight":        "weight",
  "Quantity":      "quantity",
  "Dimensions":    "dimensions",
  "Incoterm":      "incoterm",
  "Pickup address (EXW)": "pickup_address",
  "BL Type":       "bl_type",
  "Pref. Carrier": "preferred_carrier",
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
  lockReason: string | null   // null = editable; string = tooltip message
  onSaved: (field: string, newVal: string) => void
  optional?: boolean
}) {
  const display = parseArrayField(value)
  const missing = !display || display === "—"
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState("")
  const [saving, setSaving]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(display === "—" ? "" : display ?? "")
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
    <div className="flex items-start gap-3 py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
      <span className="shrink-0 text-xs font-medium pt-0.5" style={{ color: "var(--text-muted)", minWidth: 120 }}>{label}</span>
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
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-end gap-1.5">
          <span className="text-sm font-medium whitespace-pre-line text-right" style={{ color: missing ? (optional ? "var(--text-muted)" : "#ef4444") : "var(--text-primary)" }}>
            {missing ? (optional ? "— only needed for EXW" : "— Missing") : display}
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
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
      <span className="flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>{value}</span>
      <button
        type="button"
        aria-label="Copy"
        onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className="transition-colors"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--brand-accent)" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)" }}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

/* ── Main modal ─────────────────────────────────────────────── */

export function RequestDetailModal({
  request,
  onClose,
  role,
  onFlagChange,
  requireCriticalData = false,
  criticalFields = [],
}: {
  request: FreightRequest
  onClose: () => void
  role?: "admin" | "operator" | "viewer"
  onFlagChange?: (id: string, aog: boolean, dgr: boolean) => void
  requireCriticalData?: boolean
  criticalFields?: string[]
}) {
  const [carriers, setCarriers]     = useState<Carrier[]>([])
  const [specialOpen, setSpecialOpen] = useState(false)
  const [templates, setTemplates]   = useState<Template[]>([])
  const [sendMethod, setSendMethod] = useState<"Email" | "Reply" | null>(null)
  const [selectedCarrierIds, setSelectedCarrierIds] = useState<string[]>([])
  const [templateId, setTemplateId] = useState("")
  const [replyTo, setReplyTo]       = useState("")
  const [messageBody, setMessageBody] = useState("")
  const [onlyCritical, setOnlyCritical] = useState(requireCriticalData)
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const { success: toastSuccess, error: toastError } = useToast()
  const [userHasCycle, setUserHasCycle]   = useState(false)
  const [showApprovalConfirm, setShowApprovalConfirm] = useState<"Email" | "Reply" | null>(null)
  const [activeTab, setActiveTab]         = useState<"details" | "quotes">("details")
  const [aogLocal, setAogLocal]           = useState(request.aog)
  const [dgrLocal, setDgrLocal]           = useState(request.dgr)
  const [flagSaving, setFlagSaving]       = useState(false)
  const [effectiveRole, setEffectiveRole] = useState<string | undefined>(role)
  const [rawExpanded, setRawExpanded]     = useState(false)
  const [rfqRefreshSignal, setRfqRefreshSignal] = useState(0)
  const sendPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/carriers")
      .then(r => r.ok ? r.json() : [])
      .then((rows: CarrierRow[]) => setCarriers(groupCarrierRows(rows)))
      .catch(() => {})

    fetch("/api/templates")
      .then(r => r.ok ? r.json() : [])
      .then((rows: TemplateRow[]) => setTemplates(rows.filter(row => row.type === "Email").map(rowToTemplate)))
      .catch(() => {})

    fetch("/api/approval-cycles")
      .then(r => r.ok ? r.json() : [])
      .then((cycles: Array<{initiator_usernames: string[]}>) => {
        const username = (() => { try { return sessionStorage.getItem("portal_username") ?? "" } catch { return "" } })()
        setUserHasCycle(cycles.some(c => c.initiator_usernames?.includes(username)))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (sendMethod) {
      setTimeout(() => sendPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
    }
  }, [sendMethod])

  useEffect(() => {
    if (!effectiveRole) {
      try {
        const r = sessionStorage.getItem("portal_role")
        if (r) setEffectiveRole(r)
      } catch { /* */ }
    }
  }, [effectiveRole])

  const canEditFlags = effectiveRole === "admin" || effectiveRole === "operator"

  async function toggleFlag(flag: "aog" | "dgr") {
    if (flagSaving) return
    setFlagSaving(true)
    const newAog = flag === "aog" ? !aogLocal : aogLocal
    const newDgr = flag === "dgr" ? !dgrLocal : dgrLocal
    try {
      const res = await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, ...(flag === "aog" ? { aog: newAog } : { dgr: newDgr }) }),
      })
      if (res.ok) {
        if (flag === "aog") setAogLocal(newAog)
        else setDgrLocal(newDgr)
        onFlagChange?.(request.id, newAog, newDgr)
      }
    } catch { /* */ } finally {
      setFlagSaving(false)
    }
  }

  const availableCarriersForEmail = carriers.filter((c) => {
    if (!c.email || !c.active) return false
    return (
      (request.modes.includes("Sea")  && c.is_sea) ||
      (request.modes.includes("Air")  && c.is_air) ||
      (request.modes.includes("Land") && c.is_land)
    )
  })

  const sentToCarrier = request.status === "Sent to Carrier"
    ? carriers.find((c) => c.carrier_name === request.preferredCarrier) ?? null
    : null

  const isReminder = request.status === "Sent to Carrier"

  const criticalMissingLabels = criticalFields
    .filter((key) => {
      const entry = FIELD_MAP[key]
      if (!entry) return false
      const val = entry.getValue(request)
      return !val || val === "—"
    })
    .map((key) => FIELD_MAP[key]?.label ?? key)

  const isCriticalBlocked = requireCriticalData && criticalMissingLabels.length > 0

  function buildReplyBody(onlyCrit: boolean): string {
    const allMissingEntries = Object.entries(FIELD_MAP)
      .filter(([, entry]) => {
        const val = entry.getValue(request)
        return !val || val === "—"
      })
    let missingFields: string[]
    if (onlyCrit && criticalFields.length > 0) {
      missingFields = allMissingEntries.filter(([key]) => criticalFields.includes(key)).map(([, entry]) => entry.label)
    } else {
      missingFields = allMissingEntries.map(([, entry]) => entry.label)
    }
    const lines: string[] = []
    lines.push(`Hi ${request.senderName},`)
    lines.push("")
    lines.push(`Thank you for your freight enquiry (${request.originCity} → ${request.destinationCity}). To provide you with an accurate rate, we need a few more details:`)
    lines.push("")
    if (missingFields.length > 0) {
      lines.push("Missing information:")
      missingFields.forEach((f) => lines.push(`  • ${f}`))
      lines.push("")
    }
    if (!onlyCrit && request.availabilityQuestions.length > 0) {
      lines.push("We also need to verify:")
      request.availabilityQuestions.forEach((q) => lines.push(`  • ${q}`))
      lines.push("")
    }
    lines.push("Please share the above at your earliest convenience so we can process your request.")
    lines.push("")
    lines.push("Best regards,")
    lines.push("Logistricks Operations")
    return lines.join("\n")
  }

  useEffect(() => {
    if (sendMethod === "Reply") {
      setMessageBody(buildReplyBody(onlyCritical))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyCritical])

  const missingCount = Object.values(FIELD_MAP).filter((e) => {
    const val = e.getValue(request)
    return !val || val === "—"
  }).length + request.availabilityQuestions.length

  async function submitForApproval() {
    setSubmittingApproval(true)
    try {
      const emailType = sendMethod === "Email" ? "carrier" : "reply"
      let emailTo: string | null = null
      let emailCc: string[] = []

      if (sendMethod === "Email") {
        const toAddresses: string[] = []
        for (const cid of selectedCarrierIds) {
          const carrier = carriers.find((c) => String(c.carrier_id) === cid)
          if (carrier) {
            toAddresses.push(carrier.email ? `${carrier.person_name} <${carrier.email}>` : carrier.person_name)
            emailCc.push(...(carrier.cc_emails ?? []))
          }
        }
        emailTo = toAddresses.join(", ") || null
      } else {
        emailTo = request.senderEmail
          ? `${request.senderName} <${request.senderEmail}>`
          : request.senderName ?? null
      }

      const emailTemplate = sendMethod === "Email"
        ? templates.find((x) => String(x.template_id) === templateId)
        : null
      const emailPayload = (sendMethod === "Email" && messageBody)
        ? { email_subject: emailTemplate?.subject ?? null, email_body: messageBody }
        : sendMethod === "Reply" && messageBody
        ? { email_body: messageBody }
        : {}

      const res = await fetch("/api/approval-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: request.id,
          email_type: emailType,
          email_to:   emailTo,
          email_cc:   emailCc.length > 0 ? emailCc : undefined,
          ...emailPayload,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as {error?: string}).error ?? "Failed to send for approval")
      }
      toastSuccess("Sent for Approval", "Your request has been submitted and is pending review.")
      onClose()
    } catch (e) {
      toastError("Failed to Send", e instanceof Error ? e.message : "Failed to send for approval")
    } finally {
      setSubmittingApproval(false)
    }
  }

  function openPanel(method: "Email" | "Reply") {
    setSendMethod(method)
    setTemplateId("")
    setMessageBody("")
    if (method === "Reply") {
      const contact = request.source === "Email" ? request.senderEmail : request.senderPhone
      setReplyTo(contact)
      setMessageBody(buildReplyBody(onlyCritical))
      setSelectedCarrierIds([])
    } else {
      if (isReminder && sentToCarrier) {
        setSelectedCarrierIds([String(sentToCarrier.carrier_id)])
      } else {
        setSelectedCarrierIds([])
      }
      setReplyTo("")
    }
  }

  function toggleCarrier(id: string) {
    setSelectedCarrierIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function onSelectTemplate(id: string) {
    setTemplateId(id)
    if (id) {
      const singleCarrier = selectedCarrierIds.length === 1
        ? carriers.find((c) => String(c.carrier_id) === selectedCarrierIds[0])
        : undefined
      setMessageBody(renderTemplateBody(id, request, singleCarrier, templates))
    } else {
      setMessageBody("")
    }
  }

  async function handleSend() {
    if (sendMethod === "Reply") {
      if (!replyTo) return
      if (userHasCycle) { setShowApprovalConfirm("Reply"); return }
      if (request.source === "Email") {
        const subj = encodeURIComponent(`Re: Freight Enquiry — ${request.originCity} → ${request.destinationCity}`)
        window.open(`mailto:${replyTo}?subject=${subj}&body=${encodeURIComponent(messageBody)}`, "_blank")
      } else {
        const phone = replyTo.replace(/[\s\-\(\)\+]/g, "")
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(messageBody)}`, "_blank")
      }
    } else if (sendMethod === "Email") {
      if (selectedCarrierIds.length === 0) return
      if (userHasCycle) { setShowApprovalConfirm("Email"); return }
      const t = templates.find((x) => String(x.template_id) === templateId)

      // Register the RFQ send so it shows up in the quote-comparison panel and
      // carrier replies can be correlated back to this request. Best-effort —
      // if this fails we still send the emails.
      const carrierIdNums = selectedCarrierIds.map((id) => Number(id)).filter((n) => !Number.isNaN(n))
      try {
        const res = await fetch("/api/rfq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ freight_request_id: request.id, carrier_ids: carrierIdNums }),
        })
        await res.text()
      } catch { /* non-fatal — proceed with sending regardless */ }

      for (const cid of selectedCarrierIds) {
        const c = carriers.find((x) => String(x.carrier_id) === cid)
        if (!c?.email) continue
        const perCarrierBody = templateId
          ? renderTemplateBody(templateId, request, c, templates)
          : messageBody
        // Subject: variables filled per carrier. The request number (LT-0034) is what carriers quote back; it is part of
        // the template (Request Ref # variable). A template without it still gets it, in the subject, so replies link.
        let subjectText = stripHtml(applyTemplate(t?.subject ?? "", templateVars(request, c), { keepUnknown: false }))
        if (request.requestRef && !(t && templateHasRef(t))) subjectText = `${subjectText} [${request.requestRef}]`.trim()
        const ccList = c.cc_emails ?? []
        let href = `mailto:${c.email}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(stripHtml(perCarrierBody))}`
        if (ccList.length > 0) href += `&cc=${encodeURIComponent(ccList.join(","))}`
        window.open(href, "_blank")
      }
      setRfqRefreshSignal((n) => n + 1)
    }
  }

  // ── Local field values (updated optimistically on save) ──────────────────
  const [fieldValues, setFieldValues] = useState<Record<string, string | null>>({
    cargoType:        request.cargoType,
    equipment:        request.equipment,
    weight:           request.weight,
    quantity:         request.quantity,
    dimensions:       request.dimensions,
    incoterm:         request.incoterm,
    blType:           request.blType,
    preferredCarrier: request.preferredCarrier,
    pickupAddress:    request.pickupAddress ?? "",
  })

  function handleFieldSaved(field: string, newVal: string) {
    // field is the DB key (e.g. "cargo_type"); map back to camelCase
    const DB_TO_CAMEL: Record<string, string> = {
      cargo_type: "cargoType", equipment: "equipment", weight: "weight",
      quantity: "quantity", dimensions: "dimensions", incoterm: "incoterm",
      bl_type: "blType", preferred_carrier: "preferredCarrier", pickup_address: "pickupAddress",
    }
    const camel = DB_TO_CAMEL[field] ?? field
    setFieldValues((prev) => ({ ...prev, [camel]: newVal }))
  }

  // All cargo fields for the details tab
  const cargoFields = [
    { label: "Cargo Type",   value: fieldValues.cargoType },
    { label: "Equipment",    value: fieldValues.equipment },
    { label: "Weight",       value: fieldValues.weight },
    { label: "Quantity",     value: fieldValues.quantity },
    { label: "Dimensions",   value: fieldValues.dimensions },
    { label: "Incoterm",     value: fieldValues.incoterm },
    { label: "Pickup address (EXW)", value: fieldValues.pickupAddress },
    { label: "BL Type",      value: fieldValues.blType },
    { label: "Pref. Carrier",value: fieldValues.preferredCarrier },
  ]

  // Locking logic:
  // - Temporary lock: last conversation message is from "system" (reply sent, awaiting sender)
  // - Permanent lock: carrier RFQ emails have been sent (status is Sent to Carrier / Quoted / Closed)
  const lastMsg = request.conversation?.[request.conversation.length - 1]
  const awaitingSenderReply = lastMsg?.role === "system"
  const carrierRfqSent = ["Sent to Carrier", "Quoted", "Closed"].includes(request.status)

  const fieldLockReason: string | null = carrierRfqSent
    ? "Locked — carrier RFQ already sent"
    : awaitingSenderReply
    ? "Waiting for reply from sender"
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[22px] shadow-2xl duration-200 animate-in fade-in zoom-in-95 sm:rounded-[22px]" style={{ background: "var(--card-bg)" }}>

        {/* ── Gradient header ──────────────────────────────────── */}
        <div
          className="shrink-0 px-7 py-6"
          style={{ background: "radial-gradient(700px 260px at 95% -40%, rgb(var(--brand-accent-rgb) / 0.30), transparent 60%), linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-navy-mid) 60%, var(--brand-navy-light) 100%)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <SourceBadge source={request.source} />
              <div className="min-w-0">
                {request.requestRef && (
                  <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--brand-accent)" }}>{request.requestRef}</p>
                )}
                <p className="font-display text-[24px] font-extrabold leading-tight text-white truncate">{request.senderName}</p>
                <p className="text-xs text-white/60 mt-0.5">{request.receivedExact}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {aogLocal && <AogBadge />}
              {dgrLocal && <DgrBadge />}
              <StatusBadge status={request.status} />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 ml-1 transition-colors"
                style={{ color: "rgba(255,255,255,0.6)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "white"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Route summary row */}
          <div className="mt-4 flex items-center gap-3 flex-wrap rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
            <div className="flex items-center gap-2">
              {isSeaOnly(request.modes) && <span className="text-[10px] font-bold uppercase text-white/50">POL</span>}
              <span className="font-display text-[17px] font-bold text-white">
                {request.originFlag} {request.originCity}
              </span>
              <ArrowRight className="h-4 w-4 text-white/40" />
              {isSeaOnly(request.modes) && <span className="text-[10px] font-bold uppercase text-white/50">POD</span>}
              <span className="font-display text-[17px] font-bold text-white">
                {request.destinationFlag} {request.destinationCity}
              </span>
              {exwNeedsAddress(request.incoterm, request.pickupAddress) && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(239,68,68,0.9)", color: "#fff" }}>⚠ {EXW_ALERT}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
              {request.modes.map((m) => <ModeBadge key={m} mode={m} />)}
              <UrgencyBadge urgency={request.urgency} />
              <ConfidenceBadge confidence={request.confidence} />
            </div>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────── */}
        <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--divider)", background: "var(--card-bg)" }}>
          {(["details", "quotes"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="px-6 py-3.5 text-[15px] font-bold capitalize transition-colors -mb-px"
              style={{
                borderBottom: activeTab === tab ? "2px solid var(--brand-accent)" : "2px solid transparent",
                color: activeTab === tab ? "var(--brand-accent)" : "var(--text-secondary)",
              }}
            >
              {tab === "details" ? "Shipment Details" : "Carrier Quotes"}
            </button>
          ))}
        </div>

        {/* ── Scrollable body ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ background: "var(--page-bg)" }}>

          {activeTab === "quotes" && (
            <div className="p-5">
              <QuoteComparisonPanel
                freightRequestId={request.id}
                key={rfqRefreshSignal}
                locked={request.status === "Closed"}
                onChanged={() => setRfqRefreshSignal((n) => n + 1)}
              />
              <QuotationBuilder request={request} refreshSignal={rfqRefreshSignal} />
            </div>
          )}

          {activeTab === "details" && (
            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-5">

              {/* ── Left column ────────────────────────────────── */}
              <div className="space-y-4 lg:col-span-3">

                {/* Cargo details */}
                <div className="ds-card">
                  <div className="ds-card-header">
                    <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Cargo Details</h4>
                    {fieldLockReason && (
                      <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: carrierRfqSent ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)", color: carrierRfqSent ? "#ef4444" : "#b45309" }}>
                        <Lock className="h-3 w-3" />
                        {carrierRfqSent ? "Locked" : "Awaiting reply"}
                      </span>
                    )}
                  </div>
                  <div className="group px-5 pb-2">
                    {cargoFields.map((f) => (
                      <EditableFieldRow
                        key={f.label}
                        requestId={request.id}
                        label={f.label}
                        value={f.value ?? null}
                        lockReason={fieldLockReason}
                        onSaved={handleFieldSaved}
                        optional={f.label === "Pickup address (EXW)" && !isExw(fieldValues.incoterm)}
                      />
                    ))}
                  </div>
                </div>

                {/* Special requests (preview + pop-up) */}
                <SpecialRequestsCard
                  requirements={request.specialRequirements ?? []}
                  questions={request.availabilityQuestions ?? []}
                  reference={request.requestRef}
                  openState={[specialOpen, setSpecialOpen]}
                />

                {/* Raw message — collapsible */}
                <div className="ds-card">
                  <button
                    type="button"
                    className="ds-card-header w-full flex items-center justify-between"
                    onClick={() => setRawExpanded((v) => !v)}
                  >
                    <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Raw Message</h4>
                    {rawExpanded
                      ? <ChevronUp className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                      : <ChevronDown className="h-4 w-4" style={{ color: "var(--text-muted)" }} />}
                  </button>
                  {rawExpanded && (
                    <div className="px-5 pb-4">
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg p-4 font-mono text-xs leading-relaxed" style={{ background: "var(--brand-navy)", color: "#e2e8f0" }}>
                        {request.rawMessage}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Send panel — inline */}
                {sendMethod && (
                  <div
                    ref={sendPanelRef}
                    className="ds-card duration-200 animate-in slide-in-from-bottom-2"
                  >
                    <div className="ds-card-header">
                      <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {sendMethod === "Reply" ? `Reply to ${request.senderName}` : "Send to Carrier via Email"}
                      </h4>
                      <button type="button" onClick={() => setSendMethod(null)} style={{ color: "var(--text-muted)" }}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-3 p-5">
                      {sendMethod === "Reply" ? (
                        <>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                              {request.source === "Email" ? "Email Address" : "WhatsApp Number"}
                            </label>
                            <input
                              value={replyTo}
                              onChange={(e) => setReplyTo(e.target.value)}
                              placeholder={request.source === "Email" ? "sender@example.com" : "+962 79 000 0000"}
                              className="ds-input w-full"
                            />
                          </div>
                          {criticalFields.length > 0 && (
                            <label className="flex cursor-pointer items-center gap-2.5">
                              <input type="checkbox" checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--brand-accent)" }} />
                              <span className="text-sm" style={{ color: "var(--text-primary)" }}>Only ask for critical missing data</span>
                              {onlyCritical && (
                                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgb(var(--brand-accent-rgb) / 0.12)", color: "var(--brand-accent)" }}>
                                  {criticalFields.join(", ").replace(/_/g, " ")}
                                </span>
                              )}
                            </label>
                          )}
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                              Message <span className="font-normal normal-case" style={{ color: "var(--text-muted)" }}>— editable before sending</span>
                            </label>
                            <textarea
                              value={messageBody}
                              onChange={(e) => setMessageBody(e.target.value)}
                              rows={8}
                              className="w-full rounded-lg px-3 py-2.5 font-mono text-xs leading-relaxed outline-none"
                              style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={handleSend} disabled={!replyTo}
                              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                              style={{ background: "var(--brand-navy)" }}>
                              {request.source === "Email" ? <><Mail className="h-4 w-4" /> Open in Email App</> : <><MessageCircle className="h-4 w-4" /> Open in WhatsApp</>}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                                Carrier {isReminder && <Lock className="h-3 w-3" style={{ color: "var(--text-muted)" }} />}
                              </label>
                              {isReminder && sentToCarrier ? (
                                <div className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm" style={{ border: "1px solid var(--card-border)", background: "var(--table-header-bg)", color: "var(--text-primary)" }}>
                                  <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                                  {sentToCarrier.carrier_name} — {sentToCarrier.person_name}
                                </div>
                              ) : (
                                <div className="max-h-44 overflow-y-auto rounded-lg" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)" }}>
                                  {availableCarriersForEmail.length === 0 ? (
                                    <p className="px-3 py-3 text-sm" style={{ color: "var(--text-muted)" }}>No carriers available for this mode.</p>
                                  ) : availableCarriersForEmail.map((c) => {
                                    const checked = selectedCarrierIds.includes(String(c.carrier_id))
                                    return (
                                      <label
                                        key={c.carrier_id}
                                        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors"
                                        style={{
                                          borderBottom: "1px solid var(--divider)",
                                          background: checked ? "rgb(var(--brand-accent-rgb) / 0.06)" : "transparent",
                                        }}
                                      >
                                        <input type="checkbox" checked={checked} onChange={() => toggleCarrier(String(c.carrier_id))} className="h-4 w-4" style={{ accentColor: "var(--brand-accent)" }} />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                                            {c.carrier_name}
                                            <span className="ml-1.5 font-normal" style={{ color: "var(--text-secondary)" }}>— {c.person_name}</span>
                                          </p>
                                          <p className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                                            {c.email}
                                            {c.cc_emails.length > 0 && <span className="ml-1.5" style={{ color: "var(--text-muted)" }}>CC: {c.cc_emails.join(", ")}</span>}
                                          </p>
                                        </div>
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Template</label>
                              <select
                                value={templateId}
                                onChange={(e) => onSelectTemplate(e.target.value)}
                                className="h-10 w-full rounded-lg px-3 text-sm outline-none"
                                style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
                              >
                                <option value="">Select template…</option>
                                {templates.map((t) => (
                                  <option key={t.template_id} value={String(t.template_id)}>
                                    {t.template_name}{t.is_default ? " (Default)" : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                              Message <span className="font-normal normal-case" style={{ color: "var(--text-muted)" }}>— editable before sending</span>
                            </label>
                            <textarea
                              value={messageBody}
                              onChange={(e) => setMessageBody(e.target.value)}
                              rows={7}
                              placeholder="Type your message here, or select a template above to pre-fill…"
                              className="w-full rounded-lg px-3 py-2.5 font-mono text-xs leading-relaxed outline-none"
                              style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={handleSend} disabled={selectedCarrierIds.length === 0}
                              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                              style={{ background: "var(--brand-accent)" }}>
                              <Mail className="h-4 w-4" />
                              {isReminder ? "Send Reminder via Email" : "Open in Email App"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right sidebar ───────────────────────────────── */}
              <div className="space-y-4 lg:col-span-2">

                {/* Sender card */}
                <div className="ds-card">
                  <div className="ds-card-header">
                    <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Sender</h4>
                  </div>
                  <div className="space-y-2.5 px-5 pb-4">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{request.senderName}</p>
                    <CopyRow icon={Mail} value={request.senderEmail} />
                    <CopyRow icon={Phone} value={request.senderPhone} />
                    <div className="flex items-center gap-2 pt-1">
                      <SourceBadge source={request.source} />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{request.receivedExact}</span>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="ds-card">
                  <div className="ds-card-header">
                    <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Timeline</h4>
                    <StatusBadge status={request.status} />
                  </div>
                  <RequestTimeline requestId={request.id} refreshKey={request.status} />
                </div>

                {/* Special flags */}
                <div className="ds-card">
                  <div className="ds-card-header">
                    <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Special Flags</h4>
                  </div>
                  <div className="space-y-3 px-5 pb-4">
                    {/* AOG */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AogBadge />
                        <span className="text-sm" style={{ color: "var(--text-primary)" }}>Aircraft on Ground</span>
                      </div>
                      {canEditFlags ? (
                        <button
                          type="button"
                          disabled={flagSaving}
                          onClick={() => toggleFlag("aog")}
                          aria-pressed={aogLocal}
                          aria-label="Toggle AOG flag"
                          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50"
                          style={{ background: aogLocal ? "#ef4444" : "var(--card-border)" }}
                        >
                          <span className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: aogLocal ? "translateX(24px)" : "translateX(4px)" }} />
                        </button>
                      ) : (
                        <span className="text-xs font-bold" style={{ color: aogLocal ? "#ef4444" : "var(--text-muted)" }}>{aogLocal ? "YES" : "NO"}</span>
                      )}
                    </div>
                    {/* DGR */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <DgrBadge />
                        <span className="text-sm" style={{ color: "var(--text-primary)" }}>Dangerous Goods</span>
                      </div>
                      {canEditFlags ? (
                        <button
                          type="button"
                          disabled={flagSaving}
                          onClick={() => toggleFlag("dgr")}
                          aria-pressed={dgrLocal}
                          aria-label="Toggle DGR flag"
                          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50"
                          style={{ background: dgrLocal ? "#f97316" : "var(--card-border)" }}
                        >
                          <span className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: dgrLocal ? "translateX(24px)" : "translateX(4px)" }} />
                        </button>
                      ) : (
                        <span className="text-xs font-bold" style={{ color: dgrLocal ? "#f97316" : "var(--text-muted)" }}>{dgrLocal ? "YES" : "NO"}</span>
                      )}
                    </div>
                    {canEditFlags && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Auto-detected from keywords. Toggle to override.</p>}
                  </div>
                </div>

                {/* Reply thread */}
                <div className="ds-card">
                  <div className="ds-card-header">
                    <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Reply Thread</h4>
                  </div>
                  <div className="px-5 pb-4">
                    {request.conversation && request.conversation.length > 0 ? (
                      <div className="space-y-2">
                        {request.conversation.map((msg: ConversationMessage, i: number) => (
                          <div
                            key={i}
                            className="rounded-lg p-3 text-xs leading-relaxed"
                            style={{
                              border: msg.role === "system"
                                ? "1px solid rgba(59,130,246,0.2)"
                                : "1px solid var(--card-border)",
                              background: msg.role === "system"
                                ? "rgba(59,130,246,0.06)"
                                : "var(--table-header-bg)",
                            }}
                          >
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
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div className="shrink-0" style={{ borderTop: "1px solid var(--divider)", background: "var(--card-bg)" }}>
          <div className="flex gap-3 p-4">
            {/* Send to Carrier */}
            <div className="flex flex-1 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => !isCriticalBlocked && openPanel("Email")}
                disabled={isCriticalBlocked}
                title={isCriticalBlocked ? `Missing critical data: ${criticalMissingLabels.join(", ")}` : undefined}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all"
                style={{
                  background: isCriticalBlocked
                    ? "rgb(var(--brand-accent-rgb) / 0.4)"
                    : sendMethod === "Email"
                    ? "#c8701a"
                    : "var(--brand-accent)",
                  cursor: isCriticalBlocked ? "not-allowed" : "pointer",
                }}
              >
                <Mail className="h-4 w-4" />
                {isReminder ? "Send Reminder" : "Send to Carrier"}
                {isCriticalBlocked && <Lock className="h-3.5 w-3.5 opacity-70" />}
              </button>
              {isCriticalBlocked && (
                <div className="flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs" style={{ border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)", color: "#92400e" }}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>Missing: <strong>{criticalMissingLabels.join(", ")}</strong></span>
                </div>
              )}
            </div>

            {/* Reply to Sender */}
            <div className="flex flex-1 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => !awaitingSenderReply && openPanel("Reply")}
                disabled={awaitingSenderReply}
                title={awaitingSenderReply ? "Awaiting sender reply" : undefined}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all"
                style={{
                  border: "1px solid var(--card-border)",
                  background: awaitingSenderReply ? "var(--table-header-bg)" : sendMethod === "Reply" ? "var(--brand-navy)" : "var(--card-bg)",
                  color: awaitingSenderReply ? "var(--text-muted)" : sendMethod === "Reply" ? "white" : "var(--text-primary)",
                  cursor: awaitingSenderReply ? "not-allowed" : "pointer",
                }}
              >
                <Reply className="h-4 w-4" />
                {awaitingSenderReply ? "Awaiting reply…" : `Reply to ${request.senderName}`}
                {missingCount > 0 && !awaitingSenderReply && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: "#ef4444" }}>
                    {missingCount}
                  </span>
                )}
              </button>
              {awaitingSenderReply && (
                <p className="text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Reply sent{request.replySentType ? ` (${request.replySentType.replace(/_/g, " ")})` : ""}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Approval confirmation dialog ──────────────────────── */}
        {showApprovalConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-t-2xl bg-black/40 sm:rounded-2xl">
            <div className="mx-4 w-full max-w-sm rounded-xl p-6 shadow-2xl" style={{ background: "var(--card-bg)" }}>
              <div className="mb-1 flex items-center gap-2">
                <CheckSquare className="h-5 w-5" style={{ color: "var(--brand-accent)" }} />
                <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Send for Approval</h3>
              </div>
              <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                {showApprovalConfirm === "Email"
                  ? "This request will be routed through your approval workflow before the carrier email is sent."
                  : "This reply will be routed through your approval workflow before it is sent."}
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowApprovalConfirm(null)}
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                  style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingApproval}
                  onClick={async () => { await submitForApproval(); setShowApprovalConfirm(null) }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                  style={{ background: "var(--brand-accent)" }}
                >
                  {submittingApproval ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────────── */

function templateVars(req: FreightRequest, carrier: Carrier | undefined): Record<string, string> {
  return {
    request_ref: req.requestRef ?? "",
    origin_city: req.originCity, origin_country: req.originCountry,
    destination_city: req.destinationCity, destination_country: req.destinationCountry,
    cargo_type: req.cargoType, equipment: req.equipment, weight: req.weight,
    quantity: req.quantity, dimensions: req.dimensions, incoterm: req.incoterm,
    bl_type: req.blType, mode: req.modes.join(", "), urgency: req.urgency, pickup_address: req.pickupAddress ?? "",
    sender_name: req.senderName, sender_email: req.senderEmail,
    received_date: req.receivedExact, preferred_carrier: req.preferredCarrier,
    contact_name: carrier?.person_name ?? "there", carrier_name: carrier?.carrier_name ?? "",
    carrier_email: carrier?.email ?? "", carrier_phone: carrier?.number ?? "",
  }
}

function renderTemplateBody(tId: string, req: FreightRequest, carrier: Carrier | undefined, templates: Template[]): string {
  const t = templates.find((x) => String(x.template_id) === tId)
  if (!t) return ""
  return applyTemplate(t.body, templateVars(req, carrier), { keepUnknown: true })
}

function parseArrayField(value: string | null | undefined): string {
  if (!value) return ""
  try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.join("\n") } catch { /* not JSON */ }
  return value
}

function stripHtml(html: string): string {
  if (!html) return ""
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\u200b/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
