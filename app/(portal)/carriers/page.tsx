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
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setList((l) => l.filter((c) => c.carrier_id !== carrier.carrier_id))
      setConfirmDelete(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-[#0D1B2A] dark:text-white">Carriers</h2>
          {!loading && (
            <span className="rounded-full bg-[#F0F4F8] px-2.5 py-1 text-xs font-medium text-[#64748B] dark:bg-[#1E3A5F] dark:text-[#94A3B8]">
              {list.length} carriers
            </span>
          )}
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true) }}
          className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] hover:bg-[#EA580C]"
        >
          <Plus className="h-4 w-4" /> Add Carrier
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>
      )}

      <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-[#1E3A5F] dark:bg-[#111E33]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#F0F4F8] text-xs uppercase tracking-wide text-[#64748B] dark:bg-[#0D1B2A] dark:text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Carrier Name</th>
                  <th className="px-4 py-3 font-semibold">Contact Person</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Phone / WhatsApp</th>
                  <th className="px-4 py-3 font-semibold">Modes</th>
                  <th className="px-4 py-3 font-semibold">Language</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c, i) => (
                  <tr
                    key={c.carrier_id}
                    className={`border-t border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC] dark:border-[#1E3A5F] dark:hover:bg-[#1E3A5F]/30 ${
                      i % 2 === 1 ? "bg-[#F8FAFC] dark:bg-[#0D1B2A]/40" : "bg-white dark:bg-transparent"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-semibold text-[#0D1B2A] dark:text-white">{c.carrier_name}</span>
                        {c.cc_emails.length > 0 && (
                          <p className="mt-0.5 text-xs text-[#94A3B8]">+{c.cc_emails.length} CC</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[#0F172A] dark:text-[#E2E8F0]">{c.person_name}</p>
                      {c.role && <p className="text-xs text-[#64748B]">{c.role}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <CopyCell value={c.email} href={`mailto:${c.email}`} />
                    </td>
                    <td className="px-4 py-3">
                      <CopyCell value={c.number} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {modesFromCarrier(c).map((m) => (
                          <ModeBadge key={m} mode={m} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#0F172A] dark:text-[#E2E8F0]">{langLabel(c.lang)}</td>
                    <td className="px-4 py-3">
                      <button
                        role="switch"
                        aria-checked={c.active}
                        aria-label={`Toggle ${c.carrier_name}`}
                        onClick={() => toggleActive(c)}
                        className={`relative h-6 w-11 overflow-hidden rounded-full transition-colors ${c.active ? "bg-[#059669]" : "bg-[#CBD5E1]"}`}
                      >
                        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${c.active ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          aria-label="Edit"
                          onClick={() => { setEditing(c); setModalOpen(true) }}
                          className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-[#FFF7ED] hover:text-[#F97316] dark:hover:bg-[#F97316]/10"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Delete"
                          onClick={() => setConfirmDelete(c)}
                          className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && list.length === 0 && !error && (
          <div className="py-16 text-center text-sm text-[#64748B]">
            No carriers added yet. Add your first carrier to get started.
          </div>
        )}
      </div>

      {modalOpen && (
        <CarrierModal
          carrier={editing}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl duration-200 animate-in fade-in zoom-in-95 dark:bg-[#111E33]">
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Delete carrier?</h3>
            <p className="mt-2 text-sm text-[#64748B]">
              Are you sure you want to delete{" "}
              <span className="font-medium text-[#0F172A] dark:text-[#E2E8F0]">{confirmDelete.carrier_name}</span>?
              This also removes all CC entries and cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleteLoading}
                className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:border-[#F97316]/40 disabled:opacity-50 dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0]"
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
  if (!value) return <span className="text-[#94A3B8]">—</span>
  return (
    <div className="flex items-center gap-2">
      {href ? (
        <a href={href} className="truncate text-[#0F172A] hover:text-[#F97316] hover:underline dark:text-[#E2E8F0]">
          {value}
        </a>
      ) : (
        <span className="truncate text-[#0F172A] dark:text-[#E2E8F0]">{value}</span>
      )}
      <button
        aria-label="Copy"
        onClick={() => {
          navigator.clipboard?.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="text-[#94A3B8] transition-colors hover:text-[#F97316]"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
