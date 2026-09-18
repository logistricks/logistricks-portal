"use client"

import { useRef, useState } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Smile,
  Strikethrough,
  Underline,
  X,
} from "lucide-react"
import { carriers, templateVariables, type Template } from "@/lib/portal-data"

export function TemplateEditor({
  template,
  onClose,
  onSave,
}: {
  template: Template
  onClose: () => void
  onSave: (t: Template) => void
}) {
  const [form, setForm] = useState<Template>(template)
  const [openGroups, setOpenGroups] = useState<string[]>(templateVariables.map((g) => g.group))
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const isEmail = form.type === "Email"

  function insertVar(name: string) {
    const el = bodyRef.current
    const token = `{{${name}}}`
    if (!el) {
      setForm((f) => ({ ...f, body: f.body + token }))
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = form.body.slice(0, start) + token + form.body.slice(end)
    setForm((f) => ({ ...f, body: next }))
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + token.length
    })
  }

  function toggleGroup(g: string) {
    setOpenGroups((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]))
  }

  function toggleCarrier(id: string) {
    setForm((f) => ({
      ...f,
      linkedCarrierIds: f.linkedCarrierIds.includes(id)
        ? f.linkedCarrierIds.filter((x) => x !== id)
        : [...f.linkedCarrierIds, id],
    }))
  }

  const emailTools = [Bold, Italic, Underline, "|", Heading1, Heading2, "|", List, ListOrdered, "|", Link2, "|", AlignLeft, AlignCenter, AlignRight]
  const waTools = [Bold, Italic, Strikethrough, "|", Smile]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl duration-200 animate-in fade-in zoom-in-95 dark:bg-[#111E33] sm:rounded-2xl">
        <div className="flex items-center justify-between bg-[#0D1B2A] px-6 py-4">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-white">{template.name ? "Edit Template" : "Create Template"}</h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isEmail ? "bg-blue-500/20 text-blue-200" : "bg-green-500/20 text-green-200"
              }`}
            >
              {form.type}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-3">
          {/* Editor column */}
          <div className="flex flex-col overflow-y-auto p-5 lg:col-span-2">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Template name..."
              className="mb-4 w-full border-0 border-b border-[#E2E8F0] bg-transparent pb-2 text-lg font-bold text-[#0D1B2A] outline-none placeholder:text-[#94A3B8] focus:border-[#F97316] dark:border-[#1E3A5F] dark:text-white"
            />

            {isEmail && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-[#E2E8F0] px-3 dark:border-[#1E3A5F]">
                <span className="text-sm font-medium text-[#64748B]">Subject:</span>
                <input
                  value={form.subject ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Email subject line"
                  className="h-10 flex-1 border-0 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8] dark:text-[#E2E8F0]"
                />
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-[#E2E8F0] bg-[#F8FAFC] p-1.5 dark:border-[#1E3A5F] dark:bg-[#0D1B2A]">
              {(isEmail ? emailTools : waTools).map((T, i) =>
                T === "|" ? (
                  <span key={i} className="mx-1 h-5 w-px bg-[#E2E8F0] dark:bg-[#1E3A5F]" />
                ) : (
                  <button
                    key={i}
                    type="button"
                    className="rounded p-1.5 text-[#64748B] transition-colors hover:bg-white hover:text-[#0D1B2A] dark:hover:bg-[#1E3A5F] dark:hover:text-white"
                  >
                    {(() => {
                      const Icon = T as React.ComponentType<{ className?: string }>
                      return <Icon className="h-4 w-4" />
                    })()}
                  </button>
                ),
              )}
            </div>

            <textarea
              ref={bodyRef}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              className="min-h-64 flex-1 resize-none rounded-b-md border border-t-0 border-[#E2E8F0] bg-white p-4 text-sm leading-relaxed text-[#0F172A] outline-none focus:border-[#F97316] dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0]"
            />

            {!isEmail && (
              <div className="mt-2 text-right text-xs tabular-nums text-[#64748B]">{form.body.length} / 1024</div>
            )}

            {/* Rendered variable pill preview */}
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Preview</p>
              <div className="rounded-md border border-[#E2E8F0] bg-white p-3 text-sm leading-relaxed text-[#0F172A] dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0]">
                {renderPills(form.body)}
              </div>
            </div>
          </div>

          {/* Variable panel */}
          <div className="flex flex-col overflow-y-auto border-t border-[#E2E8F0] bg-[#F8FAFC] p-4 dark:border-[#1E3A5F] dark:bg-[#0D1B2A]/50 lg:border-l lg:border-t-0">
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Available Variables</p>
            <p className="mb-3 text-xs text-[#94A3B8]">Click to insert at cursor</p>
            <div className="space-y-3">
              {templateVariables.map((group) => {
                const open = openGroups.includes(group.group)
                return (
                  <div key={group.group}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.group)}
                      className="flex w-full items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#0D1B2A] dark:text-[#94A3B8]"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
                      {group.group}
                    </button>
                    {open && (
                      <div className="mt-2 space-y-1">
                        {group.vars.map(([name, label]) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => insertVar(name)}
                            className="flex w-full items-center justify-between rounded border border-transparent px-3 py-2 text-left transition-colors hover:border-[#E2E8F0] hover:bg-white dark:hover:border-[#1E3A5F] dark:hover:bg-[#1E3A5F]/30"
                          >
                            <code className="text-xs font-medium text-[#F97316]">{`{{${name}}}`}</code>
                            <span className="text-xs text-[#64748B]">{label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-4 border-t border-[#E2E8F0] p-4 dark:border-[#1E3A5F] lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Link to Carriers</p>
            <div className="flex flex-wrap gap-2">
              {carriers.map((c) => {
                const on = form.linkedCarrierIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCarrier(c.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      on
                        ? "border-[#F97316] bg-[#FFF7ED] text-[#F97316] dark:bg-[#F97316]/10"
                        : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#F97316]/40 dark:border-[#1E3A5F] dark:bg-transparent"
                    }`}
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-[#0F172A] dark:text-[#E2E8F0]">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                className="h-4 w-4 accent-[#F97316]"
              />
              Set as Default Template
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:border-[#F97316]/40 dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(form)}
              className="rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#EA580C]"
            >
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function renderPills(body: string) {
  const parts = body.split(/(\{\{\w+\}\})/g)
  return parts.map((p, i) =>
    /^\{\{\w+\}\}$/.test(p) ? (
      <span
        key={i}
        className="mx-0.5 inline-flex rounded bg-[#FFF7ED] px-1.5 py-0.5 align-baseline text-xs font-medium text-[#F97316] dark:bg-[#F97316]/10"
      >
        {p}
      </span>
    ) : (
      <span key={i} className="whitespace-pre-wrap">
        {p}
      </span>
    ),
  )
}
