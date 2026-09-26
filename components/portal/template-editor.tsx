"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MessageSquareReply,
  Strikethrough,
  Table,
  Underline,
  X,
} from "lucide-react"
import { templateVariables, type Carrier, type Template } from "@/lib/portal-data"

// ── Rich-text editor ─────────────────────────────────────────────────────────

function execFmt(cmd: string, val?: string) {
  document.execCommand(cmd, false, val ?? undefined)
}

function insertHtmlAtCursor(html: string) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const div = document.createElement("div")
  div.innerHTML = html
  const frag = document.createDocumentFragment()
  let last: Node | null = null
  while (div.firstChild) { last = div.firstChild; frag.appendChild(last) }
  range.insertNode(frag)
  if (last) {
    const r = range.cloneRange()
    r.setStartAfter(last)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
  }
}

type ToolbarItem = { icon: React.ElementType; label: string; action: () => void } | "sep"

function Toolbar({ items }: { items: ToolbarItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5" style={{ background: "var(--table-header-bg)", borderBottom: "1px solid var(--divider)" }}>
      {items.map((item, i) =>
        item === "sep" ? (
          <span key={i} className="mx-1 inline-block h-4 w-px" style={{ background: "var(--divider)" }} />
        ) : (
          <button
            key={i}
            type="button"
            title={item.label}
            onMouseDown={(e) => { e.preventDefault(); item.action() }}
            className="flex flex-col items-center justify-center rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors"
            style={{ color: "var(--text-secondary)", minWidth: 32 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)" }}
          >
            <item.icon className="h-4 w-4" />
            <span className="mt-0.5 leading-none">{item.label}</span>
          </button>
        )
      )}
    </div>
  )
}

// ── Variable pill ────────────────────────────────────────────────────────────

function VarPill({ name, label, onInsert }: { name: string; label: string; onInsert: (name: string) => void }) {
  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", `{{${name}}}`)
    e.dataTransfer.effectAllowed = "copy"
  }
  return (
    <button
      type="button"
      draggable
      onDragStart={handleDragStart}
      onClick={() => onInsert(name)}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors"
      style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(232,130,26,0.4)"; (e.currentTarget as HTMLElement).style.background = "rgba(232,130,26,0.04)" }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLElement).style.background = "var(--card-bg)" }}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
      <div className="min-w-0 flex-1">
        <code className="block text-[11px] font-bold" style={{ color: "var(--brand-accent)" }}>{`{{${name}}}`}</code>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      </div>
    </button>
  )
}

// ── Main editor ──────────────────────────────────────────────────────────────

