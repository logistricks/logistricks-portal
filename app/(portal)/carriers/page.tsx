"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { ModeBadge } from "@/components/portal/badges"
import { CarrierModal } from "@/components/portal/carrier-modal"
import { type Carrier, langLabel, modesFromCarrier } from "@/lib/portal-data"

interface CarrierRow {
  id: number
  carrier_id: number
  carrier_name: string
  person_name: string
  role: string
  email: string
  number: string
  is_sea: boolean
  is_air: boolean
  is_land: boolean
  lang: number
  routes: string
  is_cc: boolean
  active: boolean
}

const CARRIER_COLORS = ["#0f1e36", "#1a3352", "#003087", "#7c3aed", "#16a34a", "#d97706", "#2563eb", "#be185d"]

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function carrierColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return CARRIER_COLORS[hash % CARRIER_COLORS.length]
}

function groupCarrierRows(rows: CarrierRow[]): Carrier[] {
  const map = new Map<number, Carrier>()
  for (const row of rows) {
    if (!row.is_cc) {
      map.set(row.carrier_id, {
        row_id: row.id,
        carrier_id: row.carrier_id,
        carrier_name: row.carrier_name,
        person_name: row.person_name,
        role: row.role,
        email: row.email,
        number: row.number,
        is_sea: row.is_sea,
        is_air: row.is_air,
        is_land: row.is_land,
        lang: row.lang,
        routes: row.routes,
        active: row.active,
        cc_emails: [],
      })
    }
  }
  for (const row of rows) {
    if (row.is_cc && row.email) {
      const carrier = map.get(row.carrier_id)
      if (carrier) carrier.cc_emails.push(row.email)
    }
  }
  return Array.from(map.values())
}

