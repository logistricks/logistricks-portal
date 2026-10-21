"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, CheckCheck, Copy, Loader2, Mail, MessageCircle, MessageSquareReply, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { TemplateEditor } from "@/components/portal/template-editor"
import { CarrierEmailsPanel } from "@/components/portal/carrier-emails-panel"
import { QuotationTemplatesPanel } from "@/components/portal/quotation-templates-panel"
import { type Template, type TemplateRow } from "@/lib/portal-data"
import { templateHasRef } from "@/lib/template-render"
import { TemplatePreview } from "@/components/portal/template-preview"
import { QuoteDefaultDialog, modeNames, type ModeSet } from "@/components/portal/quote-default-dialog"

type Tab = "All" | "Email" | "WhatsApp" | "Quotation" | "Carrier emails"
const tabs: Tab[] = ["All", "Email", "WhatsApp", "Quotation", "Carrier emails"]

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
    mode_sea:           row.mode_sea,
    mode_air:           row.mode_air,
    mode_land:          row.mode_land,
    default_sea:        row.default_sea,
    default_air:        row.default_air,
    default_land:       row.default_land,
    mode_multi:         row.mode_multi,
    default_multi:      row.default_multi,
    is_reply_template:  row.is_reply_template,
    is_missing_reply_template: row.is_missing_reply_template,
    is_complete_reply_template: row.is_complete_reply_template,
    active:             row.active,
    updated_at:         row.updated_at,
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ── Tagged icon button with label underneath ─────────────────────────────────
function TagButton({
  active,
  activeClass,
  inactiveClass,
  icon: Icon,
  label,
  title,
  onClick,
}: {
  active: boolean
  activeClass: string
  inactiveClass: string
  icon: React.ElementType
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={title}
      title={title}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl px-2.5 py-2 text-[10px] font-semibold transition-all leading-none ${active ? activeClass : inactiveClass}`}
      style={{ minWidth: 52 }}
    >
      <Icon className="h-5 w-5" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

export function TemplatesPanel() {
  const [list, setList]           = useState<Template[]>([])
  const [loading, setLoading]     = useState(true)
  const [defaultFor, setDefaultFor] = useState<Template | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [tab, setTab]             = useState<Tab>("All")
  const [editing, setEditing]     = useState<Template | null>(null)
  const [editorOpen, setEditorOpen]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [inUseTemplate, setInUseTemplate] = useState<Template | null>(null)

  async function loadTemplates() {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/templates")
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const rows: TemplateRow[] = await res.json()
      setList(rows.map(rowToTemplate))
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadTemplates() }, [])

  const filtered = useMemo(
    () => (tab === "All" ? list : list.filter((t) => t.type === tab)),
    [list, tab],
  )

  async function handleSave() { await loadTemplates(); setEditorOpen(false); setEditing(null) }

  async function handleDuplicate(t: Template) {
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "duplicate", template_id: t.template_id }),
    })
    if (!res.ok) { setError(`Duplicate failed (${res.status})`); return }
    await loadTemplates()
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
    } catch (e) { setError((e as Error).message) }
    finally { setDeleteLoading(false) }
  }

  async function handleDeactivateTemplate(t: Template) {
    setInUseTemplate(null)
    setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: false } : x))
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.template_id, active: false }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) {
      setError((e as Error).message)
      setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: t.active } : x))
    }
  }

  async function patch(t: Template, fields: Partial<Template>) {
    const prev = { ...t }
    setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, ...fields } : x))
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.template_id, ...fields }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) {
      setError((e as Error).message)
      setList((l) => l.map((x) => x.template_id === t.template_id ? prev : x))
    }
  }

  async function saveModes(t: Template, modes: ModeSet, defaults: ModeSet) {
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.template_id, modes, default_modes: defaults }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Server error ${res.status}`)
      setDefaultFor(null)
      setError(null)
    } catch (e) { setError((e as Error).message); setDefaultFor(null) }
    await loadTemplates()
  }

  async function handleSetReplyTemplate(t: Template) {
    const nextReply = !t.is_reply_template
    setList((l) => l.map((x) =>
      x.template_id === t.template_id
        ? { ...x, is_reply_template: nextReply, is_missing_reply_template: nextReply ? false : x.is_missing_reply_template }
        : { ...x, is_reply_template: false }
    ))
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.template_id, is_reply_template: nextReply }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) {
      setError((e as Error).message)
      setList((l) => l.map((x) =>
        x.template_id === t.template_id ? { ...x, is_reply_template: t.is_reply_template, is_missing_reply_template: t.is_missing_reply_template } : x
      ))
    }
  }

  async function handleSetMissingReplyTemplate(t: Template) {
    const nextMissing = !t.is_missing_reply_template
    setList((l) => l.map((x) =>
      x.template_id === t.template_id
        ? { ...x, is_missing_reply_template: nextMissing, is_reply_template: nextMissing ? false : x.is_reply_template }
        : { ...x, is_missing_reply_template: false }
    ))
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.template_id, is_missing_reply_template: nextMissing }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) {
      setError((e as Error).message)
      setList((l) => l.map((x) =>
        x.template_id === t.template_id ? { ...x, is_missing_reply_template: t.is_missing_reply_template, is_reply_template: t.is_reply_template } : x
      ))
    }
  }

  async function handleSetCompleteReplyTemplate(t: Template) {
    const nextComplete = !t.is_complete_reply_template
    setList((l) => l.map((x) =>
      x.template_id === t.template_id
        ? { ...x, is_complete_reply_template: nextComplete, is_reply_template: nextComplete ? false : x.is_reply_template, is_missing_reply_template: nextComplete ? false : x.is_missing_reply_template }
        : { ...x, is_complete_reply_template: false }
    ))
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: t.template_id, is_complete_reply_template: nextComplete }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
    } catch (e) {
      setError((e as Error).message)
      setList((l) => l.map((x) =>
        x.template_id === t.template_id ? { ...x, is_complete_reply_template: t.is_complete_reply_template, is_reply_template: t.is_reply_template, is_missing_reply_template: t.is_missing_reply_template } : x
      ))
    }
  }

  function openNew(type: "Email" | "WhatsApp" = "Email") {
    setEditing({
      row_id: 0, template_id: 0, template_name: "", type,
      subject: type === "Email" ? "" : null, body: "",
      linked_carrier_ids: [], is_default: false, is_reply_template: false,
      is_missing_reply_template: false, is_complete_reply_template: false,
      active: true, updated_at: new Date().toISOString(),
    })
    setEditorOpen(true)
  }

  const tabBar = (
    <div className="flex gap-1.5">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className="rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors"
          style={tab === t
            ? { background: "var(--text-primary)", color: "#fff", borderColor: "var(--text-primary)" }
            : { background: "var(--card-bg)", color: "var(--text-secondary)", borderColor: "var(--card-border)" }}
        >
          {t}
        </button>
      ))}
    </div>
  )

  if (tab === "Carrier emails") {
    return (
      <div className="space-y-5">
        <div className="flex">{tabBar}</div>
        <CarrierEmailsPanel />
      </div>
    )
  }

  if (tab === "Quotation") {
    return (
      <div className="space-y-5">
        <div className="flex">{tabBar}</div>
        <QuotationTemplatesPanel />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="page-band flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[28px] font-extrabold leading-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Message Templates</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors"
                style={tab === t
                  ? { background: "var(--text-primary)", color: "#fff", borderColor: "var(--text-primary)" }
                  : { background: "var(--card-bg)", color: "var(--text-secondary)", borderColor: "var(--card-border)" }}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={() => openNew(tab === "WhatsApp" ? "WhatsApp" : "Email")}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-90"
            style={{ background: "var(--brand-accent)" }}
          >
            <Plus className="h-4 w-4" /> New Template
          </button>
        </div>
      </div>

      {defaultFor && <QuoteDefaultDialog template={defaultFor} others={list} onSave={(m, d) => saveModes(defaultFor, m, d)} onClose={() => setDefaultFor(null)} />}

      {error && (
        <p className="rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--brand-accent)" }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <article key={t.template_id} className="ds-card flex flex-col overflow-hidden">
              {/* Card header: channel icon + name + subject */}
              <div className="flex items-start gap-3 p-5">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    t.type === "Email"
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
                      : "bg-green-50 text-green-600 dark:bg-green-500/20 dark:text-green-300"
                  }`}
                >
                  {t.type === "Email" ? <Mail className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{t.template_name}</h3>
                  {t.subject ? <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-secondary)" }}>{t.subject}</p> : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {modeNames(t).length === 0 ? (
                      <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ border: "1px dashed var(--card-border)", color: "var(--text-muted)" }}>No mode set</span>
                    ) : modeNames(t).map((m) => (
                      <span
                        key={m.key}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                        style={m.isDefault ? { background: "var(--brand-accent)", color: "#fff" } : { background: "rgb(var(--brand-accent-rgb) / 0.1)", color: "var(--brand-accent)" }}
                        title={m.isDefault ? `Default quote request for ${m.name}` : `For ${m.name} requests`}
                      >
                        {m.isDefault && <Star className="h-3 w-3" fill="currentColor" />}{m.name}{m.isDefault ? " · Default" : ""}
                      </span>
                    ))}
                  </div>
                  {t.type === "Email" && !templateHasRef(t) && (
                    <span
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                      style={{ background: "rgba(245,158,11,0.14)", color: "#b45309" }}
                      title="This template does not show the Request Ref # (e.g. LT-0034). Open it and add the Request Ref # variable so carrier replies can be linked to the request. Until then the number is added to the subject automatically."
                    >
                      <AlertTriangle className="h-3 w-3" /> No Ref # variable
                    </span>
                  )}
                </div>
              </div>

              {/* Body preview */}
              <div className="flex-1 px-5 pb-4">
                <p
                  className="h-[4.6rem] overflow-hidden text-sm leading-relaxed"
                  style={{ color: "var(--text-secondary)", WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)", maskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)" }}
                >
                  <TemplatePreview body={t.body} />
                </p>
              </div>

              {/* Tags row — Default / Auto-reply / Missing / Complete with BIGGER icons + labels */}
              <div className="flex items-center gap-1 border-t px-3 py-3" style={{ borderColor: "var(--divider)" }}>
                <TagButton
                  active={modeNames(t).some((m) => m.isDefault)}
                  activeClass="bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]"
                  inactiveClass="text-[var(--text-muted)] hover:bg-[var(--brand-accent)]/8 hover:text-[var(--brand-accent)]"
                  icon={Star}
                  label="Quote Request"
                  title="Choose the modes this template is for and which it is the default for"
                  onClick={() => setDefaultFor(t)}
                />
                <TagButton
                  active={t.is_reply_template}
                  activeClass="bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
                  inactiveClass="text-[var(--text-muted)] hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10"
                  icon={MessageSquareReply}
                  label="Auto-reply"
                  title={t.is_reply_template ? "Remove auto-reply" : "Set as auto-reply"}
                  onClick={() => handleSetReplyTemplate(t)}
                />
                <TagButton
                  active={t.is_missing_reply_template}
                  activeClass="bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]"
                  inactiveClass="text-[var(--text-muted)] hover:bg-[var(--brand-accent)]/10 hover:text-[var(--brand-accent)]"
                  icon={AlertTriangle}
                  label="Missing data"
                  title={t.is_missing_reply_template ? "Remove missing-data" : "Set as missing-data reply"}
                  onClick={() => handleSetMissingReplyTemplate(t)}
                />
                <TagButton
                  active={t.is_complete_reply_template}
                  activeClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
                  inactiveClass="text-[var(--text-muted)] hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10"
                  icon={CheckCheck}
                  label="Complete"
                  title={t.is_complete_reply_template ? "Remove complete-data" : "Set as complete-data reply"}
                  onClick={() => handleSetCompleteReplyTemplate(t)}
                />
              </div>

              {/* Footer: timestamp, toggle, edit actions */}
              <div
                className="flex items-center justify-between gap-2 border-t px-4 py-3"
                style={{ borderColor: "var(--divider)", background: "var(--table-header-bg)" }}
              >
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Updated {relativeTime(t.updated_at)}</span>
                <div className="flex items-center gap-1">
                  {/* Active toggle */}
                  <button
                    role="switch"
                    aria-checked={t.active}
                    aria-label={`Toggle ${t.template_name}`}
                    onClick={async () => {
                      const next = !t.active
                      setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: next } : x))
                      const res = await fetch("/api/templates", {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ template_id: t.template_id, active: next }),
                      })
                      if (!res.ok) setList((l) => l.map((x) => x.template_id === t.template_id ? { ...x, active: t.active } : x))
                    }}
                    className={`relative h-5 w-9 overflow-hidden rounded-full transition-colors ${t.active ? "bg-[var(--brand-accent)]" : "bg-[#CBD5E1] dark:bg-[#334155]"}`}
                  >
                    <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${t.active ? "translate-x-4" : "translate-x-0"}`} />
                  </button>

                  {/* Edit */}
                  <button
                    aria-label="Edit"
                    onClick={() => { setEditing(t); setEditorOpen(true) }}
                    className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgb(var(--brand-accent-rgb) / 0.1)"; (e.currentTarget as HTMLElement).style.color = "var(--brand-accent)" }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)" }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>

                  {/* Duplicate */}
                  <button
                    aria-label="Duplicate"
                    onClick={() => handleDuplicate(t)}
                    className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgb(var(--brand-accent-rgb) / 0.1)"; (e.currentTarget as HTMLElement).style.color = "var(--brand-accent)" }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)" }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    aria-label="Delete"
                    onClick={() => setConfirmDelete(t)}
                    className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)"; (e.currentTarget as HTMLElement).style.color = "#ef4444" }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}

          <button
            onClick={() => openNew(tab === "WhatsApp" ? "WhatsApp" : "Email")}
            className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-[10px] border-2 border-dashed p-5 transition-colors"
            style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-accent)"; (e.currentTarget as HTMLElement).style.color = "var(--brand-accent)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)" }}
          >
            <Plus className="h-9 w-9" />
            <span className="text-sm font-semibold">Create New Template</span>
          </button>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={{ background: "var(--card-bg)" }}>
            <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Delete template?</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              Are you sure you want to delete{" "}
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{confirmDelete.template_name}</span>?
              This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleteLoading}
                className="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ borderColor: "var(--card-border)", color: "var(--text-primary)", background: "var(--card-bg)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => executeDelete(confirmDelete)}
                disabled={deleteLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-use template modal */}
      {inUseTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={{ background: "var(--card-bg)" }}>
            <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Cannot delete template</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{inUseTemplate.template_name}</span>{" "}
              has been used in requests and cannot be deleted. You can deactivate it instead.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setInUseTemplate(null)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: "var(--card-border)", color: "var(--text-primary)", background: "var(--card-bg)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeactivateTemplate(inUseTemplate)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-90"
                style={{ background: "var(--brand-accent)" }}
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