export function TemplateEditor({
  template,
  onClose,
  onSave,
}: {
  template: Template
  onClose: () => void
  onSave: () => void
}) {
  const [templateName, setTemplateName] = useState(template.template_name)
  const [nameError, setNameError]       = useState(false)
  const [type] = useState<"Email" | "WhatsApp">(template.type)
  const [subject, setSubject]           = useState(template.subject ?? "")
  const [linkedCarrierIds, setLinkedCarrierIds] = useState<number[]>(template.linked_carrier_ids)
  const [isDefault, setIsDefault]       = useState(template.is_default)
  const [carriers, setCarriers]         = useState<Carrier[]>([])
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [openGroups, setOpenGroups]     = useState<string[]>(templateVariables.map((g) => g.group))
  const editorRef = useRef<HTMLDivElement>(null)
  const isEmail = type === "Email"

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = template.body ?? ""
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadCarriers = useCallback(async () => {
    try {
      const res = await fetch("/api/carriers")
      if (!res.ok) return
      const rows: Array<Carrier & { is_cc?: boolean }> = await res.json()
      setCarriers(rows.filter((c) => !c.is_cc))
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => { loadCarriers() }, [loadCarriers])

  function getEditorHtml() {
    return editorRef.current?.innerHTML ?? ""
  }

  function insertVar(name: string) {
    const token = `{{${name}}}`
    const pill = `<span class="tpl-var" contenteditable="false" data-var="${name}" style="display:inline-block;background:rgba(232,130,26,0.12);color:#E8821A;border-radius:4px;padding:1px 6px;font-size:12px;font-weight:600;font-family:monospace;margin:0 1px;cursor:default;">${token}</span>`
    editorRef.current?.focus()
    insertHtmlAtCursor(pill + "​")
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const raw = e.dataTransfer.getData("text/plain")
    const match = raw.match(/^\{\{(\w+)\}\}$/)
    if (!match) return
    const name = match[1]
    const pill = `<span class="tpl-var" contenteditable="false" data-var="${name}" style="display:inline-block;background:rgba(232,130,26,0.12);color:#E8821A;border-radius:4px;padding:1px 6px;font-size:12px;font-weight:600;font-family:monospace;margin:0 1px;cursor:default;">{{${name}}}</span>`

    // Place at drop position
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY)
    if (range) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    insertHtmlAtCursor(pill + "​")
  }

  function insertTable() {
    const table = `<table style="width:100%;border-collapse:collapse;margin:8px 0;">
<thead><tr>
  <th style="border:1px solid #ccc;padding:6px 8px;background:#f7f8fa;text-align:left;">Column 1</th>
  <th style="border:1px solid #ccc;padding:6px 8px;background:#f7f8fa;text-align:left;">Column 2</th>
  <th style="border:1px solid #ccc;padding:6px 8px;background:#f7f8fa;text-align:left;">Column 3</th>
</tr></thead>
<tbody>
  <tr><td style="border:1px solid #ccc;padding:6px 8px;">Value</td><td style="border:1px solid #ccc;padding:6px 8px;">Value</td><td style="border:1px solid #ccc;padding:6px 8px;">Value</td></tr>
  <tr><td style="border:1px solid #ccc;padding:6px 8px;">Value</td><td style="border:1px solid #ccc;padding:6px 8px;">Value</td><td style="border:1px solid #ccc;padding:6px 8px;">Value</td></tr>
</tbody></table>`
    editorRef.current?.focus()
    insertHtmlAtCursor(table)
  }

  function insertLink() {
    const url = window.prompt("Enter URL:", "https://")
    if (url) execFmt("createLink", url)
  }

  const emailTools: ToolbarItem[] = [
    { icon: Bold,         label: "Bold",    action: () => execFmt("bold") },
    { icon: Italic,       label: "Italic",  action: () => execFmt("italic") },
    { icon: Underline,    label: "Underline", action: () => execFmt("underline") },
    { icon: Strikethrough, label: "Strike", action: () => execFmt("strikeThrough") },
    "sep",
    { icon: Heading1,     label: "H1",      action: () => execFmt("formatBlock", "<h1>") },
    { icon: Heading2,     label: "H2",      action: () => execFmt("formatBlock", "<h2>") },
    "sep",
    { icon: List,         label: "Bullets", action: () => execFmt("insertUnorderedList") },
    { icon: ListOrdered,  label: "Numbers", action: () => execFmt("insertOrderedList") },
    "sep",
    { icon: Table,        label: "Table",   action: insertTable },
    { icon: Link2,        label: "Link",    action: insertLink },
    "sep",
    { icon: AlignLeft,    label: "Left",    action: () => execFmt("justifyLeft") },
    { icon: AlignCenter,  label: "Center",  action: () => execFmt("justifyCenter") },
    { icon: AlignRight,   label: "Right",   action: () => execFmt("justifyRight") },
  ]

  const waTools: ToolbarItem[] = [
    { icon: Bold,         label: "Bold",    action: () => execFmt("bold") },
    { icon: Italic,       label: "Italic",  action: () => execFmt("italic") },
    { icon: Strikethrough, label: "Strike", action: () => execFmt("strikeThrough") },
    "sep",
    { icon: List,         label: "Bullets", action: () => execFmt("insertUnorderedList") },
    { icon: ListOrdered,  label: "Numbers", action: () => execFmt("insertOrderedList") },
  ]

  function toggleGroup(g: string) {
    setOpenGroups((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]))
  }

  function toggleCarrier(id: number) {
    setLinkedCarrierIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleSave() {
    if (!templateName.trim()) {
      setNameError(true)
      return
    }
    setNameError(false)
    setError(null)
    setSaving(true)
    try {
      const payload = {
        row_id:             template.row_id,
        template_name:      templateName.trim(),
        type,
        subject:            isEmail ? subject || null : null,
        body:               getEditorHtml(),
        linked_carrier_ids: linkedCarrierIds,
        is_default:         isDefault,
      }
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      onSave()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:rounded-2xl" style={{ background: "var(--card-bg)" }}>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-4" style={{ background: "linear-gradient(135deg, #0f1e36 0%, #1a3352 60%, #1e3d5c 100%)" }}>
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-white">{template.row_id > 0 ? "Edit Template" : "New Template"}</h3>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: isEmail ? "rgba(59,130,246,0.25)" : "rgba(34,197,94,0.25)", color: isEmail ? "#93c5fd" : "#86efac" }}>
              {type}
            </span>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_260px]">

          {/* ── Left: editor ── */}
          <div className="flex flex-col overflow-y-auto">

            {/* Template name */}
            <div className="px-5 pt-4 pb-3" style={{ borderBottom: "1px solid var(--divider)" }}>
              <div className="relative">
                <input
                  value={templateName}
                  onChange={(e) => { setTemplateName(e.target.value); if (e.target.value.trim()) setNameError(false) }}
                  placeholder="Template name (required)"
                  className="h-10 w-full rounded-lg px-3 pr-24 text-sm font-semibold outline-none"
                  style={{
                    border: `1px solid ${nameError ? "#ef4444" : "var(--card-border)"}`,
                    background: nameError ? "rgba(239,68,68,0.04)" : "var(--card-bg)",
                    color: "var(--text-primary)",
                  }}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold" style={{ color: "#ef4444", opacity: nameError ? 1 : 0, transition: "opacity 0.15s" }}>
                  Required
                </span>
              </div>
              {isEmail && (
                <div className="mt-2 flex items-center gap-2 rounded-lg px-3 h-9" style={{ border: "1px solid var(--card-border)" }}>
                  <span className="text-xs font-medium shrink-0" style={{ color: "var(--text-muted)" }}>Subject:</span>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject line"
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: "var(--text-primary)" }}
                  />
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div className="shrink-0">
              <Toolbar items={isEmail ? emailTools : waTools} />
            </div>

            {/* Editable body */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex-1 p-5 text-sm leading-relaxed outline-none"
              style={{
                color: "var(--text-primary)",
                minHeight: 240,
                overflowY: "auto",
              }}
              data-placeholder="Start typing your message… or drag variables from the right panel."
            />

            {!isEmail && (
              <div className="px-5 pb-2 text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                {/* character count not tracked for contenteditable, show tip */}
                WhatsApp max 1,024 chars
              </div>
            )}

            {/* Carrier links + default + save */}
            <div className="shrink-0 px-5 py-4 space-y-3" style={{ borderTop: "1px solid var(--divider)" }}>
              {carriers.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Link to Carriers</p>
                  <div className="flex flex-wrap gap-1.5">
                    {carriers.map((c) => {
                      const on = linkedCarrierIds.includes(c.carrier_id)
                      return (
                        <button key={c.carrier_id} type="button" onClick={() => toggleCarrier(c.carrier_id)}
                          className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                          style={{
                            border: `1px solid ${on ? "var(--brand-accent)" : "var(--card-border)"}`,
                            background: on ? "rgba(232,130,26,0.08)" : "var(--card-bg)",
                            color: on ? "var(--brand-accent)" : "var(--text-secondary)",
                          }}>
                          {c.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-primary)" }}>
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--brand-accent)" }} />
                Set as Default Template
              </label>
              {error && (
                <p className="rounded-md px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>{error}</p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} disabled={saving}
                  className="rounded-lg px-4 py-2 text-sm font-medium"
                  style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)", background: "var(--card-bg)" }}>
                  Cancel
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "var(--brand-accent)" }}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Template
                </button>
              </div>
            </div>
          </div>

          {/* ── Right: variables ── */}
          <div className="flex flex-col overflow-y-auto" style={{ borderLeft: "1px solid var(--divider)", background: "var(--page-bg)" }}>
            <div className="shrink-0 px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--divider)" }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>Variables</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>Click to insert · Drag to body</p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {templateVariables.map((group) => {
                const open = openGroups.includes(group.group)
                return (
                  <div key={group.group}>
                    <button type="button" onClick={() => toggleGroup(group.group)}
                      className="flex w-full items-center gap-1.5 mb-1.5 text-[11px] font-bold uppercase tracking-wide"
                      style={{ color: "var(--text-secondary)" }}>
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {group.group}
                    </button>
                    {open && (
                      <div className="space-y-1.5 pl-1">
                        {group.vars.map(([name, label]) => (
                          <VarPill key={name} name={name} label={label} onInsert={insertVar} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* editor empty state placeholder via CSS */}
      <style>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: var(--text-muted);
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
