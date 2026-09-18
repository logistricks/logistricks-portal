"use client"

import { useState } from "react"
import { Loader2, Plus, X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { type Carrier, langLabel, langValue } from "@/lib/portal-data"

const langOptions = ["Arabic", "English", "Both"] as const

export function CarrierModal({
  carrier,
  clientCode,
  onClose,
  onSave,
}: {
  carrier: Carrier | null
  clientCode: string
  onClose: () => void
  onSave: () => void
}) {
  const supabase = createClient()

  // Form state — mirroring Carrier shape
  const [carrierName, setCarrierName] = useState(carrier?.carrier_name ?? "")
  const [personName, setPersonName] = useState(carrier?.person_name ?? "")
  const [role, setRole] = useState(carrier?.role ?? "")
  const [email, setEmail] = useState(carrier?.email ?? "")
  const [number, setNumber] = useState(carrier?.number ?? "")
  const [isSea, setIsSea] = useState(carrier?.is_sea ?? false)
  const [isAir, setIsAir] = useState(carrier?.is_air ?? false)
  const [isLand, setIsLand] = useState(carrier?.is_land ?? false)
  const [lang, setLang] = useState<number>(carrier?.lang ?? -1)
  const [routes, setRoutes] = useState(carrier?.routes ?? "")
  const [active, setActive] = useState(carrier?.active ?? true)
  const [ccEmails, setCcEmails] = useState<string[]>(carrier?.cc_emails ?? [])
  const [ccInput, setCcInput] = useState("")

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addCc() {
    const e = ccInput.trim()
    if (!e || ccEmails.includes(e)) { setCcInput(""); return }
    setCcEmails((prev) => [...prev, e])
    setCcInput("")
  }
  function removeCc(i: number) {
    setCcEmails((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      if (carrier) {
        // UPDATE — main row
        const { error: mainErr } = await supabase
          .from("carriers")
          .update({
            carrier_name: carrierName,
            person_name: personName,
            role,
            email,
            number,
            is_sea: isSea,
            is_air: isAir,
            is_land: isLand,
            lang,
            routes,
            active,
          })
          .eq("id", carrier.row_id)
        if (mainErr) throw mainErr

        // Delete old CC rows then re-insert
        const { error: delErr } = await supabase
          .from("carriers")
          .delete()
          .eq("client_code", clientCode)
          .eq("carrier_id", carrier.carrier_id)
          .eq("is_cc", true)
        if (delErr) throw delErr

        if (ccEmails.length > 0) {
          const { error: ccErr } = await supabase.from("carriers").insert(
            ccEmails.map((ccEmail) => ({
              client_code: clientCode,
              carrier_id: carrier.carrier_id,
              carrier_name: carrierName,
              email: ccEmail,
              is_cc: true,
              active,
              is_sea: isSea,
              is_air: isAir,
              is_land: isLand,
              lang,
            })),
          )
          if (ccErr) throw ccErr
        }
      } else {
        // INSERT — get next carrier_id for this client
        const { data: maxRow } = await supabase
          .from("carriers")
          .select("carrier_id")
          .eq("client_code", clientCode)
          .order("carrier_id", { ascending: false })
          .limit(1)
          .maybeSingle()
        const nextId = (maxRow?.carrier_id ?? 0) + 1

        // Insert main row
        const { error: mainErr } = await supabase.from("carriers").insert({
          client_code: clientCode,
          carrier_id: nextId,
          carrier_name: carrierName,
          person_name: personName,
          role,
          email,
          number,
          is_sea: isSea,
          is_air: isAir,
          is_land: isLand,
          lang,
          routes,
          is_cc: false,
          active,
        })
        if (mainErr) throw mainErr

        // Insert CC rows
        if (ccEmails.length > 0) {
          const { error: ccErr } = await supabase.from("carriers").insert(
            ccEmails.map((ccEmail) => ({
              client_code: clientCode,
              carrier_id: nextId,
              carrier_name: carrierName,
              email: ccEmail,
              is_cc: true,
              active,
              is_sea: isSea,
              is_air: isAir,
              is_land: isLand,
              lang,
            })),
          )
          if (ccErr) throw ccErr
        }
      }

      onSave()
    } catch (err: unknown) {
      const e = err as Record<string,unknown>; const msg = e?.message ? String(e.message) + (e.details ? ` (${e.details})` : e.hint ? ` (${e.hint})` : "") : err instanceof Error ? err.message : String(err); setError(msg)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl duration-200 animate-in fade-in zoom-in-95 dark:bg-[#111E33] sm:rounded-2xl">
        <div className="flex items-center justify-between bg-[#0D1B2A] px-6 py-4">
          <h3 className="font-semibold text-white">{carrier ? "Edit Carrier" : "Add New Carrier"}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-6 sm:grid-cols-2">
            {error && (
              <div className="sm:col-span-2">
                <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>
              </div>
            )}

            <Field className="sm:col-span-2" label="Carrier Name" value={carrierName} onChange={setCarrierName} required />
            <Field label="Contact Person Name" value={personName} onChange={setPersonName} />
            <Field label="Contact Person Role" placeholder="e.g. Operations Manager" value={role} onChange={setRole} />
            <Field label="Email Address" type="email" value={email} onChange={setEmail} />
            <Field label="Phone / WhatsApp" placeholder="+971 50 000 0000" value={number} onChange={setNumber} />

            {/* CC Emails */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">
                CC Emails
                <span className="ml-1.5 font-normal text-[#94A3B8]">— copied on every carrier email</span>
              </label>
              <div className="space-y-2">
                {ccEmails.map((ccEmail, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 truncate rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] dark:border-[#1E3A5F] dark:bg-[#0D1B2A]/60 dark:text-[#E2E8F0]">
                      {ccEmail}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCc(i)}
                      aria-label="Remove CC email"
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-[#E2E8F0] text-[#94A3B8] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-[#1E3A5F] dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="cc@example.com"
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCc() } }}
                    className="h-10 flex-1 rounded-md border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0]"
                  />
                  <button
                    type="button"
                    onClick={addCc}
                    disabled={!ccInput.trim()}
                    className="flex h-10 items-center gap-1.5 rounded-md border border-[#E2E8F0] px-3 text-sm font-medium text-[#64748B] transition-colors hover:border-[#F97316]/40 hover:text-[#F97316] disabled:opacity-40 dark:border-[#1E3A5F] dark:text-[#94A3B8]"
                  >
                    <Plus className="h-4 w-4" /> Add
                  </button>
                </div>
              </div>
            </div>

            {/* Modes */}
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Modes</p>
              <div className="flex gap-4">
                {([["Sea", isSea, setIsSea], ["Air", isAir, setIsAir], ["Land", isLand, setIsLand]] as const).map(([label, checked, setter]) => (
                  <label key={label} className="flex items-center gap-2 text-sm text-[#0F172A] dark:text-[#E2E8F0]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setter(e.target.checked)}
                      className="h-4 w-4 accent-[#F97316]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Routes */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Routes / Lanes</label>
              <textarea
                value={routes}
                onChange={(e) => setRoutes(e.target.value)}
                placeholder="e.g. Jordan, UAE, Saudi Arabia, Europe"
                rows={2}
                className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0]"
              />
            </div>

            {/* Language */}
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Language Preference</p>
              <div className="flex gap-4">
                {langOptions.map((l) => (
                  <label key={l} className="flex items-center gap-2 text-sm text-[#0F172A] dark:text-[#E2E8F0]">
                    <input
                      type="radio"
                      name="language"
                      checked={lang === langValue(l)}
                      onChange={() => setLang(langValue(l))}
                      className="h-4 w-4 accent-[#F97316]"
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>

            {/* Active */}
            <label className="flex items-center gap-3 sm:col-span-2">
              <button
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => setActive((v) => !v)}
                className={`relative h-6 w-11 overflow-hidden rounded-full transition-colors ${active ? "bg-[#059669]" : "bg-[#CBD5E1]"}`}
              >
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${active ? "translate-x-5" : "translate-x-0"}`} />
              </button>
              <span className="text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Active</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#E2E8F0] p-4 dark:border-[#1E3A5F]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:border-[#F97316]/40 disabled:opacity-50 dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#EA580C] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Carrier
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
  required = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  className?: string
  required?: boolean
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0]"
      />
    </div>
  )
}
