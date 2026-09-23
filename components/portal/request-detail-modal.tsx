"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, CheckSquare, Copy, Loader2, Lock, Mail, MessageCircle, Phone, Reply, X } from "lucide-react"
import {
  AogBadge,
  ConfidenceBadge,
  DgrBadge,
  ModeBadge,
  SourceBadge,
  StatusBadge,
  UrgencyBadge,
} from "@/components/portal/badges"
import {
  type Carrier,
  type CarrierRow,
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
}

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
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [sendMethod, setSendMethod] = useState<"Email" | "Reply" | null>(null)
  const [selectedCarrierIds, setSelectedCarrierIds] = useState<string[]>([])
  const [templateId, setTemplateId] = useState("")
  const [replyTo, setReplyTo] = useState("")
  const [messageBody, setMessageBody] = useState("")
  const [onlyCritical, setOnlyCritical] = useState(requireCriticalData)
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const [userHasCycle, setUserHasCycle] = useState(false)
  const [showApprovalConfirm, setShowApprovalConfirm] = useState<"Email" | "Reply" | null>(null)
  const [aogLocal, setAogLocal]           = useState(request.aog)
  const [dgrLocal, setDgrLocal]           = useState(request.dgr)
  const [flagSaving, setFlagSaving]       = useState(false)
  const [effectiveRole, setEffectiveRole] = useState<string | undefined>(role)
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

  const sentToCarrier =
    request.status === "Sent to Carrier"
      ? carriers.find((c) => c.carrier_name === request.preferredCarrier) ?? null
      : null

  const selectedCarrier = carriers.find((c) => String(c.carrier_id) === carrierId)
  const isReminder       = request.status === "Sent to Carrier"

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
      const res = await fetch("/api/approval-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: request.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as {error?: string}).error ?? "Failed to send for approval")
      }
      onClose()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to send for approval")
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

  function handleSend() {
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
      const subj = encodeURIComponent(t?.subject ?? "")
      for (const cid of selectedCarrierIds) {
        const c = carriers.find((x) => String(x.carrier_id) === cid)
        if (!c?.email) continue
        const perCarrierBody = templateId
          ? renderTemplateBody(templateId, request, c, templates)
          : messageBody
        const ccList = c.cc_emails ?? []
        let href = `mailto:${c.email}?subject=${subj}&body=${encodeURIComponent(perCarrierBody)}`
        if (ccList.length > 0) href += `&cc=${encodeURIComponent(ccList.join(","))}`
        window.open(href, "_blank")
      }
    }
  }

  const fields: { label: string; value: string | null }[] = [
    { label: "Origin", value: `${request.originCity}, ${request.originCountry}` },
    { label: "Destination", value: `${request.destinationCity}, ${request.destinationCountry}` },
    { label: "Cargo Type", value: request.cargoType },
    { label: "Equipment", value: request.equipment },
    { label: "Weight", value: request.weight },
    { label: "Quantity", value: request.quantity },
    { label: "Dimensions", value: request.dimensions },
    { label: "Incoterm", value: request.incoterm },
    { label: "BL Type", value: request.blType },
    { label: "Preferred Carrier", value: request.preferredCarrier },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl duration-200 animate-in fade-in zoom-in-95 sm:rounded-2xl dark:bg-[#0D1B2A]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-[#0D1B2A] px-6 py-4">
          <div className="flex items-center gap-3">
            <SourceBadge source={request.source} />
            <div>
              <p className="font-semibold text-white">Request from {request.senderName}</p>
              <p className="text-xs text-[#94A3B8]">{request.receivedExact}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-5">
            {/* Left */}
            <div className="space-y-6 lg:col-span-3">
              <section>
                <h4 className="mb-3 text-sm font-bold text-[#0D1B2A] dark:text-[#E2E8F0]">Shipment Details</h4>
                <div className="grid grid-cols-2 gap-2">
                  {fields.map((f) => (<FieldPill key={f.label} label={f.label} value={f.value} />))}
                  <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 dark:border-[#1E3A5F] dark:bg-[#0F1E33]">
                    <span className="text-xs font-medium uppercase tracking-wide text-[#64748B]">Mode</span>
                    {request.modes.map((m) => <ModeBadge key={m} mode={m} />)}
                    <span className="ml-auto text-xs font-medium uppercase tracking-wide text-[#64748B]">Urgency</span>
                    <UrgencyBadge urgency={request.urgency} />
                    <ConfidenceBadge confidence={request.confidence} />
                  </div>
                </div>
              </section>
              {request.specialRequirements.length > 0 && (
                <section>
                  <h4 className="mb-3 text-sm font-bold text-[#0D1B2A] dark:text-[#E2E8F0]">Special Requirements</h4>
                  <ol className="space-y-2">
                    {request.specialRequirements.map((s, i) => (
                      <li key={i} className="flex gap-3 rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0]">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFF7ED] text-xs font-semibold text-[#F97316]">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {request.availabilityQuestions.length > 0 && (
                <section>
                  <h4 className="mb-3 text-sm font-bold text-[#0D1B2A] dark:text-[#E2E8F0]">Availability Questions</h4>
                  <ul className="space-y-2">
                    {request.availabilityQuestions.map((q, i) => (
                      <li key={i} className="flex items-center gap-2.5 text-sm text-[#0F172A] dark:text-[#E2E8F0]">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFF7ED] text-xs font-bold text-[#F97316]">?</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section>
                <h4 className="mb-3 text-sm font-bold text-[#0D1B2A] dark:text-[#E2E8F0]">Raw Message</h4>
                <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#1E293B] p-4 font-mono text-xs leading-relaxed text-[#E2E8F0]">{request.rawMessage}</pre>
              </section>
            </div>

            {/* Right */}
            <div className="space-y-6 lg:col-span-2">
              <section>
                <h4 className="mb-3 text-sm font-bold text-[#0D1B2A] dark:text-[#E2E8F0]">Sender Information</h4>
                <div className="space-y-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 dark:border-[#1E3A5F] dark:bg-[#0F1E33]">
                  <p className="text-sm font-semibold text-[#0F172A] dark:text-[#E2E8F0]">{request.senderName}</p>
                  <CopyRow icon={Mail} value={request.senderEmail} />
                  <CopyRow icon={Phone} value={request.senderPhone} />
                  <div className="flex items-center gap-2 pt-1">
                    <SourceBadge source={request.source} />
                    <span className="text-xs text-[#64748B]">{request.receivedExact}</span>
                  </div>
                </div>
              </section>
              <section>
                <h4 className="mb-3 text-sm font-bold text-[#0D1B2A] dark:text-[#E2E8F0]">Request Status</h4>
                <div className="mb-4"><StatusBadge status={request.status} /></div>
                <ol className="relative space-y-4 border-l border-[#E2E8F0] pl-5 dark:border-[#1E3A5F]">
                  {request.history.map((e) => (
                    <li key={e.label} className="relative">
                      <span className={`absolute -left-[23px] top-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#0D1B2A] ${e.done ? "bg-[#F97316]" : "bg-[#CBD5E1] dark:bg-[#1E3A5F]"}`} />
                      <p className={`text-sm ${e.done ? "font-medium text-[#0F172A] dark:text-[#E2E8F0]" : "text-[#94A3B8]"}`}>{e.label}</p>
                      <p className="text-xs tabular-nums text-[#64748B]">{e.time}</p>
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <h4 className="mb-3 text-sm font-bold text-[#0D1B2A] dark:text-[#E2E8F0]">Special Flags</h4>
                <div className="space-y-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 dark:border-[#1E3A5F] dark:bg-[#0F1E33]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><AogBadge /><span className="text-sm text-[#0F172A] dark:text-[#E2E8F0]">Aircraft on Ground</span></div>
                    {canEditFlags ? (
                      <button type="button" disabled={flagSaving} onClick={() => toggleFlag("aog")} aria-pressed={aogLocal} aria-label="Toggle AOG flag"
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 disabled:opacity-50 ${aogLocal ? "bg-red-600" : "bg-[#CBD5E1] dark:bg-[#1E3A5F]"}`}>
                        <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${aogLocal ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    ) : (
                      <span className={`text-xs font-bold ${aogLocal ? "text-red-600" : "text-[#94A3B8]"}`}>{aogLocal ? "YES" : "NO"}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><DgrBadge /><span className="text-sm text-[#0F172A] dark:text-[#E2E8F0]">Dangerous Goods</span></div>
                    {canEditFlags ? (
                      <button type="button" disabled={flagSaving} onClick={() => toggleFlag("dgr")} aria-pressed={dgrLocal} aria-label="Toggle DGR flag"
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:opacity-50 ${dgrLocal ? "bg-orange-500" : "bg-[#CBD5E1] dark:bg-[#1E3A5F]"}`}>
                        <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${dgrLocal ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    ) : (
                      <span className={`text-xs font-bold ${dgrLocal ? "text-orange-500" : "text-[#94A3B8]"}`}>{dgrLocal ? "YES" : "NO"}</span>
                    )}
                  </div>
                  {canEditFlags && <p className="text-[11px] text-[#94A3B8]">Auto-detected from keywords. Toggle to override.</p>}
                </div>
              </section>
            </div>
          </div>

          {/* Send panel */}
          {sendMethod && (
            <div ref={sendPanelRef} className="border-t border-[#E2E8F0] bg-[#F8FAFC] p-4 duration-200 animate-in slide-in-from-bottom-2 dark:border-[#1E3A5F] dark:bg-[#0F1E33]">
              {sendMethod === "Reply" ? (
                <>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Replying to <span className="text-[#0D1B2A] dark:text-[#E2E8F0]">{request.senderName}</span>{" "}via{" "}<span className="text-[#0D1B2A] dark:text-[#E2E8F0]">{request.source}</span></p>
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">{request.source === "Email" ? "Email Address" : "WhatsApp Number"}</label>
                    <input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder={request.source === "Email" ? "sender@example.com" : "+962 79 000 0000"} className="h-10 w-full rounded-md border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0]" />
                  </div>
                  {criticalFields.length > 0 && (
                    <div className="mb-3">
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input type="checkbox" checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)} className="h-4 w-4 accent-[#F97316]" />
                        <span className="text-sm text-[#0F172A] dark:text-[#E2E8F0]">Only ask for critical missing data</span>
                        {onlyCritical && <span className="rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[11px] font-semibold text-[#F97316]">{criticalFields.join(", ").replace(/_/g, " ")}</span>}
                      </label>
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">Message<span className="ml-1.5 font-normal normal-case text-[#94A3B8]">— editable before sending</span></label>
                    <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} rows={9} className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 font-mono text-xs leading-relaxed text-[#0F172A] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0]" />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={handleSend} disabled={!replyTo} className="inline-flex items-center gap-2 rounded-md bg-[#0D1B2A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1E3A5F] disabled:cursor-not-allowed disabled:opacity-50">
                      {request.source === "Email" ? <><Mail className="h-4 w-4" /> Open in Email App</> : <><MessageCircle className="h-4 w-4" /> Open in WhatsApp</>}
                    </button>
                    <button type="button" onClick={() => setSendMethod(null)} className="text-sm font-medium text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#E2E8F0]">Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Carrier {isReminder && <Lock className="h-3 w-3 text-[#94A3B8]" />}</label>
                      {isReminder && sentToCarrier ? (
                        <div className="flex h-10 items-center gap-2 rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-3 text-sm text-[#0F172A] dark:border-[#1E3A5F] dark:bg-[#1A2A40] dark:text-[#E2E8F0]">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />{sentToCarrier.carrier_name} — {sentToCarrier.person_name}
                        </div>
                      ) : (
                        <div className="max-h-44 overflow-y-auto rounded-md border border-[#E2E8F0] bg-white dark:border-[#1E3A5F] dark:bg-[#111E33]">
                          {availableCarriersForEmail.length === 0 ? (
                            <p className="px-3 py-3 text-sm text-[#94A3B8]">No carriers available for this mode.</p>
                          ) : availableCarriersForEmail.map((c) => {
                            const checked = selectedCarrierIds.includes(String(c.carrier_id))
                            return (
                              <label key={c.carrier_id} className={`flex cursor-pointer items-center gap-3 border-b border-[#E2E8F0] px-3 py-2.5 last:border-b-0 transition-colors hover:bg-[#F8FAFC] dark:border-[#1E3A5F] dark:hover:bg-[#1A2A40] ${checked ? "bg-[#FFF7ED] dark:bg-[#2A1800]" : ""}`}>
                                <input type="checkbox" checked={checked} onChange={() => toggleCarrier(String(c.carrier_id))} className="h-4 w-4 accent-[#F97316]" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">{c.carrier_name}<span className="ml-1.5 font-normal text-[#64748B]">— {c.person_name}</span></p>
                                  <p className="truncate text-xs text-[#64748B]">{c.email}{c.cc_emails.length > 0 && <span className="ml-1.5 text-[#94A3B8]">CC: {c.cc_emails.join(", ")}</span>}</p>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">Template</label>
                      <select value={templateId} onChange={(e) => onSelectTemplate(e.target.value)} className="h-10 w-full rounded-md border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0]">
                        <option value="">Select template...</option>
                        {templates.map((t) => (<option key={t.template_id} value={String(t.template_id)}>{t.template_name}{t.is_default ? " (Default)" : ""}</option>))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">Message<span className="ml-1.5 font-normal normal-case text-[#94A3B8]">— editable before sending</span></label>
                    <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} rows={8} placeholder="Type your message here, or select a template above to pre-fill…" className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 font-mono text-xs leading-relaxed text-[#0F172A] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0]" />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <button type="button" onClick={handleSend} disabled={selectedCarrierIds.length === 0} className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-50">
                      <Mail className="h-4 w-4" />{isReminder ? "Send Reminder via Email" : "Open in Email App"}
                    </button>
                    <button type="button" onClick={() => setSendMethod(null)} className="text-sm font-medium text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#E2E8F0]">Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#E2E8F0] bg-white dark:border-[#1E3A5F] dark:bg-[#0D1B2A]">
          <div className="flex flex-col gap-3 p-4 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1.5">
              <button type="button" onClick={() => !isCriticalBlocked && openPanel("Email")} disabled={isCriticalBlocked} title={isCriticalBlocked ? `Missing critical data: ${criticalMissingLabels.join(", ")}` : undefined}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-all ${isCriticalBlocked ? "cursor-not-allowed bg-[#F97316]/40 text-white" : sendMethod === "Email" ? "bg-[#EA580C] text-white hover:scale-[1.01]" : "bg-[#F97316] text-white hover:scale-[1.01] hover:bg-[#EA580C]"}`}>
                <Mail className="h-4 w-4" />{isReminder ? "Send Reminder via Email" : "Send to Carrier via Email"}{isCriticalBlocked && <Lock className="h-3.5 w-3.5 opacity-70" />}
              </button>
              {isCriticalBlocked && (
                <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Missing critical data: <span className="font-semibold">{criticalMissingLabels.join(", ")}</span>. Reply to the sender to collect it first.</span>
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-[#E2E8F0] px-4 pb-4 pt-3 dark:border-[#1E3A5F]">
            <button type="button" onClick={() => openPanel("Reply")}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-all hover:scale-[1.01] ${sendMethod === "Reply" ? "border-[#0D1B2A] bg-[#0D1B2A] text-white" : "border-[#E2E8F0] bg-white text-[#0D1B2A] hover:border-[#0D1B2A] dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0] dark:hover:border-[#475569]"}`}>
              <Reply className="h-4 w-4" />Reply to {request.senderName}
              {missingCount > 0 && <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{missingCount}</span>}
            </button>
          </div>
        </div>

        {/* Approval confirmation dialog */}
        {showApprovalConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-t-2xl bg-black/40 sm:rounded-2xl">
            <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl dark:bg-[#0D1B2A]">
              <div className="mb-1 flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-[#F97316]" />
                <h3 className="font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">Send for Approval</h3>
              </div>
              <p className="mt-2 text-sm text-[#64748B] dark:text-[#94A3B8]">
                {showApprovalConfirm === "Email" ? "This request will be routed through your approval workflow before the carrier email is sent." : "This reply will be routed through your approval workflow before it is sent."}
              </p>
              <div className="mt-5 flex gap-3">
                <button type="button" onClick={() => setShowApprovalConfirm(null)} className="flex-1 rounded-md border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#64748B] transition-colors hover:border-[#0D1B2A] hover:text-[#0D1B2A] dark:border-[#1E3A5F] dark:hover:border-[#475569] dark:hover:text-[#E2E8F0]">Cancel</button>
                <button type="button" disabled={submittingApproval} onClick={async () => { await submitForApproval(); setShowApprovalConfirm(null) }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-50">
                  {submittingApproval ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function renderTemplateBody(tId: string, req: FreightRequest, carrier: Carrier | undefined, templates: Template[]): string {
  const t = templates.find((x) => String(x.template_id) === tId)
  if (!t) return ""
  const map: Record<string, string> = {
    origin_city: req.originCity, origin_country: req.originCountry,
    destination_city: req.destinationCity, destination_country: req.destinationCountry,
    cargo_type: req.cargoType, equipment: req.equipment, weight: req.weight,
    quantity: req.quantity, dimensions: req.dimensions, incoterm: req.incoterm,
    bl_type: req.blType, mode: req.modes.join(", "), urgency: req.urgency,
    sender_name: req.senderName, sender_email: req.senderEmail,
    received_date: req.receivedExact, preferred_carrier: req.preferredCarrier,
    contact_name: carrier?.person_name ?? "there", carrier_name: carrier?.carrier_name ?? "",
    carrier_email: carrier?.email ?? "", carrier_phone: carrier?.number ?? "",
  }
  return t.body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => map[key] ?? `{{${key}}}`)
}

function parseArrayField(value: string | null | undefined): string {
  if (!value) return ""
  try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.join("\n") } catch { /* not JSON */ }
  return value
}

function FieldPill({ label, value }: { label: string; value: string | null }) {
  const display = parseArrayField(value)
  const missing = !display || display === "—"
  return (
    <div className={`rounded-md border px-3 py-2 ${missing ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30" : "border-[#E2E8F0] bg-white dark:border-[#1E3A5F] dark:bg-[#111E33]"}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#64748B]">{label}</p>
      <p className={`whitespace-pre-line text-sm font-medium ${missing ? "text-red-600 dark:text-red-400" : "text-[#0D1B2A] dark:text-[#E2E8F0]"}`}>{missing ? "Missing" : display}</p>
    </div>
  )
}

function CopyRow({ icon: Icon, value }: { icon: typeof Mail; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
      <span className="flex-1 truncate text-sm text-[#0F172A] dark:text-[#E2E8F0]">{value}</span>
      <button type="button" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="text-[#94A3B8] transition-colors hover:text-[#F97316]">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
