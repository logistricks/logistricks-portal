"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, FileSpreadsheet, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { type QuotationTemplate } from "@/lib/portal-data"

const PLACEHOLDERS = [
  ["origin_city", "Origin city"], ["origin_country", "Origin country"],
  ["destination_city", "Destination city"], ["destination_country", "Destination country"],
  ["cargo_type", "Cargo type"], ["equipment", "Equipment"], ["weight", "Weight"],
  ["quantity", "Quantity"], ["dimensions", "Dimensions"], ["incoterm", "Incoterm"],
  ["bl_type", "BL type"], ["mode", "Mode(s)"], ["urgency", "Urgency"],
  ["sender_name", "Requester name"], ["sender_email", "Requester email"],
  ["received_date", "Date received"], ["carrier_name", "Chosen carrier"],
  ["transit_days", "Transit days"], ["validity_date", "Carrier quote validity"],
  ["free_days", "Free days"], ["base_rate", "Carrier's base rate"],
  ["markup", "Markup added"], ["final_price", "Final price (base + markup)"],
  ["currency", "Currency"], ["quotation_date", "Today's date"],
]

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function QuotationTemplateEditor({
  template, onClose, onSave,
}: {
  template: QuotationTemplate
  onClose: () => void
  onSave: () => void
}) {
  const [name, setName]       = useState(template.template_name)
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody]       = useState(template.body)
  const [isDefault, setIsDefault] = useState(template.is_default)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  function insertPlaceholder(key: string) {
    setBody((b) => `${b}{{${key}}}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSaving(true)
    try {
      const payload = { template_name: name, subject, body, is_default: isDefault, active: true }
      const res = await fetch("/api/quotation-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template.id ? { row_id: template.id, ...payload } : payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Server error ${res.status}`)
      }
      onSave()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:rounded-2xl" style={{ background: "var(--card-bg)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ background: "var(--brand-primary-dark, #0D1B2A)" }}>
          <h3 className="font-semibold text-white">{template.id ? "Edit Quotation Template" : "New Quotation Template"}</h3>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>}

            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>Template Name</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)} required
                className="h-10 w-full rounded-md border px-3 text-sm outline-none"
                style={{ borderColor: "var(--card-border)", background: "var(--input-bg, transparent)", color: "var(--text-primary)" }}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>Email Subject</label>
              <input
                value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="Quotation — {{origin_city}} to {{destination_city}}"
                className="h-10 w-full rounded-md border px-3 text-sm outline-none"
                style={{ borderColor: "var(--card-border)", background: "var(--input-bg, transparent)", color: "var(--text-primary)" }}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>Body</label>
              <textarea
                value={body} onChange={(e) => setBody(e.target.value)} rows={10} required
                className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--card-border)", background: "var(--input-bg, transparent)", color: "var(--text-primary)" }}
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Insert placeholder</p>
              <div className="flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map(([key, label]) => (
                  <button
                    key={key} type="button" title={label} onClick={() => insertPlaceholder(key)}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
                    style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}
                  >
                    {`{{${key}}}`}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3">
              <button
                type="button" role="switch" aria-checked={isDefault}
                onClick={() => setIsDefault((v) => !v)}
                className={`relative h-6 w-11 overflow-hidden rounded-full transition-colors ${isDefault ? "bg-[#F97316]" : "bg-[#CBD5E1]"}`}
              >
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${isDefault ? "translate-x-5" : "translate-x-0"}`} />
              </button>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Default template
                <span className="ml-1.5 block font-normal" style={{ color: "var(--text-muted)" }}>Used automatically when building a quotation, unless another is chosen</span>
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 border-t p-4" style={{ borderColor: "var(--divider)" }}>
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--brand-accent)" }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Template
            </button>
          </div>
        </form>
      </div>
    </div>
  )
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

  function openNew() {
    setEditing({
      id: 0, template_id: 0, template_name: "", subject: "", body: "",
      is_default: list.length === 0, active: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    setEditorOpen(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[22px] font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Quotation Templates</h2>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            Used to auto-build the quotation sent back to the original requester.
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110"
          style={{ background: "var(--brand-accent)" }}
        >
          <Plus className="h-4 w-4" /> New Template
        </button>
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
          onClick={openNew}
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
                </div>
              </div>

              <p className="line-clamp-3 flex-1 px-5 pb-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {t.body?.replace(/\s+/g, " ").trim() || <em style={{ color: "var(--text-muted)" }}>No content</em>}
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
