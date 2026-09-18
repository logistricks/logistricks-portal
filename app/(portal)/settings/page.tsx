"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import { Mail, MessageCircle, Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────
type ReceiverEmail = { id: string; r_mail: string; active: boolean; label: string | null }
type WhatsappNumber = { id: string; number: string; active: boolean; label: string | null }

// ── Reusable channel row component ─────────────────────────────────────────────
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
      <span className={`h-2 w-2 rounded-full shrink-0 ${active ? "bg-green-400" : "bg-[#334155]"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#E2E8F0] truncate">{primary}</p>
        {secondary && <p className="text-xs text-[#475569]">{secondary}</p>}
      </div>
      <button
        onClick={onToggle}
        disabled={busy}
        title={active ? "Deactivate" : "Activate"}
        className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-[#94A3B8] transition-colors disabled:opacity-40"
      >
        {busy
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : active
            ? <ToggleRight className="h-5 w-5 text-green-400" />
            : <ToggleLeft  className="h-5 w-5" />
        }
        <span className="hidden sm:inline">{active ? "Active" : "Inactive"}</span>
      </button>
      <button
        onClick={onDelete}
        disabled={busy}
        title="Remove"
        className="flex h-7 w-7 items-center justify-center rounded text-[#334155] hover:bg-red-900/30 hover:text-red-400 transition-colors disabled:opacity-40"
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
        <span className="text-[#F97316]">{icon}</span>
        <h2 className="text-xs font-semibold text-[#64748B] uppercase tracking-widest">{title}</h2>
      </div>
      <p className="text-xs text-[#475569] mb-4">{description}</p>
      {children}
    </section>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [clientCode, setClientCode] = useState<string>("")
  const supabase = createClient()

  // ── Emails state ────────────────────────────────────────
  const [emails, setEmails]       = useState<ReceiverEmail[]>([])
  const [emailsLoading, setEmailsLoading] = useState(true)
  const [emailBusy, setEmailBusy] = useState<string | null>(null)
  const [newMail, setNewMail]     = useState("")
  const [newMailLabel, setNewMailLabel] = useState("")
  const [addingMail, setAddingMail] = useState(false)

  // ── WhatsApp state ──────────────────────────────────────
  const [numbers, setNumbers]       = useState<WhatsappNumber[]>([])
  const [numsLoading, setNumsLoading] = useState(true)
  const [numBusy, setNumBusy]       = useState<string | null>(null)
  const [newNum, setNewNum]         = useState("")
  const [newNumLabel, setNewNumLabel] = useState("")
  const [addingNum, setAddingNum]   = useState(false)

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
  }, [])

  // ── Email actions ───────────────────────────────────────
  async function toggleEmail(row: ReceiverEmail) {
    setEmailBusy(row.id); setError(null)
    const next = !row.active
    const { error } = await supabase.from("client_receiver_emails").update({ active: next }).eq("id", row.id)
    if (error) setError(error.message)
    else setEmails(p => p.map(e => e.id === row.id ? { ...e, active: next } : e))
    setEmailBusy(null)
  }
  async function deleteEmail(id: string) {
    setEmailBusy(id); setError(null)
    const { error } = await supabase.from("client_receiver_emails").delete().eq("id", id)
    if (error) setError(error.message)
    else setEmails(p => p.filter(e => e.id !== id))
    setEmailBusy(null)
  }
  async function addEmail() {
    if (!newMail.trim()) return
    setAddingMail(true); setError(null)
    const { data, error } = await supabase.from("client_receiver_emails")
      .insert({ client_code: clientCode, r_mail: newMail.trim(), label: newMailLabel.trim() || null, active: true })
      .select("id, r_mail, active, label").single()
    if (error) setError(error.message)
    else { setEmails(p => [...p, data]); setNewMail(""); setNewMailLabel("") }
    setAddingMail(false)
  }

  // ── WhatsApp actions ────────────────────────────────────
  async function toggleNumber(row: WhatsappNumber) {
    setNumBusy(row.id); setError(null)
    const next = !row.active
    const { error } = await supabase.from("client_whatsapp_numbers").update({ active: next }).eq("id", row.id)
    if (error) setError(error.message)
    else setNumbers(p => p.map(n => n.id === row.id ? { ...n, active: next } : n))
    setNumBusy(null)
  }
  async function deleteNumber(id: string) {
    setNumBusy(id); setError(null)
    const { error } = await supabase.from("client_whatsapp_numbers").delete().eq("id", id)
    if (error) setError(error.message)
    else setNumbers(p => p.filter(n => n.id !== id))
    setNumBusy(null)
  }
  async function addNumber() {
    if (!newNum.trim()) return
    setAddingNum(true); setError(null)
    const { data, error } = await supabase.from("client_whatsapp_numbers")
      .insert({ client_code: clientCode, number: newNum.trim(), label: newNumLabel.trim() || null, active: true })
      .select("id, number, active, label").single()
    if (error) setError(error.message)
    else { setNumbers(p => [...p, data]); setNewNum(""); setNewNumLabel("") }
    setAddingNum(false)
  }

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-white mb-1">Settings</h1>
      <p className="text-sm text-[#475569] mb-8">Manage your organisation's configuration</p>

      {error && (
        <p className="mb-6 rounded bg-red-900/30 px-3 py-2 text-xs text-red-400">{error}</p>
      )}

      {/* ── Receiver Emails ── */}
      <Section
        icon={<Mail className="h-4 w-4" />}
        title="Receiver Emails"
        description="Inbound addresses n8n monitors for this client. Only active addresses are processed. Deactivating stops new requests from that mailbox without deleting history."
      >
        {emailsLoading ? (
          <div className="flex items-center gap-2 text-[#475569] text-sm py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="rounded-lg border border-white/5 bg-[#0D1B2A] divide-y divide-white/5">
            {emails.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-[#334155]">No email addresses configured.</p>
            )}
            {emails.map(row => (
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
            <div className="flex items-center gap-2 px-4 py-3 bg-[#0a1628]">
              <Plus className="h-4 w-4 text-[#334155] shrink-0" />
              <input
                type="email"
                placeholder="new@intake.logistricks.com"
                value={newMail}
                onChange={e => setNewMail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addEmail()}
                className="flex-1 min-w-0 bg-transparent text-sm text-[#E2E8F0] placeholder:text-[#334155] outline-none"
              />
              <input
                type="text"
                placeholder="Label (optional)"
                value={newMailLabel}
                onChange={e => setNewMailLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addEmail()}
                className="w-28 bg-transparent text-sm text-[#E2E8F0] placeholder:text-[#334155] outline-none"
              />
              <button
                onClick={addEmail}
                disabled={addingMail || !newMail.trim()}
                className="flex items-center gap-1 rounded bg-[#F97316] px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-[#ea6a05]"
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
          <div className="flex items-center gap-2 text-[#475569] text-sm py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="rounded-lg border border-white/5 bg-[#0D1B2A] divide-y divide-white/5">
            {numbers.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-[#334155]">No WhatsApp numbers configured.</p>
            )}
            {numbers.map(row => (
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
            <div className="flex items-center gap-2 px-4 py-3 bg-[#0a1628]">
              <Plus className="h-4 w-4 text-[#334155] shrink-0" />
              <input
                type="tel"
                placeholder="+96612345678"
                value={newNum}
                onChange={e => setNewNum(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addNumber()}
                className="flex-1 min-w-0 bg-transparent text-sm text-[#E2E8F0] placeholder:text-[#334155] outline-none"
              />
              <input
                type="text"
                placeholder="Label (optional)"
                value={newNumLabel}
                onChange={e => setNewNumLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addNumber()}
                className="w-28 bg-transparent text-sm text-[#E2E8F0] placeholder:text-[#334155] outline-none"
              />
              <button
                onClick={addNumber}
                disabled={addingNum || !newNum.trim()}
                className="flex items-center gap-1 rounded bg-[#F97316] px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-[#ea6a05]"
              >
                {addingNum ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}
