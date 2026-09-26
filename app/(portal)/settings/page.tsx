"use client"

import Link from "next/link"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import {
  AlertTriangle,
  CheckSquare,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  Square,
  ChevronRight,
  GitBranch,
  Trash2,
  X,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────
type ReceiverEmail = { id: string; r_mail: string; active: boolean; label: string | null }
type WhatsappNumber = { id: string; number: string; active: boolean; label: string | null }

const CRITICAL_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "cargo_type", label: "Cargo Type" },
  { key: "weight",     label: "Weight / Tonnage" },
  { key: "dimensions", label: "Dimensions" },
  { key: "equipment",  label: "Equipment / Container" },
  { key: "incoterm",   label: "Incoterm" },
  { key: "bl_type",    label: "BL Type" },
]

// ── Reusable channel row ───────────────────────────────────────────────────────
function ChannelRow({
  primary,
  secondary,
  active,
  busy,
  onToggle,
  onDelete,
}: {
  primary: string
  secondary?: string | null
  active: boolean
  busy: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-green-400" : "bg-[#CBD5E1] dark:bg-[#334155]"}`} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{primary}</p>
        {secondary && <p className="text-xs text-[#475569]">{secondary}</p>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={active}
        title={active ? "Deactivate" : "Activate"}
        className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40 ${
          active ? "bg-[#059669]" : "bg-[#CBD5E1] dark:bg-[#334155]"
        }`}
      >
        {busy ? (
          <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
        ) : (
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              active ? "translate-x-5" : "translate-x-0"
            }`}
          />
        )}
      </button>
      <button
        onClick={onDelete}
        disabled={busy}
        title="Remove"
        className="flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-red-100 hover:text-red-500 disabled:opacity-40 dark:text-[#334155] dark:hover:bg-red-900/30 dark:hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-2">
        <span style={{color:"var(--brand-accent)"}}>{icon}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{color:"var(--text-secondary)"}}>{title}</h2>
      </div>
      <p className="mb-4 text-xs" style={{color:"var(--text-secondary)"}}>{description}</p>
      {children}
    </section>
  )
}

// ── Toggle row ─────────────────────────────────────────────────────────────────
function ToggleRow({
  label,
  description,
  checked,
  busy,
  onToggle,
  extra,
}: {
  label: string
  description: string
  checked: boolean
  busy: boolean
  onToggle: () => void
  extra?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#E2E8F0] bg-white p-4 border-[var(--card-border)] bg-[var(--card-bg)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
          <p className="text-xs text-[#475569] mt-0.5">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          aria-pressed={checked}
          className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40 ${
            checked ? "bg-[#059669]" : "bg-[#CBD5E1] dark:bg-[#334155]"
          }`}
        >
          {busy ? (
            <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
          ) : (
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                checked ? "translate-x-5" : "translate-x-0"
              }`}
            />
          )}
        </button>
      </div>
      {extra}
    </div>
  )
}