export default function CarriersPage() {
  const [list, setList]               = useState<Carrier[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [editing, setEditing]         = useState<Carrier | null>(null)
  const [modalOpen, setModalOpen]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Carrier | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [inUseCarrier, setInUseCarrier]   = useState<Carrier | null>(null)

  async function loadCarriers() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/carriers")
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const rows: CarrierRow[] = await res.json()
      setList(groupCarrierRows(rows))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCarriers() }, [])

  async function handleSave() {
    await loadCarriers()
    setModalOpen(false)
    setEditing(null)
  }

  async function toggleActive(carrier: Carrier) {
    const next = !carrier.active
    setList((l) => l.map((c) => c.carrier_id === carrier.carrier_id ? { ...c, active: next } : c))
    try {
      const res = await fetch("/api/carriers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier_id: carrier.carrier_id, active: next }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) {
      setError((e as Error).message)
      setList((l) => l.map((c) => c.carrier_id === carrier.carrier_id ? { ...c, active: carrier.active } : c))
    }
  }

  async function handleDelete(carrier: Carrier) {
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/carriers?carrier_id=${carrier.carrier_id}`, { method: "DELETE" })
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}))
        setConfirmDelete(null)
        setInUseCarrier({ ...carrier, carrier_name: body.name ?? carrier.carrier_name })
        return
      }
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setList((l) => l.filter((c) => c.carrier_id !== carrier.carrier_id))
      setConfirmDelete(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleDeactivateCarrier(carrier: Carrier) {
    setInUseCarrier(null)
    setList((l) => l.map((c) => c.carrier_id === carrier.carrier_id ? { ...c, active: false } : c))
    try {
      const res = await fetch("/api/carriers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier_id: carrier.carrier_id, active: false }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) {
      setError((e as Error).message)
      setList((l) => l.map((c) => c.carrier_id === carrier.carrier_id ? { ...c, active: carrier.active } : c))
    }
  }

  return (
    <div className="portal-page space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold" style={{color:"var(--text-primary)"}}>Carriers</h2>
          {!loading && (
            <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{background:"var(--table-header-bg)",color:"var(--text-secondary)"}}>
              {list.length} carriers
            </span>
          )}
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true) }}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01]" style={{background:"var(--brand-accent)"}}
        >
          <Plus className="h-4 w-4" /> Add Carrier
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <div className="ds-card flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-accent)]" />
        </div>
      ) : list.length === 0 && !error ? (
        <div className="ds-card py-16 text-center text-sm text-[var(--text-muted)]">
          No carriers added yet. Add your first carrier to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <div key={c.carrier_id} className="ds-card p-5">
              <div className="mb-4 flex items-start justify-between">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold text-white"
                  style={{ background: carrierColor(c.carrier_name) }}
                >
                  {initialsFor(c.carrier_name)}
                </div>
                <button
                  role="switch"
                  aria-checked={c.active}
                  aria-label={`Toggle ${c.carrier_name}`}
                  onClick={() => toggleActive(c)}
                  className={`relative h-6 w-11 overflow-hidden rounded-full transition-colors ${c.active ? "bg-[#059669]" : "bg-[#CBD5E1]"}`}
                >
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${c.active ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>

              <p className="mb-0.5 text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{c.carrier_name}</p>
              <p className="mb-3.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                {modesFromCarrier(c).join(" & ")} · {langLabel(c.lang)}
              </p>

              <div className="mb-3.5 grid grid-cols-2 gap-2.5">
                <div className="rounded-[7px] px-3 py-2.5" style={{ background: "var(--table-header-bg)" }}>
                  <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Contact</p>
                  <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{c.person_name || "—"}</p>
                  {c.role && <p className="truncate text-[11px]" style={{ color: "var(--text-secondary)" }}>{c.role}</p>}
                </div>
                <div className="rounded-[7px] px-3 py-2.5" style={{ background: "var(--table-header-bg)" }}>
                  <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Phone / WhatsApp</p>
                  <CopyCell value={c.number} />
                </div>
              </div>

              <div className="mb-3.5 rounded-[7px] px-3 py-2.5" style={{ background: "var(--table-header-bg)" }}>
                <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Email {c.cc_emails.length > 0 && `(+${c.cc_emails.length} CC)`}</p>
                <CopyCell value={c.email} href={`mailto:${c.email}`} />
              </div>

              <div className="flex items-center justify-between border-t pt-3.5" style={{ borderColor: "var(--divider)" }}>
                <div className="flex flex-wrap gap-1">
                  {modesFromCarrier(c).map((m) => (
                    <ModeBadge key={m} mode={m} />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="Edit"
                    onClick={() => { setEditing(c); setModalOpen(true) }}
                    className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-accent)]/10 hover:text-[var(--brand-accent)]"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Delete"
                    onClick={() => setConfirmDelete(c)}
                    className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <CarrierModal
          carrier={editing}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}

      {inUseCarrier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl duration-200 animate-in fade-in zoom-in-95 dark:bg-[#111E33]">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Cannot delete carrier</h3>
            <p className="mt-2 text-sm text-[#64748B]">
              <span className="font-medium text-[var(--text-primary)]">{inUseCarrier.carrier_name}</span>{" "}
              has been used in one or more requests and cannot be deleted. You can deactivate it instead to hide it from future use.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setInUseCarrier(null)}
                className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:border-[var(--brand-accent)]/40 dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeactivateCarrier(inUseCarrier)}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-accent-hover)]"
              >
                Deactivate Instead
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl duration-200 animate-in fade-in zoom-in-95 dark:bg-[#111E33]">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Delete carrier?</h3>
            <p className="mt-2 text-sm text-[#64748B]">
              Are you sure you want to delete{" "}
              <span className="font-medium text-[var(--text-primary)]">{confirmDelete.carrier_name}</span>?
              This also removes all CC entries and cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleteLoading}
                className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:border-[var(--brand-accent)]/40 disabled:opacity-50 dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleteLoading}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CopyCell({ value, href }: { value: string; href?: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="text-[var(--text-muted)]">—</span>
  return (
    <div className="flex items-center gap-2">
      {href ? (
        <a href={href} className="truncate text-[#0F172A] hover:text-[var(--brand-accent)] hover:underline dark:text-[#E2E8F0]">
          {value}
        </a>
      ) : (
        <span className="truncate text-[var(--text-primary)]">{value}</span>
      )}
      <button
        aria-label="Copy"
        onClick={() => {
          navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="text-[var(--text-muted)] transition-colors hover:text-[var(--brand-accent)]"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
