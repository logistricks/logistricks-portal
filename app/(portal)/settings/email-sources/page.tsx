"use client"

import { useEffect, useState } from "react"
import { Mail, Plus, Trash2, Save, ChevronLeft, Eye, EyeOff, Info } from "lucide-react"
import Link from "next/link"

type Provider = "imap" | "microsoft365"

interface EmailSource {
  id: string
  name: string
  provider: Provider
  active: boolean
  // IMAP
  imap_host?: string
  imap_port?: number
  imap_username?: string
  imap_tls?: boolean
  // MS365
  ms_email?: string
  ms_tenant_id?: string
  ms_client_id?: string
}

interface FormState {
  id?: string
  name: string
  provider: Provider
  active: boolean
  // IMAP
  imap_host: string
  imap_port: number
  imap_username: string
  imap_password: string
  imap_tls: boolean
  // MS365
  ms_tenant_id: string
  ms_client_id: string
  ms_client_secret: string
  ms_email: string
}

const EMPTY_FORM: FormState = {
  name: "",
  provider: "imap",
  active: true,
  imap_host: "",
  imap_port: 993,
  imap_username: "",
  imap_password: "",
  imap_tls: true,
  ms_tenant_id: "",
  ms_client_id: "",
  ms_client_secret: "",
  ms_email: "",
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{children}</label>
}

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] placeholder-[#CBD5E1] focus:border-[var(--brand-accent)] focus:outline-none dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-white dark:placeholder-[#334155] ${className}`}
    />
  )
}

