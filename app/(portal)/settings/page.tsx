"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import { Mail, Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from "lucide-react"

type ReceiverEmail = {
  id: string
  r_mail: string
  active: boolean
  label: string | null
}

export default function SettingsPage() {
  const [clientCode, setClientCode]   = useState<string>("")
  const [emails, setEmails]           = useState<ReceiverEmail[]>([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState<string | null>(null) // id of row being saved
  const [newMail, setNewMail]         = useState("")
  const [newLabel, setNewLabel]       = useState("")
  const [adding, setAdding]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const supabase = createClient()

  // ── Bootstrap ─────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const cc = sessionStorage.getItem("portal_client_code") ?? ""
        setClientCode(cc)

        const { data, error } = await supabase
          .from("client_receiver_emails")
          .select("id, r_mail, active, label")
          .eq("client_code", cc)
          .order("created_at")

        if (error) throw error
        setEmails(data ?? [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Toggle active flag ────────────────────────────────────
  async function toggleActive(row: ReceiverEmail) {
    setSaving(row.id)
    setError(null)
    const next = !row.active
    const { error } = await supabase
      .from("client_receiver_emails")
      .update({ active: next })
      .eq("id", row.id)
    if (error) { setError(error.message) }
    else { setEmails(prev => prev.map(e => e.id === row.id ? { ...e, active: next } : e)) }
    setSaving(null)
  }

  // ── Delete ────────────────────────────────────────────────
  async function deleteEmail(id: string) {
    setSaving(id)
    setError(null)
    const { error } = await supabase
      .from("client_receiver_emails")
      .delete()
      .eq("id", id)
    if (error) { setError(error.message) }
    else { setEmails(prev => prev.filter(e => e.id !== id)) }
    setSaving(null)
  }

  // ── Add new ───────────────────────────────────────────────
  async function addEmail() {
    if (!newMail.trim()) return
    setAdding(true)
    setError(null)
    const { data, error } = await supabase
      .from("client_receiver_emails")
      .insert({ client_code: clientCode, r_mail: newMail.trim(), label: newLabel.trim() || null, active: true })
      .select("id, r_mail, active, label")
      .single()
    if (error) { setError(error.message) }
    else { setEmails(prev => [...prev, data]); setNewMail(""); setNewLabel("") }
    setAdding(false)
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-white mb-1">Settings</h1>
      <p className="text-sm text-[#475569] mb-8">Manage your organisation's configuration</p>

      {/* ── Receiver Emails ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="h-4 w-4 text-[#F97316]" />
          <h2 className="text-sm font-semibold text-[#E2E8F0] uppercase tracking-wider">
            Receiver Emails
          </h2>
        </div>
        <p className="text-xs text-[#475569] mb-4">
          Inbound addresses n8n monitors for this client. Only <span className="text-green-400 font-medium">active</span> addresses
          are processed. Deactivating an address stops new requests from that mailbox without deleting history.
        </p>

        {error && (
          <p className="mb-3 rounded bg-red-900/30 px-3 py-2 text-xs text-red-400">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-[#475569] text-sm py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="rounded-lg border border-white/5 bg-[#0D1B2A] divide-y divide-white/5">
            {emails.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-[#475569]">No receiver emails configured.</p>
            )}

            {emails.map(row => (
              <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                {/* Status dot */}
                <span className={`h-2 w-2 rounded-full shrink-0 ${row.active ? "bg-green-400" : "bg-[#475569]"}`} />

                {/* Email + label */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#E2E8F0] truncate">{row.r_mail}</p>
                  {row.label && <p className="text-xs text-[#475569]">{row.label}</p>}
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggleActive(row)}
                  disabled={saving === row.id}
                  title={row.active ? "Deactivate" : "Activate"}
                  className="flex items-center gap-1 text-xs text-[#475569] hover:text-[#94A3B8] transition-colors disabled:opacity-40"
                >
                  {saving === row.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : row.active
                      ? <ToggleRight className="h-5 w-5 text-green-400" />
                      : <ToggleLeft  className="h-5 w-5" />
                  }
                  <span className="hidden sm:inline">{row.active ? "Active" : "Inactive"}</span>
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteEmail(row.id)}
                  disabled={saving === row.id}
                  title="Remove"
                  className="flex h-7 w-7 items-center justify-center rounded text-[#475569] hover:bg-red-900/30 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {/* Add row */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#0a1628]">
              <Plus className="h-4 w-4 text-[#475569] shrink-0" />
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
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addEmail()}
                className="w-28 bg-transparent text-sm text-[#E2E8F0] placeholder:text-[#334155] outline-none"
              />
              <button
                onClick={addEmail}
                disabled={adding || !newMail.trim()}
                className="flex items-center gap-1 rounded bg-[#F97316] px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-[#ea6a05]"
              >
                {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
