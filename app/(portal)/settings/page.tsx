"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import {
  AlertTriangle, CheckSquare, ChevronRight, GitBranch, Loader2,
  Mail, MessageCircle, Plus, Settings2, Square, Trash2, X, Zap,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────
type ReceiverEmail  = { id: string; r_mail: string; active: boolean; label: string | null }
type WhatsappNumber = { id: string; number: string; active: boolean; label: string | null }

const CRITICAL_FIELD_OPTIONS = [
  { key: "cargo_type", label: "Cargo Type" },
  { key: "weight",     label: "Weight / Tonnage" },
  { key: "dimensions", label: "Dimensions" },
  { key: "equipment",  label: "Equipment / Container" },
  { key: "incoterm",   label: "Incoterm" },
  { key: "bl_type",    label: "BL Type" },
]

type SectionKey = "emails" | "whatsapp" | "automation" | "approval"

const SECTIONS: { key: SectionKey; label: string; icon: React.ElementType; desc: string }[] = [
  { key: "emails",     label: "Receiver Emails",   icon: Mail,       desc: "Inbound email addresses" },
  { key: "whatsapp",   label: "WhatsApp Numbers",  icon: MessageCircle, desc: "Inbound WhatsApp sources" },
  { key: "automation", label: "Automation",         icon: Zap,        desc: "Auto-send & auto-reply rules" },
  { key: "approval",   label: "Approval Workflow",  icon: GitBranch,  desc: "Approval cycles & chains" },
]

// ── Shared input style ─────────────────────────────────────────────────────────
const inputCls = "w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all placeholder:text-[var(--text-muted)]"
const inputStyle = {
  borderColor: "var(--card-border)",
  background: "var(--input-bg, var(--card-bg))",
  color: "var(--text-primary)",
}
const inputFocusStyle = { borderColor: "var(--brand-accent)", boxShadow: "0 0 0 3px rgba(232,130,26,0.12)" }

function Input({ value, onChange, onKeyDown, type = "text", placeholder, className = "" }: {
  value: string; onChange: (v: string) => void; onKeyDown?: (e: React.KeyboardEvent) => void
  type?: string; placeholder?: string; className?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      className={`${inputCls} ${className}`}
      style={{ ...inputStyle, ...(focused ? inputFocusStyle : {}) }}
    />
  )
}

