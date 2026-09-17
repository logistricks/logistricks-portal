"use client"

import { useMemo, useState } from "react"
import { Copy, Mail, MessageCircle, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { TemplateEditor } from "@/components/portal/template-editor"
import { templates as seedTemplates, type Template, type TemplateType } from "@/lib/portal-data"

const tabs: (TemplateType | "All")[] = ["All", "Email", "WhatsApp"]

function emptyTemplate(type: TemplateType): Template {
  return {
    id: `t${Date.now()}`,
    name: "",
    type,
    subject: type === "Email" ? "" : undefined,
    body: "",
    linkedCarrierIds: [],
    isDefault: false,
    updatedRelative: "just now",
  }
}

export default function TemplatesPage() {
  const [list, setList] = useState<Template[]>(seedTemplates)
  const [tab, setTab] = useState<TemplateType | "All">("All")
  const [editing, setEditing] = useState<Template | null>(null)

  const filtered = useMemo(() => (tab === "All" ? list : list.filter((t) => t.type === tab)), [list, tab])

  function save(t: Template) {
    setList((l) => {
      const next = l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : x)) : [...l, t]
      if (t.isDefault) {
        return next.map((x) => (x.id !== t.id && x.type === t.type ? { ...x, isDefault: false } : x))
      }
      return next
    })
    setEditing(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-[#0D1B2A]">Message Templates</h2>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[#E2E8F0] bg-white p-0.5">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t ? "bg-[#F97316] text-white" : "text-[#64748B] hover:text-[#0D1B2A]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            onClick={() => setEditing(emptyTemplate(tab === "WhatsApp" ? "WhatsApp" : "Email"))}
            className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] hover:bg-[#EA580C]"
          >
            <Plus className="h-4 w-4" /> New Template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((t) => (
          <article
            key={t.id}
            className="flex flex-col rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                  t.type === "Email" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                }`}
              >
                {t.type === "Email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
              </span>
              {t.isDefault && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF7ED] px-2 py-0.5 text-xs font-medium text-[#F97316]">
                  <Star className="h-3 w-3 fill-[#F97316]" /> Default
                </span>
              )}
            </div>

            <h3 className="mt-3 font-semibold text-[#0D1B2A]">{t.name}</h3>
            {t.subject ? <p className="mt-0.5 truncate text-xs text-[#64748B]">{t.subject}</p> : null}
            <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-[#64748B]">{t.body}</p>

            <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-3">
              <span className="text-xs text-[#94A3B8]">Updated {t.updatedRelative}</span>
              <div className="flex items-center gap-1">
                <button
                  aria-label="Edit"
                  onClick={() => setEditing(t)}
                  className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-[#FFF7ED] hover:text-[#F97316]"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  aria-label="Duplicate"
                  onClick={() => setList((l) => [...l, { ...t, id: `t${Date.now()}`, name: `${t.name} (Copy)`, isDefault: false }])}
                  className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-[#FFF7ED] hover:text-[#F97316]"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  aria-label="Delete"
                  onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}
                  className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </article>
        ))}

        {/* Add card */}
        <button
          onClick={() => setEditing(emptyTemplate(tab === "WhatsApp" ? "WhatsApp" : "Email"))}
          className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#CBD5E1] bg-white/50 p-5 text-[#64748B] transition-colors hover:border-[#F97316] hover:text-[#F97316]"
        >
          <Plus className="h-8 w-8" />
          <span className="text-sm font-medium">Create New Template</span>
        </button>
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-[#64748B]">No {tab.toLowerCase()} templates yet.</p>
      )}

      {editing && <TemplateEditor template={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  )
}