// ── Critical Fields Picker ─────────────────────────────────────────────────────
function CriticalFieldsPicker({
  initial,
  onSave,
  onCancel,
}: {
  initial: string[]
  onSave: (fields: string[]) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<string[]>(initial)

  function toggle(key: string) {
    setSelected((s) => s.includes(key) ? s.filter((k) => k !== key) : [...s, key])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-[#111E33]">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4 border-[var(--card-border)]">
          <div>
            <h3 className="font-semibold text-[#0F172A] dark:text-white">Select Critical Fields</h3>
            <p className="text-xs text-[#475569] mt-0.5">Sending is blocked when these are missing</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] dark:hover:bg-[#1E3A5F] dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {CRITICAL_FIELD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggle(opt.key)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#F8FAFC] dark:hover:bg-[#1E3A5F]/40"
            >
              {selected.includes(opt.key)
                ? <CheckSquare className="h-4 w-4 shrink-0 text-[var(--brand-accent)]" />
                : <Square       className="h-4 w-4 shrink-0 text-[#CBD5E1] dark:text-[#334155]" />
              }
              <span className={selected.includes(opt.key) ? "font-medium text-[var(--text-primary)]" : "text-[#475569]"}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-3 border-t border-[#E2E8F0] px-5 py-4 border-[var(--card-border)]">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:border-[var(--brand-accent)]/40 border-[var(--card-border)] dark:bg-transparent dark:text-[#E2E8F0]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(selected)}
            disabled={selected.length === 0}
            className="flex-1 rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-accent-hover)] disabled:opacity-40"
          >
            Save ({selected.length} selected)
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [clientCode, setClientCode] = useState<string>("")
  const supabase = createClient()

  // ── Emails state ────────────────────────────────────────
  const [emails, setEmails]               = useState<ReceiverEmail[]>([])
  const [emailsLoading, setEmailsLoading] = useState(true)
  const [emailBusy, setEmailBusy]         = useState<string | null>(null)
  const [newMail, setNewMail]             = useState("")
  const [newMailLabel, setNewMailLabel]   = useState("")
  const [addingMail, setAddingMail]       = useState(false)

  // ── WhatsApp state ──────────────────────────────────────
  const [numbers, setNumbers]           = useState<WhatsappNumber[]>([])
  const [numsLoading, setNumsLoading]   = useState(true)
  const [numBusy, setNumBusy]           = useState<string | null>(null)
  const [newNum, setNewNum]             = useState("")
  const [newNumLabel, setNewNumLabel]   = useState("")
  const [addingNum, setAddingNum]       = useState(false)

  // ── Automation flags ────────────────────────────────────
  const [autoSend, setAutoSend]             = useState(false)
  const [requireCritical, setRequireCritical] = useState(false)
  const [criticalFields, setCriticalFields] = useState<string[]>([])
  const [autoReply, setAutoReply]           = useState(false)
  const [flagsLoading, setFlagsLoading]     = useState(true)
  const [autoSendBusy, setAutoSendBusy]     = useState(false)
  const [requireCritBusy, setRequireCritBusy] = useState(false)
  const [autoReplyBusy, setAutoReplyBusy]   = useState(false)
  const [autoReplyMissing, setAutoReplyMissing] = useState(false)
  const [autoReplyMissingBusy, setAutoReplyMissingBusy] = useState(false)
  const [autoReplyComplete, setAutoReplyComplete] = useState(false)
  const [autoReplyCompleteBusy, setAutoReplyCompleteBusy] = useState(false)
  const [showPicker, setShowPicker]         = useState(false)

  const [error, setError] = useState<string | null>(null)

  // ── Load ────────────────────────────────────────────────
  useEffect(() => {
    const cc = sessionStorage.getItem("portal_client_code") ?? ""
    setClientCode(cc)

    supabase.from("client_receiver_emails")
      .select("id, r_mail, active, label")
      .eq("client_code", cc).order("created_at")
      .then(({ data }) => { setEmails(data ?? []); setEmailsLoading(false) })

    supabase.from("client_whatsapp_numbers")
      .select("id, number, active, label")
      .eq("client_code", cc).order("created_at")
      .then(({ data }) => { setNumbers(data ?? []); setNumsLoading(false) })

    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setAutoSend(data.allow_auto_send_to_carrier ?? false)
          setRequireCritical(data.require_critical_data ?? false)
          setCriticalFields(data.critical_fields ?? [])
          setAutoReply(data.auto_reply_enabled ?? false)
          setAutoReplyMissing(data.auto_reply_missing_enabled ?? false)
          setAutoReplyComplete(data.auto_reply_complete_enabled ?? false)
        }
        setFlagsLoading(false)
      })
      .catch(() => setFlagsLoading(false))
  }, [])

  // ── Email actions ────────────────────────────────────────
  async function toggleEmail(row: ReceiverEmail) {
    setEmailBusy(row.id); setError(null)
    const next = !row.active
    const { error } = await supabase.from("client_receiver_emails").update({ active: next }).eq("id", row.id)
    if (error) setError(error.message)
    else setEmails((p) => p.map((e) => e.id === row.id ? { ...e, active: next } : e))
    setEmailBusy(null)
  }
  async function deleteEmail(id: string) {
    setEmailBusy(id); setError(null)
    const { error } = await supabase.from("client_receiver_emails").delete().eq("id", id)
    if (error) setError(error.message)
    else setEmails((p) => p.filter((e) => e.id !== id))
    setEmailBusy(null)
  }
  async function addEmail() {
    if (!newMail.trim()) return
    setAddingMail(true); setError(null)
    const { data, error } = await supabase.from("client_receiver_emails")
      .insert({ client_code: clientCode, r_mail: newMail.trim(), label: newMailLabel.trim() || null, active: true })
      .select("id, r_mail, active, label").single()
    if (error) setError(error.message)
    else { setEmails((p) => [...p, data]); setNewMail(""); setNewMailLabel("") }
    setAddingMail(false)
  }

  // ── WhatsApp actions ─────────────────────────────────────
  async function toggleNumber(row: WhatsappNumber) {
    setNumBusy(row.id); setError(null)
    const next = !row.active
    const { error } = await supabase.from("client_whatsapp_numbers").update({ active: next }).eq("id", row.id)
    if (error) setError(error.message)
    else setNumbers((p) => p.map((n) => n.id === row.id ? { ...n, active: next } : n))
    setNumBusy(null)
  }
  async function deleteNumber(id: string) {
    setNumBusy(id); setError(null)
    const { error } = await supabase.from("client_whatsapp_numbers").delete().eq("id", id)
    if (error) setError(error.message)
    else setNumbers((p) => p.filter((n) => n.id !== id))
    setNumBusy(null)
  }
  async function addNumber() {
    if (!newNum.trim()) return
    setAddingNum(true); setError(null)
    const { data, error } = await supabase.from("client_whatsapp_numbers")
      .insert({ client_code: clientCode, number: newNum.trim(), label: newNumLabel.trim() || null, active: true })
      .select("id, number, active, label").single()
    if (error) setError(error.message)
    else { setNumbers((p) => [...p, data]); setNewNum(""); setNewNumLabel("") }
    setAddingNum(false)
  }

  // ── Automation actions ───────────────────────────────────
  async function patchSettings(fields: Record<string, unknown>): Promise<string | null> {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    })
    const json = await res.json()
    if (!res.ok || json.error) return json.error ?? "Save failed"
    return null
  }

  async function toggleAutoReply() {
    setAutoReplyBusy(true); setError(null)
    const next = !autoReply
    const err = await patchSettings({ auto_reply_enabled: next })
    if (err) { setError(err); setAutoReplyBusy(false); return }
    setAutoReply(next)
    setAutoReplyBusy(false)
  }

  async function toggleAutoReplyMissing() {
    setAutoReplyMissingBusy(true); setError(null)
    const next = !autoReplyMissing
    const err = await patchSettings({ auto_reply_missing_enabled: next })
    if (err) { setError(err); setAutoReplyMissingBusy(false); return }
    setAutoReplyMissing(next)
    setAutoReplyMissingBusy(false)
  }


  async function toggleAutoReplyComplete() {
    setAutoReplyCompleteBusy(true); setError(null)
    const next = !autoReplyComplete
    const err = await patchSettings({ auto_reply_complete_enabled: next })
    if (err) { setError(err); setAutoReplyCompleteBusy(false); return }
    setAutoReplyComplete(next)
    setAutoReplyCompleteBusy(false)
  }

  async function toggleAutoSend() {
    setAutoSendBusy(true); setError(null)
    const next = !autoSend
    const err = await patchSettings({ allow_auto_send_to_carrier: next })
    if (err) { setError(err); setAutoSendBusy(false); return }
    setAutoSend(next)
    setAutoSendBusy(false)
  }

  async function toggleRequireCritical() {
    setError(null)
    const next = !requireCritical
    if (next && criticalFields.length === 0) {
      // Must pick fields first
      setShowPicker(true)
      return
    }
    setRequireCritBusy(true)
    const err = await patchSettings({ require_critical_data: next })
    if (err) { setError(err); setRequireCritBusy(false); return }
    setRequireCritical(next)
    setRequireCritBusy(false)
  }

  async function saveCriticalFields(fields: string[]) {
    setRequireCritBusy(true); setError(null)
    const err = await patchSettings({ require_critical_data: true, critical_fields: fields })
    if (err) { setError(err); setShowPicker(false); setRequireCritBusy(false); return }
    setCriticalFields(fields)
    setRequireCritical(true)
    setShowPicker(false)
    setRequireCritBusy(false)
  }

  async function openPickerToEdit() {
    setShowPicker(true)
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="mb-1 text-xl font-bold text-[var(--text-primary)]">Settings</h1>
      <p className="mb-8 text-sm text-[#475569]">Manage your organisation's configuration</p>

      {error && (
        <p className="mb-6 rounded bg-red-100 px-3 py-2 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">{error}</p>
      )}

      {/* ── Receiver Emails ── */}
      <Section
        icon={<Mail className="h-4 w-4" />}
        title="Receiver Emails"
        description="Inbound addresses n8n monitors for this client. Only active addresses are processed. Deactivating stops new requests from that mailbox without deleting history."
      >
        {emailsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[#475569]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] dark:divide-white/5 dark:border-white/5 dark:bg-[#0D1B2A]">
            {emails.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)] dark:text-[#334155]">No email addresses configured.</p>
            )}
            {emails.map((row) => (
              <ChannelRow
                key={row.id}
                primary={row.r_mail}
                secondary={row.label}
                active={row.active}
                busy={emailBusy === row.id}
                onToggle={() => toggleEmail(row)}
                onDelete={() => deleteEmail(row.id)}
              />
            ))}
            <div className="flex items-center gap-2 bg-[#F1F5F9] px-4 py-3 dark:bg-[#0a1628]">
              <Plus className="h-4 w-4 shrink-0 text-[var(--text-muted)] dark:text-[#334155]" />
              <input
                type="email"
                placeholder="new@intake.logistricks.com"
                value={newMail}
                onChange={(e) => setNewMail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmail()}
                className="min-w-0 flex-1 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#CBD5E1] dark:text-[#E2E8F0] dark:placeholder:text-[#334155]"
              />
              <input
                type="text"
                placeholder="Label (optional)"
                value={newMailLabel}
                onChange={(e) => setNewMailLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmail()}
                className="w-28 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#CBD5E1] dark:text-[#E2E8F0] dark:placeholder:text-[#334155]"
              />
              <button
                onClick={addEmail}
                disabled={addingMail || !newMail.trim()}
                className="flex items-center gap-1 rounded bg-[var(--brand-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:bg-[#ea6a05] disabled:opacity-40"
              >
                {addingMail ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── WhatsApp Numbers ── */}
      <Section
        icon={<MessageCircle className="h-4 w-4" />}
        title="WhatsApp Numbers"
        description="Sender numbers n8n listens to for inbound WhatsApp rate replies. Only active numbers are processed. Use E.164 format (+96612345678)."
      >
        {numsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[#475569]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] dark:divide-white/5 dark:border-white/5 dark:bg-[#0D1B2A]">
            {numbers.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)] dark:text-[#334155]">No WhatsApp numbers configured.</p>
            )}
            {numbers.map((row) => (
              <ChannelRow
                key={row.id}
                primary={row.number}
                secondary={row.label}
                active={row.active}
                busy={numBusy === row.id}
                onToggle={() => toggleNumber(row)}
                onDelete={() => deleteNumber(row.id)}
              />
            ))}
            <div className="flex items-center gap-2 bg-[#F1F5F9] px-4 py-3 dark:bg-[#0a1628]">
              <Plus className="h-4 w-4 shrink-0 text-[var(--text-muted)] dark:text-[#334155]" />
              <input
                type="tel"
                placeholder="+96612345678"
                value={newNum}
                onChange={(e) => setNewNum(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNumber()}
                className="min-w-0 flex-1 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#CBD5E1] dark:text-[#E2E8F0] dark:placeholder:text-[#334155]"
              />
              <input
                type="text"
                placeholder="Label (optional)"
                value={newNumLabel}
                onChange={(e) => setNewNumLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNumber()}
                className="w-28 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#CBD5E1] dark:text-[#E2E8F0] dark:placeholder:text-[#334155]"
              />
              <button
                onClick={addNumber}
                disabled={addingNum || !newNum.trim()}
                className="flex items-center gap-1 rounded bg-[var(--brand-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:bg-[#ea6a05] disabled:opacity-40"
              >
                {addingNum ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── Automation ── */}
      <Section
        icon={<Settings2 className="h-4 w-4" />}
        title="Automation"
        description="Control how the system handles sending rate requests and replies on your behalf."
      >
        {flagsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-[#475569]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            {/* Auto reply toggle */}
            <ToggleRow
              label="Send auto-reply to sender"
              description="When enabled, an acknowledgement email is automatically sent to the sender after their freight request is received and parsed. Requires an Auto-Reply template to be configured."
              checked={autoReply}
              busy={autoReplyBusy}
              onToggle={toggleAutoReply}
            />

            {/* Auto send toggle */}
            <ToggleRow
              label="Allow auto send to carrier"
              description="When enabled, the system can automatically send rate requests to carriers without requiring manual confirmation first."
              checked={autoSend}
              busy={autoSendBusy}
              onToggle={toggleAutoSend}
            />

            {/* Require critical data toggle */}
            <ToggleRow
              label="Block sending if critical data is missing"
              description="When enabled, the 'Send to Carrier' button is disabled until all critical fields are filled in the freight request. You can only reply to ask for the missing data."
              checked={requireCritical}
              busy={requireCritBusy}
              onToggle={toggleRequireCritical}
              extra={
                requireCritical && (
                  <div className="mt-2 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3 border-[var(--card-border)] dark:bg-[#0F1E33]">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                        Critical fields <span className="normal-case font-normal">({criticalFields.length} selected)</span>
                      </p>
                      <button
                        type="button"
                        onClick={openPickerToEdit}
                        className="text-xs font-medium text-[var(--brand-accent)] hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                    {criticalFields.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {criticalFields.map((key) => {
                          const opt = CRITICAL_FIELD_OPTIONS.find((o) => o.key === key)
                          return opt ? (
                            <span
                              key={key}
                              className="inline-flex items-center gap-1 rounded-full border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/10 px-2.5 py-0.5 text-xs font-medium text-[#EA580C] dark:bg-[var(--brand-accent)]/10 dark:text-[var(--brand-accent)]"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {opt.label}
                            </span>
                          ) : null
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">No fields selected. Click Edit to choose.</p>
                    )}

                    {/* Nested: auto-reply when missing */}
                    <div className="mt-3 flex items-center justify-between gap-4 border-t border-[#E2E8F0] pt-3 border-[var(--card-border)]">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--text-primary)]">Auto-reply when critical data is missing</p>
                        <p className="text-xs text-[#475569] mt-0.5">Sends the missing-data auto-reply template instead of the standard acknowledgement when required fields are absent. Requires an Auto-Reply Missing template.</p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleAutoReplyMissing}
                        disabled={autoReplyMissingBusy}
                        aria-pressed={autoReplyMissing}
                        className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40 ${
                          autoReplyMissing ? "bg-[#059669]" : "bg-[#CBD5E1] dark:bg-[#334155]"
                        }`}
                      >
                        {autoReplyMissingBusy ? (
                          <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
                        ) : (
                          <span
                            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              autoReplyMissing ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        )}
                      </button>
                    </div>

                    {/* Nested: auto-reply when data is complete */}
                    <div className="mt-3 flex items-center justify-between gap-4 border-t border-[#E2E8F0] pt-3 border-[var(--card-border)]">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--text-primary)]">Auto-reply when all data is complete</p>
                        <p className="text-xs text-[#475569] mt-0.5">Sends the complete-data auto-reply template when all required fields are present. Requires a Complete Data template. Priority: Missing fields &gt; Complete &gt; Standard.</p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleAutoReplyComplete}
                        disabled={autoReplyCompleteBusy}
                        aria-pressed={autoReplyComplete}
                        className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40 ${
                          autoReplyComplete ? "bg-[#059669]" : "bg-[#CBD5E1] dark:bg-[#334155]"
                        }`}
                      >
                        {autoReplyCompleteBusy ? (
                          <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
                        ) : (
                          <span
                            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              autoReplyComplete ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        )}
                      </button>
                    </div>
                  </div>
                )
              }
            />
          </div>
        )}
      </Section>

      {/* ── Approval Workflow ── */}
      <Section
        icon={<GitBranch className="h-4 w-4" />}
        title="Approval Workflow"
        description="Configure named approval cycles and step chains used when submitting freight requests for internal review."
      >
        <Link
          href="/settings/approval-cycles"
          className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-medium text-[#0F172A] hover:border-[var(--brand-accent)]/40 hover:bg-[var(--brand-accent)]/10 transition-colors border-[var(--card-border)] bg-[var(--card-bg)] dark:text-[#E2E8F0] dark:hover:border-[var(--brand-accent)]/40"
        >
          <span>Manage Approval Cycles</span>
          <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
        </Link>
      </Section>

      {/* ── Critical fields picker ── */}
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