// ── Toggle ─────────────────────────────────────────────────────────────────────
function Toggle({ checked, busy, onChange, label }: { checked: boolean; busy: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      type="button" onClick={onChange} disabled={busy} aria-pressed={checked}
      aria-label={label}
      className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-[#059669]" : "bg-[#CBD5E1] dark:bg-[#334155]"}`}
    >
      {busy
        ? <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
        : <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      }
    </button>
  )
}

// ── Setting card (toggle row) ──────────────────────────────────────────────────
function SettingCard({ label, description, checked, busy, onToggle, children }: {
  label: string; description: string; checked: boolean; busy: boolean; onToggle: () => void; children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{description}</p>
        </div>
        <Toggle checked={checked} busy={busy} onChange={onToggle} label={label} />
      </div>
      {children}
    </div>
  )
}

// ── Channel row ────────────────────────────────────────────────────────────────
function ChannelRow({ primary, secondary, active, busy, onToggle, onDelete }: {
  primary: string; secondary?: string | null; active: boolean; busy: boolean; onToggle: () => void; onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-emerald-400" : "bg-[var(--text-muted)]"}`} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{primary}</p>
        {secondary && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{secondary}</p>}
      </div>
      <Toggle checked={active} busy={busy} onChange={onToggle} label={`Toggle ${primary}`} />
      <button
        onClick={onDelete} disabled={busy} title="Remove"
        className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)"; (e.currentTarget as HTMLElement).style.color = "#ef4444" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)" }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Critical fields picker ─────────────────────────────────────────────────────
function CriticalFieldsPicker({ initial, onSave, onCancel }: {
  initial: string[]; onSave: (f: string[]) => void; onCancel: () => void
}) {
  const [selected, setSelected] = useState<string[]>(initial)
  function toggle(key: string) {
    setSelected((s) => s.includes(key) ? s.filter((k) => k !== key) : [...s, key])
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl shadow-2xl" style={{ background: "var(--card-bg)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--divider)" }}>
          <div>
            <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>Select Critical Fields</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Sending is blocked when these are missing</p>
          </div>
          <button onClick={onCancel} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-1.5">
          {CRITICAL_FIELD_OPTIONS.map((opt) => (
            <button key={opt.key} type="button" onClick={() => toggle(opt.key)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors"
              style={{ color: "var(--text-primary)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "" }}
            >
              {selected.includes(opt.key)
                ? <CheckSquare className="h-4 w-4 shrink-0" style={{ color: "var(--brand-accent)" }} />
                : <Square className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              }
              <span className={selected.includes(opt.key) ? "font-semibold" : ""}>{opt.label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--divider)" }}>
          <button onClick={onCancel} className="flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
            style={{ borderColor: "var(--card-border)", color: "var(--text-primary)", background: "transparent" }}
          >Cancel</button>
          <button onClick={() => onSave(selected)} disabled={selected.length === 0}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
            style={{ background: "var(--brand-accent)" }}
          >Save ({selected.length})</button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [active, setActive] = useState<SectionKey>("emails")
  const [clientCode, setClientCode] = useState<string>("")
  const supabase = createClient()

  // Email state
  const [emails, setEmails]               = useState<ReceiverEmail[]>([])
  const [emailsLoading, setEmailsLoading] = useState(true)
  const [emailBusy, setEmailBusy]         = useState<string | null>(null)
  const [newMail, setNewMail]             = useState("")
  const [newMailLabel, setNewMailLabel]   = useState("")
  const [addingMail, setAddingMail]       = useState(false)

  // WhatsApp state
  const [numbers, setNumbers]         = useState<WhatsappNumber[]>([])
  const [numsLoading, setNumsLoading] = useState(true)
  const [numBusy, setNumBusy]         = useState<string | null>(null)
  const [newNum, setNewNum]           = useState("")
  const [newNumLabel, setNewNumLabel] = useState("")
  const [addingNum, setAddingNum]     = useState(false)

  // Automation state
  const [autoSend, setAutoSend]                           = useState(false)
  const [requireCritical, setRequireCritical]             = useState(false)
  const [criticalFields, setCriticalFields]               = useState<string[]>([])
  const [autoReply, setAutoReply]                         = useState(false)
  const [flagsLoading, setFlagsLoading]                   = useState(true)
  const [autoSendBusy, setAutoSendBusy]                   = useState(false)
  const [requireCritBusy, setRequireCritBusy]             = useState(false)
  const [autoReplyBusy, setAutoReplyBusy]                 = useState(false)
  const [autoReplyMissing, setAutoReplyMissing]           = useState(false)
  const [autoReplyMissingBusy, setAutoReplyMissingBusy]   = useState(false)
  const [autoReplyComplete, setAutoReplyComplete]         = useState(false)
  const [autoReplyCompleteBusy, setAutoReplyCompleteBusy] = useState(false)
  const [showPicker, setShowPicker]                       = useState(false)
  const [error, setError]                                 = useState<string | null>(null)

  useEffect(() => {
    const cc = sessionStorage.getItem("portal_client_code") ?? ""
    setClientCode(cc)

    supabase.from("client_receiver_emails").select("id, r_mail, active, label").eq("client_code", cc).order("created_at")
      .then(({ data }) => { setEmails(data ?? []); setEmailsLoading(false) })

    supabase.from("client_whatsapp_numbers").select("id, number, active, label").eq("client_code", cc).order("created_at")
      .then(({ data }) => { setNumbers(data ?? []); setNumsLoading(false) })

    fetch("/api/settings").then((r) => r.json()).then((data) => {
      if (data && !data.error) {
        setAutoSend(data.allow_auto_send_to_carrier ?? false)
        setRequireCritical(data.require_critical_data ?? false)
        setCriticalFields(data.critical_fields ?? [])
        setAutoReply(data.auto_reply_enabled ?? false)
        setAutoReplyMissing(data.auto_reply_missing_enabled ?? false)
        setAutoReplyComplete(data.auto_reply_complete_enabled ?? false)
      }
      setFlagsLoading(false)
    }).catch(() => setFlagsLoading(false))
  }, [])

  // Email actions
  async function toggleEmail(row: ReceiverEmail) {
    setEmailBusy(row.id); const next = !row.active
    const { error } = await supabase.from("client_receiver_emails").update({ active: next }).eq("id", row.id)
    if (error) setError(error.message)
    else setEmails((p) => p.map((e) => e.id === row.id ? { ...e, active: next } : e))
    setEmailBusy(null)
  }
  async function deleteEmail(id: string) {
    setEmailBusy(id)
    const { error } = await supabase.from("client_receiver_emails").delete().eq("id", id)
    if (error) setError(error.message)
    else setEmails((p) => p.filter((e) => e.id !== id))
    setEmailBusy(null)
  }
  async function addEmail() {
    if (!newMail.trim()) return; setAddingMail(true)
    const { data, error } = await supabase.from("client_receiver_emails")
      .insert({ client_code: clientCode, r_mail: newMail.trim(), label: newMailLabel.trim() || null, active: true })
      .select("id, r_mail, active, label").single()
    if (error) setError(error.message)
    else { setEmails((p) => [...p, data]); setNewMail(""); setNewMailLabel("") }
    setAddingMail(false)
  }

  // WhatsApp actions
  async function toggleNumber(row: WhatsappNumber) {
    setNumBusy(row.id); const next = !row.active
    const { error } = await supabase.from("client_whatsapp_numbers").update({ active: next }).eq("id", row.id)
    if (error) setError(error.message)
    else setNumbers((p) => p.map((n) => n.id === row.id ? { ...n, active: next } : n))
    setNumBusy(null)
  }
  async function deleteNumber(id: string) {
    setNumBusy(id)
    const { error } = await supabase.from("client_whatsapp_numbers").delete().eq("id", id)
    if (error) setError(error.message)
    else setNumbers((p) => p.filter((n) => n.id !== id))
    setNumBusy(null)
  }
  async function addNumber() {
    if (!newNum.trim()) return; setAddingNum(true)
    const { data, error } = await supabase.from("client_whatsapp_numbers")
      .insert({ client_code: clientCode, number: newNum.trim(), label: newNumLabel.trim() || null, active: true })
      .select("id, number, active, label").single()
    if (error) setError(error.message)
    else { setNumbers((p) => [...p, data]); setNewNum(""); setNewNumLabel("") }
    setAddingNum(false)
  }

  // Automation helpers
  async function patchSettings(fields: Record<string, unknown>): Promise<string | null> {
    const res = await fetch("/api/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
    })
    const json = await res.json()
    if (!res.ok || json.error) return json.error ?? "Save failed"
    return null
  }

  async function toggleAutoReply() {
    setAutoReplyBusy(true)
    const err = await patchSettings({ auto_reply_enabled: !autoReply })
    if (err) setError(err); else setAutoReply((v) => !v)
    setAutoReplyBusy(false)
  }
  async function toggleAutoReplyMissing() {
    setAutoReplyMissingBusy(true)
    const err = await patchSettings({ auto_reply_missing_enabled: !autoReplyMissing })
    if (err) setError(err); else setAutoReplyMissing((v) => !v)
    setAutoReplyMissingBusy(false)
  }
  async function toggleAutoReplyComplete() {
    setAutoReplyCompleteBusy(true)
    const err = await patchSettings({ auto_reply_complete_enabled: !autoReplyComplete })
    if (err) setError(err); else setAutoReplyComplete((v) => !v)
    setAutoReplyCompleteBusy(false)
  }
  async function toggleAutoSend() {
    setAutoSendBusy(true)
    const err = await patchSettings({ allow_auto_send_to_carrier: !autoSend })
    if (err) setError(err); else setAutoSend((v) => !v)
    setAutoSendBusy(false)
  }
  async function toggleRequireCritical() {
    const next = !requireCritical
    if (next && criticalFields.length === 0) { setShowPicker(true); return }
    setRequireCritBusy(true)
    const err = await patchSettings({ require_critical_data: next })
    if (err) setError(err); else setRequireCritical(next)
    setRequireCritBusy(false)
  }
  async function saveCriticalFields(fields: string[]) {
    setRequireCritBusy(true)
    const err = await patchSettings({ require_critical_data: true, critical_fields: fields })
    if (err) setError(err)
    else { setCriticalFields(fields); setRequireCritical(true) }
    setShowPicker(false); setRequireCritBusy(false)
  }

  // ── Render sections ─────────────────────────────────────────────────────────
  function renderSection() {
    if (active === "emails") return (
      <div>
        <div className="mb-5">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Receiver Emails</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Inbound addresses monitored for incoming freight requests. Only active addresses are processed.</p>
        </div>
        {emailsLoading
          ? <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-secondary)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
              {emails.length === 0 && (
                <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>No email addresses configured.</p>
              )}
              {emails.map((row) => (
                <ChannelRow key={row.id} primary={row.r_mail} secondary={row.label} active={row.active}
                  busy={emailBusy === row.id} onToggle={() => toggleEmail(row)} onDelete={() => deleteEmail(row.id)} />
              ))}
              {/* Add row */}
              <div className="flex items-center gap-2 px-4 py-3" style={{ background: "var(--table-header-bg)" }}>
                <Plus className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                <Input type="email" placeholder="new@intake.example.com" value={newMail} onChange={setNewMail}
                  onKeyDown={(e) => e.key === "Enter" && addEmail()} className="flex-1" />
                <Input placeholder="Label (optional)" value={newMailLabel} onChange={setNewMailLabel}
                  onKeyDown={(e) => e.key === "Enter" && addEmail()} className="w-32" />
                <button onClick={addEmail} disabled={addingMail || !newMail.trim()}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-all disabled:opacity-40"
                  style={{ background: "var(--brand-accent)" }}
                >
                  {addingMail ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                </button>
              </div>
            </div>
          )
        }
      </div>
    )

    if (active === "whatsapp") return (
      <div>
        <div className="mb-5">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>WhatsApp Numbers</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Sender numbers monitored for inbound WhatsApp rate replies. Use E.164 format (+96612345678).</p>
        </div>
        {numsLoading
          ? <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-secondary)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
              {numbers.length === 0 && (
                <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>No WhatsApp numbers configured.</p>
              )}
              {numbers.map((row) => (
                <ChannelRow key={row.id} primary={row.number} secondary={row.label} active={row.active}
                  busy={numBusy === row.id} onToggle={() => toggleNumber(row)} onDelete={() => deleteNumber(row.id)} />
              ))}
              <div className="flex items-center gap-2 px-4 py-3" style={{ background: "var(--table-header-bg)" }}>
                <Plus className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                <Input type="tel" placeholder="+96612345678" value={newNum} onChange={setNewNum}
                  onKeyDown={(e) => e.key === "Enter" && addNumber()} className="flex-1" />
                <Input placeholder="Label (optional)" value={newNumLabel} onChange={setNewNumLabel}
                  onKeyDown={(e) => e.key === "Enter" && addNumber()} className="w-32" />
                <button onClick={addNumber} disabled={addingNum || !newNum.trim()}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-all disabled:opacity-40"
                  style={{ background: "var(--brand-accent)" }}
                >
                  {addingNum ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                </button>
              </div>
            </div>
          )
        }
      </div>
    )

    if (active === "automation") return (
      <div>
        <div className="mb-5">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Automation</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Control how the system handles sending rate requests and replies on your behalf.</p>
        </div>
        {flagsLoading
          ? <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-secondary)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          : (
            <div className="space-y-3">
              <SettingCard
                label="Send auto-reply to sender"
                description="An acknowledgement email is automatically sent after a freight request is received and parsed. Requires an Auto-Reply template."
                checked={autoReply} busy={autoReplyBusy} onToggle={toggleAutoReply}
              />
              <SettingCard
                label="Allow auto send to carrier"
                description="The system can automatically send rate requests to carriers without requiring manual confirmation."
                checked={autoSend} busy={autoSendBusy} onToggle={toggleAutoSend}
              />
              <SettingCard
                label="Block sending if critical data is missing"
                description="The Send to Carrier button is disabled until all critical fields are present in the freight request."
                checked={requireCritical} busy={requireCritBusy} onToggle={toggleRequireCritical}
              >
                {requireCritical && (
                  <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--divider)", background: "var(--table-header-bg)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Critical fields <span className="normal-case font-normal">({criticalFields.length} selected)</span>
                      </p>
                      <button onClick={() => setShowPicker(true)} className="text-xs font-semibold hover:underline" style={{ color: "var(--brand-accent)" }}>Edit</button>
                    </div>
                    {criticalFields.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {criticalFields.map((key) => {
                          const opt = CRITICAL_FIELD_OPTIONS.find((o) => o.key === key)
                          return opt ? (
                            <span key={key} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(232,130,26,0.12)", color: "var(--brand-accent)", border: "1px solid rgba(232,130,26,0.25)" }}>
                              <AlertTriangle className="h-3 w-3" />{opt.label}
                            </span>
                          ) : null
                        })}
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>No fields selected. Click Edit to choose.</p>
                    )}

                    {/* Nested toggles */}
                    <div className="mt-3 flex items-start justify-between gap-4 pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Auto-reply when critical data is missing</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Sends the missing-data template. Requires a Missing Data template.</p>
                      </div>
                      <Toggle checked={autoReplyMissing} busy={autoReplyMissingBusy} onChange={toggleAutoReplyMissing} label="Auto-reply missing" />
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-4 pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Auto-reply when all data is complete</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Sends the complete-data template when all required fields are present.</p>
                      </div>
                      <Toggle checked={autoReplyComplete} busy={autoReplyCompleteBusy} onChange={toggleAutoReplyComplete} label="Auto-reply complete" />
                    </div>
                  </div>
                )}
              </SettingCard>
            </div>
          )
        }
      </div>
    )

    if (active === "approval") return (
      <div>
        <div className="mb-5">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Approval Workflow</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Configure named approval cycles and step chains used when submitting freight requests for internal review.</p>
        </div>
        <Link
          href="/settings/approval-cycles"
          className="flex items-center justify-between rounded-xl border px-5 py-4 text-sm font-semibold transition-all"
          style={{ borderColor: "var(--card-border)", color: "var(--text-primary)", background: "var(--card-bg)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(232,130,26,0.4)"; (e.currentTarget as HTMLAnchorElement).style.background = "rgba(232,130,26,0.04)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLAnchorElement).style.background = "var(--card-bg)" }}
        >
          <span>Manage Approval Cycles</span>
          <ChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        </Link>
      </div>
    )
  }

  return (
    <div className="portal-page p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Manage your organisation's configuration</p>
      </div>

      {error && (
        <p className="mb-5 rounded-lg px-4 py-3 text-sm" style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</p>
      )}

      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
            {SECTIONS.map((s, i) => {
              const Icon = s.icon
              const isActive = active === s.key
              return (
                <button
                  key={s.key}
                  onClick={() => setActive(s.key)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all"
                  style={{
                    borderBottom: i < SECTIONS.length - 1 ? "1px solid var(--divider)" : "none",
                    background: isActive ? "rgba(232,130,26,0.08)" : "transparent",
                    color: isActive ? "var(--brand-accent)" : "var(--text-secondary)",
                    borderLeft: isActive ? "3px solid var(--brand-accent)" : "3px solid transparent",
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)" }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{s.label}</p>
                    <p className="text-[11px] leading-tight mt-0.5 truncate" style={{ color: isActive ? "rgba(232,130,26,0.7)" : "var(--text-muted)" }}>{s.desc}</p>
                  </div>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1 max-w-2xl">
          {renderSection()}
        </div>
      </div>

      {showPicker && (
        <CriticalFieldsPicker
          initial={criticalFields}
          onSave={saveCriticalFields}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
