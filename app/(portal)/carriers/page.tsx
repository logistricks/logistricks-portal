"use client"

import { useState } from "react"
import { Check, Copy, Pencil, Plus, Trash2 } from "lucide-react"
import { ModeBadge } from "@/components/portal/badges"
import { CarrierModal } from "@/components/portal/carrier-modal"
import { carriers as seedCarriers, type Carrier } from "@/lib/portal-data"

export default function CarriersPage() {
  const [list, setList] = useState<Carrier[]>(seedCarriers)
  const [editing, setEditing] = useState<Carrier | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Carrier | null>(null)

  function save(c: Carrier) {
    setList((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [...l, c]))
    setModalOpen(false)
    setEditing(null)
  }
  function toggleActive(id: string) {
    setList((l) => l.map((c) => (c.id === id ? { ...c, active: !c.active } : c)))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-[#0D1B2A]">Carriers</h2>
          <span className="rounded-full bg-[#F0F4F8] px-2.5 py-1 text-xs font-medium text-[#64748B]">
            {list.length} carriers
          </span>
        </div>
        <button
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
          className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] hover:bg-[#EA580C]"
        >
          <Plus className="h-4 w-4" /> Add Carrier
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#0D1B2A] text-xs uppercase tracking-wide text-[#94A3B8]">
              <tr>
                <th className="px-4 py-3 font-semibold">Carrier Name</th>
                <th className="px-4 py-3 font-semibold">Contact Person</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">WhatsApp</th>
                <th className="px-4 py-3 font-semibold">Modes</th>
                <th className="px-4 py-3 font-semibold">Language</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c, i) => (
                <tr
                  key={c.id}
                  className={`border-t border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC] ${
                    i % 2 === 1 ? "bg-[#F8FAFC]" : "bg-white"
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold text-[#0D1B2A]">
                      {c.flag} {c.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[#0F172A]">{c.contactName}</p>
                    <p className="text-xs text-[#64748B]">{c.contactRole}</p>
                  </td>
                  <td className="px-4 py-3">
                    <CopyCell value={c.email} href={`mailto:${c.email}`} />
                  </td>
                  <td className="px-4 py-3">
                    <CopyCell value={c.whatsapp} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.modes.map((m) => (
                        <ModeBadge key={m} mode={m} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#0F172A]">{c.language}</td>
                  <td className="px-4 py-3">
                    <button
                      role="switch"
                      aria-checked={c.active}
                      aria-label={`Toggle ${c.name}`}
                      onClick={() => toggleActive(c.id)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${c.active ? "bg-[#059669]" : "bg-[#CBD5E1]"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                          c.active ? "translate-x-[22px]" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        aria-label="Edit"
                        onClick={() => {
                          setEditing(c)
                          setModalOpen(true)
                        }}
                        className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-[#FFF7ED] hover:text-[#F97316]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        aria-label="Delete"
                        onClick={() => setConfirmDelete(c)}
                        className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-red-50 hover:text-red-600"
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

        {list.length === 0 && (
          <div className="py-16 text-center text-sm text-[#64748B]">
            No carriers added yet. Add your first carrier to get started.
          </div>
        )}
      </div>

      {modalOpen && (
        <CarrierModal
          carrier={editing}
          onClose={() => {
            setModalOpen(false)
            setEditing(null)
          }}
          onSave={save}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl duration-200 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-[#0D1B2A]">Delete carrier?</h3>
            <p className="mt-2 text-sm text-[#64748B]">
              Are you sure you want to delete <span className="font-medium text-[#0F172A]">{confirmDelete.name}</span>?
              This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:border-[#F97316]/40"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setList((l) => l.filter((x) => x.id !== confirmDelete.id))
                  setConfirmDelete(null)
                }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
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
  return (
    <div className="flex items-center gap-2">
      {href ? (
        <a href={href} className="truncate text-[#0F172A] hover:text-[#F97316] hover:underline">
          {value}
        </a>
      ) : (
        <span className="truncate text-[#0F172A]">{value}</span>
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
