"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, Loader2, Mail, MessageCircle, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { TemplateEditor } from "@/components/portal/template-editor"
import { type Template, type TemplateRow } from "@/lib/portal-data"

type Tab = "All" | "Email" | "WhatsApp"
const tabs: Tab[] = ["All", "Email", "WhatsApp"]

function rowToTemplate(row: TemplateRow): Template {
  return {
    row_id: row.id,
    template_id: row.template_id,
    template_name: row.template_name,
    type: row.type,
    subject: row.subject,
    body: row.body,
    linked_carrier_ids: row.linked_carrier_ids,
    is_default: row.is_default,
    updated_at: row.updated_at,
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

export default function TemplatesPage() {
  const supabase = createClient()
  const [clientCode, setClientCode] = useState<string | null>(null)
  const [list, setList] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("All")
  const [editing, setEditing] = useState<Template | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    const cc = sessionStorage.getItem("portal_client_code")
    if (!cc) { setError("Session not initialised — refresh the page"); setLoading(false); return }
    setClientCode(cc)
    loadTemplates(cc)
  }, [])

  async function loadTemplates(cc: string) {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("client_code", cc)
      .order("template_id", { ascending: true })
    if (error) { setError(error.message); setLoading(false); return }
    setList((data ?? []).map(rowToTemplate))
    setLoading(false)
  }

  const filtered = useMemo(
    () => (tab === "All" ? list : list.filter((t) => t.type === tab)),
    [list, tab],
  )

  async function handleSave() {
    if (clientCode) await loadTemplates(clientCode)
    setEditorOpen(false)
    setEditing(null)
  }

  async function handleDuplicate(t: Template) {
    if (!clientCode) return
    // Get next template_id
    const { data: maxRow } = await supabase
      .from("templates")
      .select("template_id")
      .eq("client_code", clientCode)
      .order("template_id", { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextId = (maxRow?.template_id ?? 0) + 1

    const { error } = await supabase.from("templates").insert({
      client_code: clientCode,
      template_id: nextId,
      template_name: `${t.template_name} (Copy)`,
      type: t.type,
      subject: t.subject,
      body: t.body,
      linked_carrier_ids: t.linked_carrier_ids,
      is_default: false,
    })
    if (error) { setError(error.message); return }
    await loadTemplates(clientCode)
  }

  async function handleDelete(t: Template) {
    if (!clientCode) return
    const { error } = await supabase
      .from("templates")
      .delete()
      .eq("client_code", clientCode)
      .eq("template_id", t.template_id)
    if (error) { setError(error.message); return }
    setList((l) => l.filter((x) => x.template_id !== t.template_id))
  }

  function openNew(type: "Email" | "WhatsApp" = "Email") {
    setEditing({
      row_id: 0,
      template_id: 0,
      template_name: "",
      type,
      subject: type === "Email" ? "" : null,
      body: "",
      linked_carrier_ids: [],
      is_default: false,
      updated_at: new Date().toISOString(),
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
            disabled={!clientCode}
            className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] hover:bg-[#EA580C] disabled:opacity-50"
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
                {t.is_default && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF7ED] px-2 py-0.5 text-xs font-medium text-[#F97316] dark:bg-[#F97316]/10">
                    <Star className="h-3 w-3 fill-[#F97316]" /> Default
                  </span>
                )}
              </div>

              <h3 className="mt-3 font-semibold text-[#0D1B2A] dark:text-white">{t.template_name}</h3>
              {t.subject ? <p className="mt-0.5 truncate text-xs text-[#64748B]">{t.subject}</p> : null}
              <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-[#64748B]">{t.body}</p>

              <div className="mt-4 flex items-center justify-between border-t border-[#E2E8F0] pt-3 dark:border-[#1E3A5F]">
                <span className="text-xs text-[#94A3B8]">Updated {relativeTime(t.updated_at)}</span>
                <div className="flex items-center gap-1">
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

      {editorOpen && clientCode && editing && (
        <TemplateEditor
          template={editing}
          clientCode={clientCode}
          onClose={() => { setEditorOpen(false); setEditing(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
