"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import type { Carrier, Language, Mode } from "@/lib/portal-data"

const allModes: Mode[] = ["Sea", "Air", "Land"]
const languages: Language[] = ["Arabic", "English", "Both"]

export function CarrierModal({
  carrier,
  onClose,
  onSave,
}: {
  carrier: Carrier | null
  onClose: () => void
  onSave: (c: Carrier) => void
}) {
  const [form, setForm] = useState<Carrier>(
    carrier ?? {
      id: `c${Date.now()}`,
      name: "",
      country: "",
      flag: "🏳️",
      contactName: "",
      contactRole: "",
      email: "",
      whatsapp: "",
      modes: [],
      language: "Both",
      routes: "",
      notes: "",
      active: true,
      ccEmails: [],
    },
  )

  const [ccEmailInput, setCcEmailInput] = useState("")

  function set<K extends keyof Carrier>(key: K, value: Carrier[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }
  function toggleMode(m: Mode) {
    setForm((f) => ({ ...f, modes: f.modes.includes(m) ? f.modes.filter((x) => x !== m) : [...f.modes, m] }))
  }
  function addCcEmail() {
    const email = ccEmailInput.trim()
    if (!email) return
    const current = form.ccEmails ?? []
    if (current.includes(email)) { setCcEmailInput(""); return }
    set("ccEmails", [...current, email])
    setCcEmailInput("")
  }
  function removeCcEmail(index: number) {
    set("ccEmails", (form.ccEmails ?? []).filter((_, i) => i !== index))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl duration-200 animate-in fade-in zoom-in-95 dark:bg-[#111E33] sm:rounded-2xl">
        <div className="flex items-center justify-between bg-[#0D1B2A] px-6 py-4">
          <h3 className="font-semibold text-white">{carrier ? "Edit Carrier" : "Add New Carrier"}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSave(form)
          }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-6 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="Carrier Name" value={form.name} onChange={(v) => set("name", v)} />
            <Field label="Contact Person Name" value={form.contactName} onChange={(v) => set("contactName", v)} />
            <Field
              label="Contact Person Role"
              placeholder="e.g. Operations Manager"
              value={form.contactRole}
              onChange={(v) => set("contactRole", v)}
            />
            <Field label="Email Address" type="email" value={form.email} onChange={(v) => set("email", v)} />
            <Field label="WhatsApp Number" placeholder="+971 50 000 0000" value={form.whatsapp} onChange={(v) => set("whatsapp", v)} />

            {/* CC Emails */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">
                CC Emails
                <span className="ml-1.5 font-normal text-[#94A3B8]">— copied on every carrier email</span>
              </label>
              <div className="space-y-2">
                {(form.ccEmails ?? []).map((email, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 truncate rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] dark:border-[#1E3A5F] dark:bg-[#0D1B2A]/60 dark:text-[#E2E8F0]">
                      {email}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCcEmail(i)}
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
                    value={ccEmailInput}
                    onChange={(e) => setCcEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addCcEmail() }
                    }}
                    className="h-10 flex-1 rounded-md border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0]"
                  />
                  <button
                    type="button"
                    onClick={addCcEmail}
                    disabled={!ccEmailInput.trim()}
                    className="flex h-10 items-center gap-1.5 rounded-md border border-[#E2E8F0] px-3 text-sm font-medium text-[#64748B] transition-colors hover:border-[#F97316]/40 hover:text-[#F97316] disabled:opacity-40 dark:border-[#1E3A5F] dark:text-[#94A3B8]"
                  >
                    <Plus className="h-4 w-4" /> Add
                  </button>
                </div>
              </div>
            </div>

            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Modes</p>
              <div className="flex gap-4">
                {allModes.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm text-[#0F172A] dark:text-[#E2E8F0]">
                    <input
                      type="checkbox"
                      checked={form.modes.includes(m)}
                      onChange={() => toggleMode(m)}
                      className="h-4 w-4 accent-[#F97316]"
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Routes / Lanes</label>
              <textarea
                value={form.routes}
                onChange={(e) => set("routes", e.target.value)}
                placeholder="e.g. Jordan, UAE, Saudi Arabia, Europe"
                rows={2}
                className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0]"
              />
            </div>

            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Language Preference</p>
              <div className="flex gap-4">
                {languages.map((l) => (
                  <label key={l} className="flex items-center gap-2 text-sm text-[#0F172A] dark:text-[#E2E8F0]">
                    <input
                      type="radio"
                      name="language"
                      checked={form.language === l}
                      onChange={() => set("language", l)}
                      className="h-4 w-4 accent-[#F97316]"
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                placeholder="Optional"
                className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0]"
              />
            </div>

            <label className="flex items-center gap-3 sm:col-span-2">
              <button
                type="button"
                role="switch"
                aria-checked={form.active}
                onClick={() => set("active", !form.active)}
                className={`relative h-6 w-11 overflow-hidden rounded-full transition-colors ${form.active ? "bg-[#059669]" : "bg-[#CBD5E1]"}`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    form.active ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Active</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#E2E8F0] p-4 dark:border-[#1E3A5F]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:border-[#F97316]/40 dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#EA580C]"
            >
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
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0]"
      />
    </div>
  )
}
