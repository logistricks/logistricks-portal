"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, FileSpreadsheet, FileUp, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { type QuotationTemplate } from "@/lib/portal-data"
import { QuotationTemplateEditor } from "@/components/portal/quotation-template-editor"

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function QuotationTemplatesPanel() {
  const [list, setList]       = useState<QuotationTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [editing, setEditing] = useState<QuotationTemplate | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<QuotationTemplate | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [inUseTemplate, setInUseTemplate] = useState<QuotationTemplate | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/quotation-templates")
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setList(await res.json())
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const hasDefault = useMemo(() => list.some((t) => t.is_default && t.active), [list])

  async function handleSave() { await load(); setEditorOpen(false); setEditing(null) }

  async function handleDuplicate(t: QuotationTemplate) {
    const res = await fetch("/api/quotation-templates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "duplicate", template_id: t.template_id }),
    })
    if (!res.ok) { setError(`Duplicate failed (${res.status})`); return }
    await load()
  }

  async function executeDelete(t: QuotationTemplate) {
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/quotation-templates?template_id=${t.template_id}`, { method: "DELETE" })
      if (res.status === 409) {
        const b = await res.json().catch(() => ({}))
        setConfirmDelete(null)
        setInUseTemplate({ ...t, template_name: b.name ?? t.template_name })
        return
      }
      if (!res.ok) { setError(`Delete failed (${res.status})`); return }
      setList((l) => l.filter((x) => x.template_id !== t.template_id))
      setConfirmDelete(null)
    } catch (e) { setError((e as Error).message) }
    finally { setDeleteLoading(false) }
  }

  async function handleSetDefault(t: QuotationTemplate) {
    const next = !t.is_default
    setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, is_default: next } : { ...x, is_default: false }))
    try {
      const res = await fetch("/api/quotation-templates", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.template_id, is_default: next }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) { setError((e as Error).message); await load() }
  }

  async function toggleActive(t: QuotationTemplate) {
    const next = !t.active
    setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: next } : x))
    const res = await fetch("/api/quotation-templates", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: t.template_id, active: next }),
    })
    if (!res.ok) setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: t.active } : x))
  }

  async function handleDeactivateTemplate(t: QuotationTemplate) {
    setInUseTemplate(null)
    setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: false } : x))
    const res = await fetch("/api/quotation-templates", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: t.template_id, active: false }),
    })
    if (!res.ok) { setError(`Server error ${res.status}`); await load() }
  }

  function openNew(_fromWord = false) {
    setEditing({
      id: 0, template_id: 0, template_name: "", subject: "", body: "",
      is_default: list.length === 0, active: true, format: "html",
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    setEditorOpen(true)
  }

  return (
    <div className="space-y-5">
      <div className="page-band flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[28px] font-extrabold leading-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Quotation Templates</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => openNew(true)}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-all"
            style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}
          >
            <FileUp className="h-4 w-4" /> Import from Word
          </button>
          <button
            onClick={() => openNew()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
            style={{ background: "var(--brand-accent)" }}
          >
            <Plus className="h-4 w-4" /> New Template
          </button>
        </div>
      </div>

      {!loading && !hasDefault && list.length > 0 && (
        <p className="rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--text-primary)" }}>
          No default template is set. Mark one as default so quotations can be built without choosing a template each time.
        </p>
      )}

      {error && <p className="rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--brand-accent)" }} />
        </div>
      ) : list.length === 0 ? (
        <button
          onClick={() => openNew()}
          className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-[10px] border-2 border-dashed p-5 transition-colors"
          style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}
        >
          <FileSpreadsheet className="h-8 w-8" />
          <span className="text-sm font-semibold">Create your first quotation template</span>
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <article key={t.template_id} className="ds-card flex flex-col overflow-hidden">
              <div className="flex items-start gap-3 p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{t.template_name}</h3>
                  {t.subject ? <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-secondary)" }}>{t.subject}</p> : null}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)" }}>{t.format === "html" ? "Rich layout" : "Plain text"}</span>
                    {t.applies_to_mode && t.applies_to_mode !== "any" && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize" style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)" }}>{t.applies_to_mode}</span>
                    )}
                    {t.is_default && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgb(var(--brand-accent-rgb) / 0.15)", color: "var(--brand-accent)" }}>Default</span>}
                    {!t.active && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">Inactive</span>}
                  </div>
                </div>
              </div>

              <p className="line-clamp-3 flex-1 px-5 pb-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {t.description || t.body?.replace(/\s+/g, " ").trim() || <em style={{ color: "var(--text-muted)" }}>No content</em>}
              </p>

              <div className="flex items-center gap-1 border-t px-3 py-3" style={{ borderColor: "var(--divider)" }}>
                <button
                  title={t.is_default ? "Remove default" : "Set as default"}
                  onClick={() => handleSetDefault(t)}
                  className={`flex flex-col items-center gap-1 rounded-xl px-2.5 py-2 text-[10px] font-semibold leading-none transition-all ${
                    t.is_default ? "bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]" : "text-[var(--text-muted)] hover:bg-[var(--brand-accent)]/8 hover:text-[var(--brand-accent)]"
                  }`}
                  style={{ minWidth: 52 }}
                >
                  <Star className="h-5 w-5" />
                  <span>Default</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 border-t px-4 py-3" style={{ borderColor: "var(--divider)", background: "var(--table-header-bg)" }}>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Updated {relativeTime(t.updated_at)}</span>
                <div className="flex items-center gap-1">
                  <button
                    role="switch" aria-checked={t.active} aria-label={`Toggle ${t.template_name}`}
                    onClick={() => toggleActive(t)}
                    className={`relative h-5 w-9 overflow-hidden rounded-full transition-colors ${t.active ? "bg-[var(--brand-accent)]" : "bg-[#CBD5E1] dark:bg-[#334155]"}`}
                  >
                    <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${t.active ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                  <button aria-label="Edit" onClick={() => { setEditing(t); setEditorOpen(true) }}
                    className="flex h-7 w-7 items-center justify-center rounded-md" style={{ color: "var(--text-muted)" }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button aria-label="Duplicate" onClick={() => handleDuplicate(t)}
                    className="flex h-7 w-7 items-center justify-center rounded-md" style={{ color: "var(--text-muted)" }}>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button aria-label="Delete" onClick={() => setConfirmDelete(t)}
                    className="flex h-7 w-7 items-center justify-center rounded-md" style={{ color: "var(--text-muted)" }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={{ background: "var(--card-bg)" }}>
            <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Delete template?</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              Are you sure you want to delete <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{confirmDelete.template_name}</span>? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} disabled={deleteLoading}
                className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                Cancel
              </button>
              <button onClick={() => executeDelete(confirmDelete)} disabled={deleteLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {inUseTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={{ background: "var(--card-bg)" }}>
            <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Cannot delete template</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{inUseTemplate.template_name}</span> has been used in quotations and cannot be deleted. You can deactivate it instead.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setInUseTemplate(null)} className="rounded-lg border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                Cancel
              </button>
              <button onClick={() => handleDeactivateTemplate(inUseTemplate)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110" style={{ background: "var(--brand-accent)" }}>
                Deactivate Instead
              </button>
            </div>
          </div>
        </div>
      )}

      {editorOpen && editing && (
        <QuotationTemplateEditor template={editing} onClose={() => { setEditorOpen(false); setEditing(null) }} onSave={handleSave} />
      )}
    </div>
  )
}
