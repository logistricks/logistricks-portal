"use client"

import { useEffect, useState } from "react"
import {
  Check,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "admin" | "operator" | "viewer"

type User = {
  id: string
  username: string
  display_name: string
  auth_email: string
  role: Role
  is_active: boolean
  allowed_carriers: string[]
  allowed_modes: string[]
  created_at: string
}

type Modal =
  | { kind: "add" }
  | { kind: "edit"; user: User }
  | { kind: "confirmDeactivate"; user: User }

const MODES = ["Sea", "Air", "Land"] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

const ROLE_META: Record<Role, { label: string; Icon: React.ElementType; color: string; bg: string; desc: string }> = {
  admin:    { label: "Admin",    Icon: ShieldCheck, color: "text-[var(--brand-accent)]",  bg: "bg-[var(--brand-accent,#E8821A)]/15",  desc: "Full access — users, all requests, all carriers" },
  operator: { label: "Operator", Icon: Shield,      color: "text-[#3B82F6]",  bg: "bg-[#3B82F6]/15",  desc: "Submit requests, update status, view carriers/templates" },
  viewer:   { label: "Viewer",   Icon: Eye,         color: "text-[#8B5CF6]",  bg: "bg-[#8B5CF6]/15",  desc: "Read-only access to assigned carrier requests" },
}

function RoleBadge({ role }: { role: Role }) {
  const m = ROLE_META[role]
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${m.bg} ${m.color}`}>
      <m.Icon className="h-3 w-3" />
      {m.label}
    </span>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F97316] disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-[var(--brand-accent,#E8821A)]" : "bg-[var(--toggle-off)]"
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
    </button>
  )
}

// ── User Form Modal ───────────────────────────────────────────────────────────

function UserFormModal({
  mode,
  user,
  currentUsername,
  carrierOptions,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit"
  user?: User
  currentUsername: string
  carrierOptions: { carrier_id: number; carrier_name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [username, setUsername]           = useState(user?.username ?? "")
  const [displayName, setDisplayName]     = useState(user?.display_name ?? "")
  const [authEmail, setAuthEmail]         = useState(user?.auth_email ?? "")
  const [role, setRole]                   = useState<Role>(user?.role ?? "operator")
  const [password, setPassword]           = useState("")
  const [allowedCarriers, setAllowedCarriers] = useState<string[]>(
    (user?.allowed_carriers ?? []).map(String)
  )
  const [allowedModes, setAllowedModes]   = useState<string[]>(user?.allowed_modes ?? [])
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState("")

  const isSelf       = user?.username === currentUsername
  const needsRestrictions = role === "operator" || role === "viewer"

  function toggleCarrier(id: string) {
    setAllowedCarriers(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  function toggleMode(m: string) {
    setAllowedModes(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)
    try {
      if (mode === "add") {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username, display_name: displayName, auth_email: authEmail,
            role, password,
            allowed_carriers: needsRestrictions ? allowedCarriers : [],
            allowed_modes:    needsRestrictions ? allowedModes    : [],
          }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return }
      } else {
        const body: Record<string, unknown> = {
          username: user!.username, display_name: displayName, auth_email: authEmail, role,
          allowed_carriers: needsRestrictions ? allowedCarriers : [],
          allowed_modes:    needsRestrictions ? allowedModes    : [],
        }
        if (password) body.password = password
        const res = await fetch("/api/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return }
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="portal-page fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-[var(--modal-bg)] shadow-2xl border border-[var(--border)] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 sticky top-0 bg-[var(--modal-bg)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {mode === "add" ? "Add User" : "Edit User"}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Username — add only */}
          {mode === "add" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Username <span className="text-red-400">*</span></label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15))}
                required
                placeholder="e.g. john_doe"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/50"
              />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">Lowercase letters, numbers, underscores — max 15 chars</p>
            </div>
          )}

          {/* Display Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Display Name</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Full name or nickname"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/50"
            />
          </div>

          {/* Email */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Email (optional)</label>
            <input
              value={authEmail}
              onChange={e => setAuthEmail(e.target.value)}
              type="email"
              placeholder="user@example.com"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/50"
            />
          </div>

          {/* Role */}
          <div>
            <label className="mb-2 block text-xs font-medium text-[var(--text-muted)]">Role</label>
            <div className="grid grid-cols-3 gap-2">
              {(["admin", "operator", "viewer"] as Role[]).map(r => {
                const m = ROLE_META[r]
                const disabled = isSelf && r !== user?.role
                return (
                  <label
                    key={r}
                    className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors ${
                      role === r ? `border-current ${m.color} ${m.bg}` : "border-[var(--border)] hover:bg-[var(--hover-bg)]"
                    } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <input type="radio" name="role" value={r} checked={role === r}
                      onChange={() => !disabled && setRole(r)} disabled={disabled} className="hidden" />
                    <div className="flex items-center gap-1.5">
                      <m.Icon className={`h-3.5 w-3.5 ${role === r ? m.color : "text-[var(--text-muted)]"}`} />
                      <span className={`text-xs font-semibold ${role === r ? m.color : "text-[var(--text-primary)]"}`}>{m.label}</span>
                    </div>
                    <p className="text-[10px] leading-tight text-[var(--text-muted)]">{m.desc}</p>
                  </label>
                )
              })}
            </div>
            {isSelf && <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">You cannot change your own role.</p>}
          </div>

          {/* Allowed carriers — operator / viewer only */}
          {needsRestrictions && carrierOptions.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                Allowed Carriers
                <span className="ml-1 text-[11px] font-normal text-[var(--text-muted)]">(empty = all carriers)</span>
              </label>
              <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
                {carrierOptions.map(c => {
                  const id = String(c.carrier_id)
                  const checked = allowedCarriers.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleCarrier(id)}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        checked
                          ? "bg-[var(--brand-accent,#E8821A)] text-white"
                          : "bg-[var(--hover-bg)] text-[var(--text-muted)] hover:bg-[var(--border)]"
                      }`}
                    >
                      {checked && <Check className="mr-1 inline h-3 w-3" />}
                      {c.carrier_name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Allowed modes — operator / viewer only */}
          {needsRestrictions && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                Allowed Modes
                <span className="ml-1 text-[11px] font-normal text-[var(--text-muted)]">(empty = all modes)</span>
              </label>
              <div className="flex gap-2">
                {MODES.map(m => {
                  const checked = allowedModes.includes(m)
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMode(m)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                        checked
                          ? "border-[var(--brand-accent)] bg-[var(--brand-accent,#E8821A)]/10 text-[var(--brand-accent)]"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover-bg)]"
                      }`}
                    >
                      {checked && <Check className="mr-1 inline h-3 w-3" />}
                      {m}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Password */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              {mode === "add" ? <>Password <span className="text-red-400">*</span></> : "New Password (leave blank to keep current)"}
            </label>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              required={mode === "add"}
              placeholder={mode === "add" ? "Min 6 characters" : "Leave blank to keep current"}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/50"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--hover-bg)]">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-accent,#E8821A)] px-4 py-2 text-sm font-semibold text-white hover:bg-[#EA6C0A] disabled:opacity-60">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === "add" ? "Create User" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Confirm Deactivate Modal ──────────────────────────────────────────────────

function ConfirmDeactivateModal({
  user,
  onClose,
  onConfirm,
  loading,
}: {
  user: User
  onClose: () => void
  onConfirm: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-[var(--modal-bg)] shadow-2xl border border-[var(--border)] p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
            <UserMinus className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-[var(--text-primary)]">Deactivate user?</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              <span className="font-medium text-[var(--text-primary)]">{user.display_name || user.username}</span> will lose access immediately. You can reactivate them at any time using the toggle.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--hover-bg)]">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Deactivate
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [list, setList]             = useState<User[]>([])
  const [carriers, setCarriers]     = useState<{ carrier_id: number; carrier_name: string }[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState("")
  const [modal, setModal]           = useState<Modal | null>(null)
  const [deactivateLoading, setDeactivateLoading] = useState(false)
  const [toastMsg, setToastMsg]     = useState("")
  const [currentUsername, setCurrentUsername] = useState("")

  useEffect(() => {
    try { setCurrentUsername(sessionStorage.getItem("portal_username") ?? "") } catch { /* */ }
  }, [])

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(""), 3000)
  }

  async function load() {
    setLoading(true)
    setError("")
    try {
      const [usersRes, carriersRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/carriers"),
      ])
      if (!usersRes.ok) throw new Error(`Failed to load users (${usersRes.status})`)
      const usersData    = await usersRes.json()
      const carriersData = carriersRes.ok ? await carriersRes.json() : []
      setList(usersData)
      // Filter out CC rows for the carrier picker
      setCarriers(
        (carriersData as { carrier_id: number; carrier_name: string; is_cc: boolean }[])
          .filter(c => !c.is_cc)
          .map(c => ({ carrier_id: c.carrier_id, carrier_name: c.carrier_name }))
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleToggleActive(user: User) {
    const newActive = !user.is_active
    if (!newActive && user.username === currentUsername) {
      setError("You cannot deactivate your own account.")
      return
    }
    setList(l => l.map(u => u.username === user.username ? { ...u, is_active: newActive } : u))
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user.username, is_active: newActive }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? `Error ${res.status}`)
      setList(l => l.map(u => u.username === user.username ? { ...u, is_active: user.is_active } : u))
    }
  }

  async function executeDeactivate(user: User) {
    setDeactivateLoading(true)
    try {
      const res = await fetch(`/api/users?username=${encodeURIComponent(user.username)}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? `Deactivation failed (${res.status})`); return }
      setList(l => l.map(u => u.username === user.username ? { ...u, is_active: false } : u))
      setModal(null)
      showToast(`${user.display_name || user.username} deactivated.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeactivateLoading(false)
    }
  }

  function onSaved() {
    setModal(null)
    load()
    showToast(modal?.kind === "add" ? "User created." : "Changes saved.")
  }

  const activeCount   = list.filter(u => u.is_active).length
  const inactiveCount = list.length - activeCount

  return (
    <>
      <style>{`
        :root {
          --text-primary: #1E293B; --text-muted: #64748B;
          --border: #E2E8F0; --hover-bg: rgba(232,130,26,0.05);
          --modal-bg: #FFFFFF; --input-bg: #FFFFFF;
          --card-bg: #FFFFFF; --page-bg: #f0f2f5;
          --toggle-off: #CBD5E1;
        }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) {
            --text-primary: #E2E8F0; --text-muted: #94A3B8;
            --border: #1E3A5F; --hover-bg: #1E3A5F;
            --modal-bg: #0F2033; --input-bg: #0D1B2A;
            --card-bg: #111e33; --page-bg: #0c1424;
            --toggle-off: #334155;
          }
        }
        :root[data-theme="dark"] {
          --text-primary: #E2E8F0; --text-muted: #94A3B8;
          --border: #1E3A5F; --hover-bg: #1E3A5F;
          --modal-bg: #0F2033; --input-bg: #0D1B2A;
          --card-bg: #0F2033; --page-bg: #0c1424;
          --toggle-off: #334155;
        }
      `}</style>

      <div className="min-h-full bg-[var(--page-bg)] p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-accent,#E8821A)]/10">
              <Users className="h-5 w-5 text-[var(--brand-accent)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Users</h1>
              <p className="text-sm text-[var(--text-muted)]">Manage who has access to this portal</p>
            </div>
          </div>
          <button
            onClick={() => setModal({ kind: "add" })}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-accent,#E8821A)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#EA6C0A] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--brand-accent)]" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-20 text-center">
            <Users className="mb-3 h-10 w-10 text-[var(--text-muted)]" />
            <p className="text-sm font-medium text-[var(--text-primary)]">No users yet</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Add your first user to get started.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)] shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">User</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Role</th>
                  <th className="hidden px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] lg:table-cell">Restrictions</th>
                  <th className="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Active</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {list.map(user => {
                  const isSelf = user.username === currentUsername
                  const hasCarrierRestriction = user.allowed_carriers.length > 0
                  const hasModeRestriction    = user.allowed_modes.length > 0
                  return (
                    <tr
                      key={user.username}
                      className={`transition-colors hover:bg-[var(--hover-bg)] ${!user.is_active ? "opacity-50" : ""}`}
                    >
                      {/* Avatar + name */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ROLE_META[user.role].bg} ${ROLE_META[user.role].color}`}>
                            {initials(user.display_name || user.username)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[var(--text-primary)]">
                              {user.display_name || user.username}
                              {isSelf && (
                                <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-[var(--brand-accent,#E8821A)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-accent)]">
                                  <UserCheck className="h-2.5 w-2.5" />
                                  You
                                </span>
                              )}
                              {!user.is_active && (
                                <span className="ml-2 inline-flex items-center rounded bg-[var(--hover-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                                  Inactive
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-[var(--text-muted)]">@{user.username}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4">
                        <RoleBadge role={user.role} />
                      </td>

                      {/* Restrictions */}
                      <td className="hidden px-5 py-4 lg:table-cell">
                        {user.role === "admin" ? (
                          <span className="text-xs text-[var(--text-muted)]">All access</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {!hasCarrierRestriction && !hasModeRestriction ? (
                              <span className="text-xs text-[var(--text-muted)]">No restrictions</span>
                            ) : (
                              <>
                                {hasCarrierRestriction && user.allowed_carriers.map(cid => {
                                  const c = carriers.find(x => String(x.carrier_id) === String(cid))
                                  return c ? (
                                    <span key={cid} className="rounded bg-[var(--hover-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                                      {c.carrier_name}
                                    </span>
                                  ) : null
                                })}
                                {hasModeRestriction && user.allowed_modes.map(m => (
                                  <span key={m} className="rounded bg-[var(--brand-accent,#E8821A)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-accent)]">
                                    {m}
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Active toggle */}
                      <td className="px-5 py-4 text-center">
                        <Toggle
                          checked={user.is_active}
                          onChange={() => handleToggleActive(user)}
                          disabled={isSelf}
                        />
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setModal({ kind: "edit", user })}
                            title="Edit user"
                            className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {!isSelf && user.is_active && (
                            <button
                              onClick={() => setModal({ kind: "confirmDeactivate", user })}
                              title="Deactivate user"
                              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-amber-500/10 hover:text-amber-400 transition-colors"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Footer */}
            <div className="border-t border-[var(--border)] px-5 py-3 flex items-center gap-4">
              <p className="text-xs text-[var(--text-muted)]">
                {activeCount} active · {inactiveCount} inactive
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal?.kind === "add" && (
        <UserFormModal mode="add" currentUsername={currentUsername} carrierOptions={carriers}
          onClose={() => setModal(null)} onSaved={onSaved} />
      )}
      {modal?.kind === "edit" && (
        <UserFormModal mode="edit" user={modal.user} currentUsername={currentUsername} carrierOptions={carriers}
          onClose={() => setModal(null)} onSaved={onSaved} />
      )}
      {modal?.kind === "confirmDeactivate" && (
        <ConfirmDeactivateModal
          user={modal.user}
          loading={deactivateLoading}
          onClose={() => setModal(null)}
          onConfirm={() => executeDeactivate(modal.user)}
        />
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-lg bg-[#0D1B2A] px-4 py-2.5 text-sm font-medium text-white shadow-xl">
          <Check className="h-4 w-4 text-green-400" />
          {toastMsg}
        </div>
      )}
    </>
  )
}
