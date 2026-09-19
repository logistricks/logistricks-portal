"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  CheckSquare,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Settings2,
  Square,
  Trash2,
  X,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────
type ReceiverEmail  = { id: string; r_mail: string; active: boolean; label: string | null }
type WhatsappNumber = { id: string; number: string; active: boolean; label: string | null }

const CRITICAL_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "cargo_type",  label: "Cargo Type" },
  { key: "weight",      label: "Weight / Tonnage" },
  { key: "dimensions",  label: "Dimensions" },
  { key: "equipment",   label: "Equipment / Container" },
  { key: "incoterm",    label: "Incoterm" },
  { key: "bl_type",     label: "BL Type" },
]

// ── Reusable channel row ───────────────────────────────────────────────────────
function ChannelRow({
  primary, secondary, active, busy, onToggle, onDelete,
}: {
  primary: string; secondary?: string | null; active: boolean; busy: boolean
  onToggle: () => void; onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-green-400" : "bg-[#CBD5E1] dark:bg-[#334155]"}`} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">{primary}</p>
        {secondary && <p className="text-xs text-[#475569]">{secondary}</p>}
      </div>
      <button type="button" onClick={onToggle} disabled={busy} aria-pressed={active}
        title={active ? "Deactivate" : "Activate"}
        className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40 ${active ? "bg-[#059669]" : "bg-[#CBD5E1] dark:bg-[#334155]"}`}>
        {busy
          ? <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
          : <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${active ? "translate-x-5" : "translate-x-0"}`} />}
      </button>
      <button onClick={onDelete} disabled={busy} title="Remove"
        className="flex h-7 w-7 items-center justify-center rounded text-[#94A3B8] transition-colors hover:bg-red-100 hover:text-red-500 disabled:opacity-40 dark:text-[#334155] dark:hover:bg-red-900/30 dark:hover:text-red-400">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ icon, title, description, children }: {
  icon: React.ReactNode; title: string; description: string; children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[#F97316]">{icon}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[#64748B]">{title}</h2>
      </div>
      <p className="mb-4 text-xs text-[#475569]">{description}</p>
      {children}
    </section>
  )
}