export default function EmailSourcesPage() {
  const [sources, setSources] = useState<EmailSource[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/email-sources")
      if (res.ok) setSources(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openNew() { setForm({ ...EMPTY_FORM }); setError("") }
  function openEdit(s: EmailSource) {
    setForm({
      id: s.id,
      name: s.name,
      provider: s.provider,
      active: s.active,
      imap_host: s.imap_host ?? "",
      imap_port: s.imap_port ?? 993,
      imap_username: s.imap_username ?? "",
      imap_password: "",
      imap_tls: s.imap_tls ?? true,
      ms_tenant_id: s.ms_tenant_id ?? "",
      ms_client_id: s.ms_client_id ?? "",
      ms_client_secret: "",
      ms_email: s.ms_email ?? "",
    })
    setError("")
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => f ? { ...f, [k]: v } : f)
  }

  async function save() {
    if (!form) return
    setBusy(true); setError("")
    try {
      const payload: Record<string, unknown> = { ...form }
      // Don't send empty secrets/passwords — keep existing in DB
      if (!payload.imap_password) delete payload.imap_password
      if (!payload.ms_client_secret) delete payload.ms_client_secret

      const method = form.id ? "PUT" : "POST"
      const res = await fetch("/api/settings/email-sources", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error || `Server error ${res.status}`)
      }
      setForm(null)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this email source?")) return
    await fetch("/api/settings/email-sources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    setSources((s) => s.filter((x) => x.id !== id))
  }

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <Link
        href="/settings"
        className="mb-5 flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--brand-accent)]"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Settings
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-accent)]/10">
            <Mail className="h-5 w-5 text-[var(--brand-accent)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0F172A] dark:text-white">Email Sources</h2>
            <p className="text-xs text-[var(--text-muted)]">Mailboxes to monitor for incoming requests</p>
          </div>
        </div>
        {!form && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-lg bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#EA6E0D]"
          >
            <Plus className="h-4 w-4" />
            Add Source
          </button>
        )}
      </div>

      {/* Source list */}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : sources.length === 0 && !form ? (
        <div className="rounded-xl border-2 border-dashed border-[#E2E8F0] px-6 py-12 text-center dark:border-[#1E3A5F]">
          <Mail className="mx-auto mb-3 h-8 w-8 text-[#CBD5E1]" />
          <p className="text-sm font-medium text-[var(--text-muted)]">No email sources yet</p>
          <p className="mt-1 text-xs text-[#CBD5E1]">Add a mailbox to forward requests into Logistricks</p>
          <button
            type="button"
            onClick={openNew}
            className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-white mx-auto hover:bg-[#EA6E0D]"
          >
            <Plus className="h-4 w-4" />
            Add Source
          </button>
        </div>
      ) : (
        <ul className="mb-6 space-y-3">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 dark:border-[#1E3A5F] dark:bg-[#0D1B2A]"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  s.provider === "microsoft365" ? "bg-[#0078D4]/10" : "bg-[#22C55E]/10"
                }`}>
                  <Mail className={`h-4 w-4 ${s.provider === "microsoft365" ? "text-[#0078D4]" : "text-[#22C55E]"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#0F172A] dark:text-white">{s.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {s.provider === "microsoft365"
                      ? `Microsoft 365 · ${s.ms_email || "—"}`
                      : `IMAP · ${s.imap_host || "—"}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  s.active
                    ? "bg-[#DCFCE7] text-[#15803D] dark:bg-[#15803D]/20 dark:text-[#4ADE80]"
                    : "bg-[#F1F5F9] text-[#64748B] dark:bg-[#1E3A5F]"
                }`}>
                  {s.active ? "Active" : "Inactive"}
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="rounded px-2.5 py-1 text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC] dark:hover:bg-[#1E3A5F]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Form */}
      {form && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#1E3A5F] dark:bg-[#0D1B2A]">
          <h3 className="mb-4 text-sm font-semibold text-[#0F172A] dark:text-white">
            {form.id ? "Edit Email Source" : "New Email Source"}
          </h3>

          {/* Name */}
          <div className="mb-4">
            <Label>Display Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Ops Mailbox"
            />
          </div>

          {/* Provider tabs */}
          <div className="mb-4">
            <Label>Provider</Label>
            <div className="flex rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1 dark:border-[#1E3A5F] dark:bg-[#0A1628]">
              {(["imap", "microsoft365"] as Provider[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set("provider", p)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    form.provider === p
                      ? "bg-white text-[#0F172A] shadow-sm dark:bg-[#1E3A5F] dark:text-white"
                      : "text-[var(--text-muted)] hover:text-[#64748B]"
                  }`}
                >
                  {p === "imap" ? "Generic IMAP" : "Microsoft 365"}
                </button>
              ))}
            </div>
          </div>

          {/* IMAP fields */}
          {form.provider === "imap" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label>IMAP Host</Label>
                  <Input
                    value={form.imap_host}
                    onChange={(e) => set("imap_host", e.target.value)}
                    placeholder="secure.emailsrvr.com"
                  />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={form.imap_port}
                    onChange={(e) => set("imap_port", parseInt(e.target.value) || 993)}
                    placeholder="993"
                  />
                </div>
              </div>
              <div>
                <Label>Username / Email</Label>
                <Input
                  type="email"
                  value={form.imap_username}
                  onChange={(e) => set("imap_username", e.target.value)}
                  placeholder="ops@yourdomain.com"
                />
              </div>
              <div>
                <Label>Password {form.id && "(leave blank to keep existing)"}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.imap_password}
                    onChange={(e) => set("imap_password", e.target.value)}
                    placeholder={form.id ? "••••••••" : "IMAP password"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.imap_tls}
                  onChange={(e) => set("imap_tls", e.target.checked)}
                  className="h-4 w-4 rounded border-[#E2E8F0] accent-[#F97316]"
                />
                <span className="text-xs text-[var(--text-secondary)]">Use TLS/SSL (recommended)</span>
              </label>
            </div>
          )}

          {/* Microsoft 365 fields */}
          {form.provider === "microsoft365" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-[#EFF6FF] p-3 dark:bg-[#172040]">
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-[#0078D4]" />
                <div className="text-xs text-[#1E40AF] dark:text-[#93C5FD]">
                  <p className="font-semibold mb-1">Azure App Registration required</p>
                  <p>In Azure Portal → App registrations → New registration → API permissions: add <strong>Mail.Read</strong> (Application). Generate a client secret and paste the values below.</p>
                </div>
              </div>
              <div>
                <Label>Mailbox Email Address</Label>
                <Input
                  type="email"
                  value={form.ms_email}
                  onChange={(e) => set("ms_email", e.target.value)}
                  placeholder="ops@yourtenant.onmicrosoft.com"
                />
              </div>
              <div>
                <Label>Tenant ID</Label>
                <Input
                  value={form.ms_tenant_id}
                  onChange={(e) => set("ms_tenant_id", e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div>
                <Label>Client ID (Application ID)</Label>
                <Input
                  value={form.ms_client_id}
                  onChange={(e) => set("ms_client_id", e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div>
                <Label>Client Secret {form.id && "(leave blank to keep existing)"}</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={form.ms_client_secret}
                    onChange={(e) => set("ms_client_secret", e.target.value)}
                    placeholder={form.id ? "••••••••" : "Paste secret value here"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active toggle */}
          <label className="mt-4 flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
              className="h-4 w-4 rounded border-[#E2E8F0] accent-[#F97316]"
            />
            <span className="text-xs text-[var(--text-secondary)]">Active (this mailbox will be monitored)</span>
          </label>

          {error && <p className="mt-3 text-xs text-[#EF4444]">{error}</p>}

          {/* Actions */}
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] dark:border-[#1E3A5F] dark:hover:bg-[#1E3A5F]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#EA6E0D] disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
