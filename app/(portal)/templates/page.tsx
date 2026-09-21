"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, Copy, Loader2, Mail, MessageCircle, MessageSquareReply, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { TemplateEditor } from "@/components/portal/template-editor"
import { type Template, type TemplateRow } from "@/lib/portal-data"

type Tab = "All" | "Email" | "WhatsApp"
const tabs: Tab[] = ["All", "Email", "WhatsApp"]

function rowToTemplate(row: TemplateRow): Template {
  return {
    row_id:             row.id,
    template_id:        row.template_id,
    template_name:      row.template_name,
    type:               row.type,
    subject:            row.subject,
    body:               row.body,
    linked_carrier_ids: row.linked_carrier_ids,
    is_default:         row.is_default,
    is_reply_template:  row.is_reply_template,
    is_missing_reply_template: row.is_missing_reply_template,
    active:             row.active,
    updated_at:         row.updated_at,
  }
}

function relativeTime(iso: string): string {
  const diff    = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function TemplatesPage() {
  const [list, setList]           = useState<Template[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [tab, setTab]             = useState<Tab>("All")
  const [editing, setEditing]     = useState<Template | null>(null)
  const [editorOpen, setEditorOpen]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [inUseTemplate, setInUseTemplate] = useState<Template | null>(null)

  async function loadTemplates() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/templates")
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const rows: TemplateRow[] = await res.json()
      setList(rows.map(rowToTemplate))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTemplates() }, [])

  const filtered = useMemo(
    () => (tab === "All" ? list : list.filter((t) => t.type === tab)),
    [list, tab],
  )

  async function handleSave() {
    await loadTemplates()
    setEditorOpen(false)
    setEditing(null)
  }

  async function handleDuplicate(t: Template) {
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "duplicate", template_id: t.template_id }),
    })
    if (!res.ok) { setError(`Duplicate failed (${res.status})`); return }
    await loadTemplates()
  }

  async function handleDelete(t: Template) {
    setConfirmDelete(t)
  }

  async function executeDelete(t: Template) {
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/templates?template_id=${t.template_id}`, { method: "DELETE" })
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}))
        setConfirmDelete(null)
        setInUseTemplate({ ...t, template_name: body.name ?? t.template_name })
        return
      }
      if (!res.ok) { setError(`Delete failed (${res.status})`); return }
      setList((l) => l.filter((x) => x.template_id !== t.template_id))
      setConfirmDelete(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleDeactivateTemplate(t: Template) {
    setInUseTemplate(null)
    setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: false } : x))
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.template_id, active: false }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) {
      setError((e as Error).message)
      setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: t.active } : x))
    }
  }

  async function handleSetReplyTemplate(t: Template) {
    // Optimistic: mark this one, unmark all others
    setList((l) => l.map((x) => ({ ...x, is_reply_template: x.template_id === t.template_id ? !t.is_reply_template : false })))
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.template_id, is_reply_template: !t.is_reply_template }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) {
      setError((e as Error).message)
      setList((l) => l.map((x) => ({ ...x, is_reply_template: x.template_id === t.template_id ? t.is_reply_template : x.is_reply_template })))
    }
  }

  async function handleSetMissingReplyTemplate(t: Template) {
    // Optimistic: mark this one, unmark all others
    setList((l) => l.map((x) => ({ ...x, is_missing_reply_template: x.template_id === t.template_id ? !t.is_missing_reply_template : false })))
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.template_id, is_missing_reply_template: !t.is_missing_reply_template }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) {
      setError((e as Error).message)
      setList((l) => l.map((x) => ({ ...x, is_missing_reply_template: x.template_id === t.template_id ? t.is_missing_reply_template : x.is_missing_reply_template })))
    }
  }

  function openNew(type: "Email" | "WhatsApp" = "Email") {
    setEditing({
      row_id:             0,
      template_id:        0,
      template_name:      "",
      type,
      subject:            type === "Email" ? "" : null,
      body:               "",
      linked_carrier_ids: [],
      is_default:         false,
      is_reply_template:  false,
      is_missing_reply_template: false,
      active:             true,
      updated_at:         new Date().toISOString(),
    })
    setEditorOpen(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-[#0D1B2A] dark:text-white">Message Templates</h2>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[#E2E8F0] bg-white p-0.5 dark:border-[#1E3A5F] dark:bg-[#111E33]">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t ? "bg-[#F97316] text-white" : "text-[#64748B] hover:text-[#0D1B2A] dark:hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={() => openNew(tab === "WhatsApp" ? "WhatsApp" : "Email")}
            className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] hover:bg-[#EA580C]"
          >
            <Plus className="h-4 w-4" /> New Template
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <article
              key={t.template_id}
              className="flex flex-col rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-md dark:border-[#1E3A5F] dark:bg-[#111E33]"
            >
              <div className="flex items-start justify-between">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                    t.type === "Email"
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
                      : "bg-green-50 text-green-600 dark:bg-green-500/20 dark:text-green-300"
                  }`}
                >
                  {t.type === "Email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                </span>
                <div className="flex flex-col items-end gap-1">
                  {t.is_default && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF7ED] px-2 py-0.5 text-xs font-medium text-[#F97316] dark:bg-[#F97316]/10">
                      <Star className="h-3 w-3 fill-[#F97316]" /> Default
                    </span>
                  )}
                  {t.is_reply_template && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
                      <MessageSquareReply className="h-3 w-3" /> Auto-reply
                    </span>
                  )}
                  {t.is_missing_reply_template && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600 dark:bg-orange-500/20 dark:text-orange-300">
                      <AlertTriangle className="h-3 w-3" /> Missing data
                    </span>
                  )}
                </div>
              </div>

              <h3 className="mt-3 font-semibold text-[#0D1B2A] dark:text-white">{t.template_name}</h3>
              {t.subject ? <p className="mt-0.5 truncate text-xs text-[#64748B]">{t.subject}</p> : null}
              <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-[#64748B]">{t.body}</p>

              <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-3 dark:border-[#1E3A5F]">
                <span className="text-xs text-[#94A3B8]">Updated {relativeTime(t.updated_at)}</span>
                <div className="flex items-center gap-2">
                  <button
                    role="switch"
                    aria-checked={t.active}
                    aria-label={`Toggle ${t.template_name}`}
                    onClick={async () => {
                      const next = !t.active
                      setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: next } : x))
                      const res = await fetch("/api/templates", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ template_id: t.template_id, active: next }),
                      })
                      if (!res.ok) setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: t.active } : x))
                    }}
                    className={`relative h-5 w-9 overflow-hidden rounded-full transition-colors ${t.active ? "bg-[#059669]" : "bg-[#CBD5E1]"}`}
                  >
                    <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${t.active ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                  <div className="flex items-center gap-1">
                  <button
                    aria-label={t.is_reply_template ? "Remove as auto-reply template" : "Set as auto-reply template"}
                    title={t.is_reply_template ? "Remove as auto-reply template" : "Set as auto-reply template"}
                    onClick={() => handleSetReplyTemplate(t)}
                    className={`rounded-md p-1.5 transition-colors ${t.is_reply_template ? "bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300" : "text-[#64748B] hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10"}`}
                  >
                    <MessageSquareReply className="h-4 w-4" />
                  </button>
                  <button
                    aria-label={t.is_missing_reply_template ? "Remove as missing-data auto-reply template" : "Set as missing-data auto-reply template"}
                    title={t.is_missing_reply_template ? "Remove as missing-data auto-reply template" : "Set as missing-data auto-reply template"}
                    onClick={() => handleSetMissingReplyTemplate(t)}
                    className={`rounded-md p-1.5 transition-colors ${t.is_missing_reply_template ? "bg-orange-50 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300" : "text-[#64748B] hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-500/10"}`}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Edit"
                    onClick={() => { setEditing(t); setEditorOpen(true) }}
                    className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-[#FFF7ED] hover:text-[#F97316] dark:hover:bg-[#F97316]/10"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Duplicate"
                    onClick={() => handleDuplicate(t)}
                    className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-[#FFF7ED] hover:text-[#F97316] dark:hover:bg-[#F97316]/10"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Delete"
                    onClick={() => handleDelete(t)}
                    className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                </div>
              </div>
            </article>
          ))}

          <button
            onClick={() => openNew(tab === "WhatsApp" ? "WhatsApp" : "Email")}
            className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#CBD5E1] bg-white/50 p-5 text-[#64748B] transition-colors hover:border-[#F97316] hover:text-[#F97316] dark:border-[#1E3A5F] dark:bg-[#111E33]/50 dark:hover:border-[#F97316]"
          >
            <Plus className="h-8 w-8" />
            <span className="text-sm font-medium">Create New Template</span>
          </button>
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <p className="py-8 text-center text-sm text-[#64748B]">No {tab.toLowerCase()} templates yet.</p>
      )}


      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl duration-200 animate-in fade-in zoom-in-95 dark:bg-[#111E33]">
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Delete template?</h3>
            <p className="mt-2 text-sm text-[#64748B]">
              Are you sure you want to delete{" "}
              <span className="font-medium text-[#0F172A] dark:text-[#E2E8F0]">{confirmDelete.template_name}</span>?
              This cannot be undone.
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
                onClick={() => executeDelete(confirmDelete)}
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

      {inUseTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl duration-200 animate-in fade-in zoom-in-95 dark:bg-[#111E33]">
            <h3 className="text-lg font-bold text-[#0D1B2A] dark:text-white">Cannot delete template</h3>
            <p className="mt-2 text-sm text-[#64748B]">
              <span className="font-medium text-[#0F172A] dark:text-[#E2E8F0]">{inUseTemplate.template_name}</span>{" "}
              has been used in one or more requests and cannot be deleted. You can deactivate it instead to hide it from future use.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setInUseTemplate(null)}
                className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:border-[#F97316]/40 dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeactivateTemplate(inUseTemplate)}
                className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#EA580C]"
              >
                Deactivate Instead
              </button>
            </div>
          </div>
        </div>
      )}

      {editorOpen && editing && (
        <TemplateEditor
          template={editing}
          onClose={() => { setEditorOpen(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