// ── Toggle row ─────────────────────────────────────────────────────────────────
function ToggleRow({ label, description, checked, busy, onToggle, extra }: {
  label: string; description: string; checked: boolean; busy: boolean
  onToggle: () => void; extra?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#E2E8F0] bg-white p-4 dark:border-[#1E3A5F] dark:bg-[#0D1B2A]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">{label}</p>
          <p className="text-xs text-[#475569] mt-0.5">{description}</p>
        </div>
        <button type="button" onClick={onToggle} disabled={busy} aria-pressed={checked}
          className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-[#059669]" : "bg-[#CBD5E1] dark:bg-[#334155]"}`}>
          {busy
            ? <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
            : <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />}
        </button>
      </div>
      {extra}
    </div>
  )
}

// ── Critical Fields Picker ─────────────────────────────────────────────────────
function CriticalFieldsPicker({ initial, onSave, onCancel }: {
  initial: string[]; onSave: (fields: string[]) => void; onCancel: () => void
}) {
  const [selected, setSelected] = useState<string[]>(initial)
  function toggle(key: string) {
    setSelected((s) => s.includes(key) ? s.filter((k) => k !== key) : [...s, key])
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-[#111E33]">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
          <div>
            <h3 className="font-semibold text-[#0F172A] dark:text-white">Select Critical Fields</h3>
            <p className="text-xs text-[#475569] mt-0.5">Sending is blocked when these are missing</p>
          </div>
          <button type="button" onClick={onCancel}
            className="rounded-lg p-1.5 text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] dark:hover:bg-[#1E3A5F] dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {CRITICAL_FIELD_OPTIONS.map((opt) => (
            <button key={opt.key} type="button" onClick={() => toggle(opt.key)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#F8FAFC] dark:hover:bg-[#1E3A5F]/40">
              {selected.includes(opt.key)
                ? <CheckSquare className="h-4 w-4 shrink-0 text-[#F97316]" />
                : <Square       className="h-4 w-4 shrink-0 text-[#CBD5E1] dark:text-[#334155]" />}
              <span className={selected.includes(opt.key) ? "font-medium text-[#0F172A] dark:text-[#E2E8F0]" : "text-[#475569]"}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-3 border-t border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:border-[#F97316]/40 dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0]">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(selected)} disabled={selected.length === 0}
            className="flex-1 rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#EA580C] disabled:opacity-40">
            Save ({selected.length} selected)
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  // ── Emails ──────────────────────────────────────────────
  const [emails, setEmails]             = useState<ReceiverEmail[]>([])
  const [emailsLoading, setEmailsLoading] = useState(true)
  const [emailBusy, setEmailBusy]       = useState<string | null>(null)
  const [newMail, setNewMail]           = useState("")
  const [newMailLabel, setNewMailLabel] = useState("")
  const [addingMail, setAddingMail]     = useState(false)

  // ── WhatsApp ─────────────────────────────────────────────
  const [numbers, setNumbers]           = useState<WhatsappNumber[]>([])
  const [numsLoading, setNumsLoading]   = useState(true)
  const [numBusy, setNumBusy]           = useState<string | null>(null)
  const [newNum, setNewNum]             = useState("")
  const [newNumLabel, setNewNumLabel]   = useState("")
  const [addingNum, setAddingNum]       = useState(false)

  // ── Automation flags ─────────────────────────────────────
  const [autoSend, setAutoSend]               = useState(false)
  const [requireCritical, setRequireCritical] = useState(false)
  const [criticalFields, setCriticalFields]   = useState<string[]>([])
  const [flagsLoading, setFlagsLoading]       = useState(true)
  const [autoSendBusy, setAutoSendBusy]       = useState(false)
  const [requireCritBusy, setRequireCritBusy] = useState(false)
  const [showPicker, setShowPicker]           = useState(false)

  const [error, setError] = useState<string | null>(null)

  // ── Load ─────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/settings/emails")
      .then((r) => r.json())
      .then((data) => { setEmails(Array.isArray(data) ? data : []); setEmailsLoading(false) })
      .catch(() => setEmailsLoading(false))

    fetch("/api/settings/numbers")
      .then((r) => r.json())
      .then((data) => { setNumbers(Array.isArray(data) ? data : []); setNumsLoading(false) })
      .catch(() => setNumsLoading(false))

    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setAutoSend(data.allow_auto_send_to_carrier ?? false)
          setRequireCritical(data.require_critical_data ?? false)
          setCriticalFields(data.critical_fields ?? [])
        }
        setFlagsLoading(false)
      })
      .catch(() => setFlagsLoading(false))
  }, [])

  // ── Email actions ─────────────────────────────────────────
  async function toggleEmail(row: ReceiverEmail) {
    setEmailBusy(row.id); setError(null)
    const next = !row.active
    const res = await fetch("/api/settings/emails", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, active: next }),
    })
    if (!res.ok) setError((await res.json()).error ?? "Failed to update")
    else setEmails((p) => p.map((e) => e.id === row.id ? { ...e, active: next } : e))
    setEmailBusy(null)
  }
  async function deleteEmail(id: string) {
    setEmailBusy(id); setError(null)
    const res = await fetch("/api/settings/emails", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) setError((await res.json()).error ?? "Failed to delete")
    else setEmails((p) => p.filter((e) => e.id !== id))
    setEmailBusy(null)
  }
  async function addEmail() {
    if (!newMail.trim()) return
    setAddingMail(true); setError(null)
    const res = await fetch("/api/settings/emails", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ r_mail: newMail.trim(), label: newMailLabel.trim() || null }),
    })
    const data = await res.json()
    if (!res.ok) setError(data.error ?? "Failed to add")
    else { setEmails((p) => [...p, data]); setNewMail(""); setNewMailLabel("") }
    setAddingMail(false)
  }

  // ── WhatsApp actions ──────────────────────────────────────
  async function toggleNumber(row: WhatsappNumber) {
    setNumBusy(row.id); setError(null)
    const next = !row.active
    const res = await fetch("/api/settings/numbers", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, active: next }),
    })
    if (!res.ok) setError((await res.json()).error ?? "Failed to update")
    else setNumbers((p) => p.map((n) => n.id === row.id ? { ...n, active: next } : n))
    setNumBusy(null)
  }
  async function deleteNumber(id: string) {
    setNumBusy(id); setError(null)
    const res = await fetch("/api/settings/numbers", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) setError((await res.json()).error ?? "Failed to delete")
    else setNumbers((p) => p.filter((n) => n.id !== id))
    setNumBusy(null)
  }
  async function addNumber() {
    if (!newNum.trim()) return
    setAddingNum(true); setError(null)
    const res = await fetch("/api/settings/numbers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: newNum.trim(), label: newNumLabel.trim() || null }),
    })
    const data = await res.json()
    if (!res.ok) setError(data.error ?? "Failed to add")
    else { setNumbers((p) => [...p, data]); setNewNum(""); setNewNumLabel("") }
    setAddingNum(false)
  }

  // ── Automation actions ────────────────────────────────────
  async function toggleAutoSend() {
    setAutoSendBusy(true); setError(null)
    const next = !autoSend
    const res = await fetch("/api/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allow_auto_send_to_carrier: next }),
    })
    if (!res.ok) setError((await res.json()).error ?? "Failed to save")
    else setAutoSend(next)
    setAutoSendBusy(false)
  }

  async function toggleRequireCritical() {
    setError(null)
    const next = !requireCritical
    if (next && criticalFields.length === 0) { setShowPicker(true); return }
    setRequireCritBusy(true)
    const res = await fetch("/api/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ require_critical_data: next }),
    })
    if (!res.ok) setError((await res.json()).error ?? "Failed to save")
    else setRequireCritical(next)
    setRequireCritBusy(false)
  }

  async function saveCriticalFields(fields: string[]) {
    setRequireCritBusy(true); setError(null)
    const res = await fetch("/api/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ require_critical_data: true, critical_fields: fields }),
    })
    if (!res.ok) { setError((await res.json()).error ?? "Failed to save"); setShowPicker(false); setRequireCritBusy(false); return }
    setCriticalFields(fields)
    setRequireCritical(true)
    setShowPicker(false)
    setRequireCritBusy(false)
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="mb-1 text-xl font-bold text-[#0D1B2A] dark:text-white">Settings</h1>
      <p className="mb-8 text-sm text-[#475569]">Manage your organisation's configuration</p>

      {error && (
        <p className="mb-6 rounded bg-red-100 px-3 py-2 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">{error}</p>
      )}

      {/* ── Receiver Emails ── */}
      <Section icon={<Mail className="h-4 w-4" />} title="Receiver Emails"
        description="Inbound addresses n8n monitors for this client. Only active addresses are processed. Deactivating stops new requests from that mailbox without deleting history.">
        {emailsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[#475569]"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] dark:divide-white/5 dark:border-white/5 dark:bg-[#0D1B2A]">
            {emails.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-[#94A3B8] dark:text-[#334155]">No email addresses configured.</p>
            )}
            {emails.map((row) => (
              <ChannelRow key={row.id} primary={row.r_mail} secondary={row.label}
                active={row.active} busy={emailBusy === row.id}
                onToggle={() => toggleEmail(row)} onDelete={() => deleteEmail(row.id)} />
            ))}
            <div className="flex items-center gap-2 bg-[#F1F5F9] px-4 py-3 dark:bg-[#0a1628]">
              <Plus className="h-4 w-4 shrink-0 text-[#94A3B8] dark:text-[#334155]" />
              <input type="email" placeholder="new@intake.logistricks.com" value={newMail}
                onChange={(e) => setNewMail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmail()}
                className="min-w-0 flex-1 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#CBD5E1] dark:text-[#E2E8F0] dark:placeholder:text-[#334155]" />
              <input type="text" placeholder="Label (optional)" value={newMailLabel}
                onChange={(e) => setNewMailLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmail()}
                className="w-28 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#CBD5E1] dark:text-[#E2E8F0] dark:placeholder:text-[#334155]" />
              <button onClick={addEmail} disabled={addingMail || !newMail.trim()}
                className="flex items-center gap-1 rounded bg-[#F97316] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:bg-[#ea6a05] disabled:opacity-40">
                {addingMail ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── WhatsApp Numbers ── */}
      <Section icon={<MessageCircle className="h-4 w-4" />} title="WhatsApp Numbers"
        description="Sender numbers n8n listens to for inbound WhatsApp rate replies. Only active numbers are processed. Use E.164 format (+96612345678).">
        {numsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[#475569]"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] dark:divide-white/5 dark:border-white/5 dark:bg-[#0D1B2A]">
            {numbers.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-[#94A3B8] dark:text-[#334155]">No WhatsApp numbers configured.</p>
            )}
            {numbers.map((row) => (
              <ChannelRow key={row.id} primary={row.number} secondary={row.label}
                active={row.active} busy={numBusy === row.id}
                onToggle={() => toggleNumber(row)} onDelete={() => deleteNumber(row.id)} />
            ))}
            <div className="flex items-center gap-2 bg-[#F1F5F9] px-4 py-3 dark:bg-[#0a1628]">
              <Plus className="h-4 w-4 shrink-0 text-[#94A3B8] dark:text-[#334155]" />
              <input type="tel" placeholder="+96612345678" value={newNum}
                onChange={(e) => setNewNum(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNumber()}
                className="min-w-0 flex-1 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#CBD5E1] dark:text-[#E2E8F0] dark:placeholder:text-[#334155]" />
              <input type="text" placeholder="Label (optional)" value={newNumLabel}
                onChange={(e) => setNewNumLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNumber()}
                className="w-28 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#CBD5E1] dark:text-[#E2E8F0] dark:placeholder:text-[#334155]" />
              <button onClick={addNumber} disabled={addingNum || !newNum.trim()}
                className="flex items-center gap-1 rounded bg-[#F97316] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:bg-[#ea6a05] disabled:opacity-40">
                {addingNum ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Automation ── */}
      <Section icon={<Settings2 className="h-4 w-4" />} title="Automation"
        description="Control how the system handles sending rate requests and replies on your behalf.">
        {flagsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[#475569]"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="space-y-3">
            <ToggleRow
              label="Allow auto send to carrier"
              description="When enabled, the system can automatically send rate requests to carriers without requiring manual confirmation first."
              checked={autoSend} busy={autoSendBusy} onToggle={toggleAutoSend} />
            <ToggleRow
              label="Block sending if critical data is missing"
              description="When enabled, the 'Send to Carrier' button is disabled until all critical fields are filled in the freight request."
              checked={requireCritical} busy={requireCritBusy} onToggle={toggleRequireCritical}
              extra={requireCritical && (
                <div className="mt-2 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-[#1E3A5F] dark:bg-[#0F1E33]">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                      Critical fields <span className="normal-case font-normal">({criticalFields.length} selected)</span>
                    </p>
                    <button type="button" onClick={() => setShowPicker(true)}
                      className="text-xs font-medium text-[#F97316] hover:underline">Edit</button>
                  </div>
                  {criticalFields.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {criticalFields.map((key) => {
                        const opt = CRITICAL_FIELD_OPTIONS.find((o) => o.key === key)
                        return opt ? (
                          <span key={key}
                            className="inline-flex items-center gap-1 rounded-full border border-[#F97316]/30 bg-[#FFF7ED] px-2.5 py-0.5 text-xs font-medium text-[#EA580C] dark:bg-[#F97316]/10 dark:text-[#F97316]">
                            <AlertTriangle className="h-3 w-3" />{opt.label}
                          </span>
                        ) : null
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-[#94A3B8]">No fields selected. Click Edit to choose.</p>
                  )}
                </div>
              )} />
          </div>
        )}
      </Section>

      {showPicker && (
        <CriticalFieldsPicker initial={criticalFields}
          onSave={saveCriticalFields} onCancel={() => setShowPicker(false)} />
      )}
    </div>
  )
}
