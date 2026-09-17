"use client"

import { useState } from "react"
import { Check, Copy, Mail, MessageCircle, Phone, X } from "lucide-react"
import {
  ConfidenceBadge,
  ModeBadge,
  SourceBadge,
  StatusBadge,
  UrgencyBadge,
} from "@/components/portal/badges"
import { carriers, templates, type FreightRequest } from "@/lib/portal-data"

export function RequestDetailModal({
  request,
  onClose,
}: {
  request: FreightRequest
  onClose: () => void
}) {
  const [sendMethod, setSendMethod] = useState<"Email" | "WhatsApp" | null>(null)
  const [carrierId, setCarrierId] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [sendTo, setSendTo] = useState("")

  const selectedCarrier = carriers.find((c) => c.id === carrierId)
  const methodTemplates = templates.filter((t) => t.type === sendMethod)

  function openPanel(method: "Email" | "WhatsApp") {
    setSendMethod(method)
    setCarrierId("")
    setTemplateId("")
    setSendTo("")
  }

  function onSelectCarrier(id: string) {
    setCarrierId(id)
    const c = carriers.find((x) => x.id === id)
    if (c) setSendTo(sendMethod === "Email" ? c.email : c.whatsapp)
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
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl duration-200 animate-in fade-in zoom-in-95 sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-[#0D1B2A] px-6 py-4">
          <div className="flex items-center gap-3">
            <SourceBadge source={request.source} />
            <div>
              <p className="font-semibold text-white">Request from {request.senderName}</p>
              <p className="text-xs text-[#94A3B8]">{request.receivedExact}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-5">
          {/* Left column */}
          <div className="space-y-6 lg:col-span-3">
            <section>
              <h4 className="mb-3 text-sm font-bold text-[#0D1B2A]">Shipment Details</h4>
              <div className="grid grid-cols-2 gap-2">
                {fields.map((f) => (
                  <FieldPill key={f.label} label={f.label} value={f.value} />
                ))}
                <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#64748B]">Mode</span>
                  {request.modes.map((m) => (
                    <ModeBadge key={m} mode={m} />
                  ))}
                  <span className="ml-auto text-xs font-medium uppercase tracking-wide text-[#64748B]">Urgency</span>
                  <UrgencyBadge urgency={request.urgency} />
                  <ConfidenceBadge confidence={request.confidence} />
                </div>
              </div>
            </section>

            {request.specialRequirements.length > 0 && (
              <section>
                <h4 className="mb-3 text-sm font-bold text-[#0D1B2A]">Special Requirements</h4>
                <ol className="space-y-2">
                  {request.specialRequirements.map((s, i) => (
                    <li
                      key={i}
                      className="flex gap-3 rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A]"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFF7ED] text-xs font-semibold text-[#F97316]">
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {request.availabilityQuestions.length > 0 && (
              <section>
                <h4 className="mb-3 text-sm font-bold text-[#0D1B2A]">Availability Questions</h4>
                <ul className="space-y-2">
                  {request.availabilityQuestions.map((q, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-[#0F172A]">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFF7ED] text-xs font-bold text-[#F97316]">
                        ?
                      </span>
                      {q}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h4 className="mb-3 text-sm font-bold text-[#0D1B2A]">Raw Message</h4>
              <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#1E293B] p-4 font-mono text-xs leading-relaxed text-[#E2E8F0]">
                {request.rawMessage}
              </pre>
            </section>
          </div>

          {/* Right column */}
          <div className="space-y-6 lg:col-span-2">
            <section>
              <h4 className="mb-3 text-sm font-bold text-[#0D1B2A]">Sender Information</h4>
              <div className="space-y-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <p className="text-sm font-semibold text-[#0F172A]">{request.senderName}</p>
                <CopyRow icon={Mail} value={request.senderEmail} />
                <CopyRow icon={Phone} value={request.senderPhone} />
                <div className="flex items-center gap-2 pt-1">
                  <SourceBadge source={request.source} />
                  <span className="text-xs text-[#64748B]">{request.receivedExact}</span>
                </div>
              </div>
            </section>

            <section>
              <h4 className="mb-3 text-sm font-bold text-[#0D1B2A]">Request Status</h4>
              <div className="mb-4">
                <StatusBadge status={request.status} />
              </div>
              <ol className="relative space-y-4 border-l border-[#E2E8F0] pl-5">
                {request.history.map((e) => (
                  <li key={e.label} className="relative">
                    <span
                      className={`absolute -left-[23px] top-0.5 h-3 w-3 rounded-full border-2 border-white ${
                        e.done ? "bg-[#F97316]" : "bg-[#CBD5E1]"
                      }`}
                    />
                    <p className={`text-sm ${e.done ? "font-medium text-[#0F172A]" : "text-[#94A3B8]"}`}>{e.label}</p>
                    <p className="text-xs tabular-nums text-[#64748B]">{e.time}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>

        {/* Footer / actions */}
        <div className="border-t border-[#E2E8F0] bg-white">
          {sendMethod && (
            <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] p-4 duration-200 animate-in slide-in-from-bottom-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Carrier
                  </label>
                  <select
                    value={carrierId}
                    onChange={(e) => onSelectCarrier(e.target.value)}
                    className="h-10 w-full rounded-md border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20"
                  >
                    <option value="">Select carrier...</option>
                    {carriers
                      .filter((c) => (sendMethod === "Email" ? c.email : c.whatsapp))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.contactName}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Template
                  </label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="h-10 w-full rounded-md border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20"
                  >
                    <option value="">Select template...</option>
                    {methodTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.isDefault ? " (Default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  Send To
                </label>
                <input
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder={sendMethod === "Email" ? "carrier@example.com" : "+971 50 000 0000"}
                  className="h-10 w-full rounded-md border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20"
                />
              </div>
              {templateId && (
                <div className="mt-3 rounded-md border border-[#E2E8F0] bg-white p-3 text-sm text-[#0F172A]">
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {renderTemplate(templateId, request, selectedCarrier)}
                  </p>
                </div>
              )}
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-50"
                  disabled={!carrierId || !templateId}
                >
                  <Check className="h-4 w-4" /> Send Now
                </button>
                <button
                  type="button"
                  onClick={() => setSendMethod(null)}
                  className="text-sm font-medium text-[#64748B] hover:text-[#0F172A]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3 p-4 sm:flex-row">
            <button
              type="button"
              onClick={() => openPanel("Email")}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-all hover:scale-[1.01] ${
                sendMethod === "Email"
                  ? "bg-[#EA580C] text-white"
                  : "bg-[#F97316] text-white hover:bg-[#EA580C]"
              }`}
            >
              <Mail className="h-4 w-4" /> Send to Carrier via Email
            </button>
            <button
              type="button"
              onClick={() => openPanel("WhatsApp")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[#059669] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] hover:bg-[#047857]"
            >
              <MessageCircle className="h-4 w-4" /> Send via WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldPill({ label, value }: { label: string; value: string | null }) {
  const missing = !value || value === "—"
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        missing ? "border-red-200 bg-red-50" : "border-[#E2E8F0] bg-white"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#64748B]">{label}</p>
      <p className={`text-sm font-medium ${missing ? "text-red-600" : "text-[#0D1B2A]"}`}>
        {missing ? "Missing" : value}
      </p>
    </div>
  )
}

function CopyRow({ icon: Icon, value }: { icon: typeof Mail; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
      <span className="flex-1 truncate text-sm text-[#0F172A]">{value}</span>
      <button
        type="button"
        aria-label="Copy"
        onClick={() => {
          navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="text-[#94A3B8] transition-colors hover:text-[#F97316]"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function renderTemplate(
  templateId: string,
  request: FreightRequest,
  carrier: (typeof carriers)[number] | undefined,
): string {
  const t = templates.find((x) => x.id === templateId)
  if (!t) return ""
  const map: Record<string, string> = {
    origin_city: request.originCity,
    origin_country: request.originCountry,
    destination_city: request.destinationCity,
    destination_country: request.destinationCountry,
    cargo_type: request.cargoType,
    equipment: request.equipment,
    weight: request.weight,
    incoterm: request.incoterm,
    mode: request.modes.join(", "),
    urgency: request.urgency,
    contact_name: carrier?.contactName ?? "there",
    carrier_name: carrier?.name ?? "",
  }
  const body = (t.subject ? `Subject: ${t.subject}\n\n` : "") + t.body
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => map[key] ?? `{{${key}}}`)
}
