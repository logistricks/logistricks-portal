"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, AlertTriangle, Bold, Code2, Download, Eraser, Eye, FileUp, Heading2, Italic, Link2,
  List, ListOrdered, Loader2, Minus, Palette, Pencil, Printer, Redo2, Search, Table2, Underline, Undo2, X,
} from "lucide-react"
import { type QuotationTemplate } from "@/lib/portal-data"
import { VARIABLE_GROUPS, RECOMMENDED_KEYS, DEFAULT_OPTIONS, normalizeOptions, type TemplateOptions } from "@/lib/quotation-variables"
import { findVariables, htmlDocument, renderTemplate, sampleContext } from "@/lib/quotation-render"
import { importDocxFile } from "@/lib/quotation-docx"
import { downloadQuotationPdf } from "@/lib/quotation-pdf"
import { STARTER_HTML, STARTER_SUBJECT } from "@/lib/quotation-starter"

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Old plain-text templates open as HTML so they can be edited in the rich editor. */
function textToHtml(text: string): string {
  return (text ?? "").split(/\n{2,}/).map((p) => `<p>${escHtml(p).replace(/\n/g, "<br>")}</p>`).join("")
}

type View = "edit" | "source" | "preview"
type Side = "variables" | "options"

const inputCls = "h-10 w-full rounded-md border px-3 text-sm outline-none"
const inputStyle = { borderColor: "var(--card-border)", background: "var(--input-bg, transparent)", color: "var(--text-primary)" } as const

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3">
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors ${on ? "bg-[#F97316]" : "bg-[#CBD5E1]"}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
      </button>
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
        {hint && <span className="block text-xs font-normal" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </span>
    </label>
  )
}

export function QuotationTemplateEditor({
  template, onClose, onSave,
}: {
  template: QuotationTemplate
  onClose: () => void
  onSave: () => void
}) {
  const isNew = !template.id
  const initialHtml = useMemo(() => {
    if (template.format === "html" && template.body_html) return template.body_html
    if (isNew && !template.body) return STARTER_HTML
    return textToHtml(template.body)
  }, [template, isNew])

  const [name, setName] = useState(template.template_name)
  const [description, setDescription] = useState(template.description ?? "")
  const [subject, setSubject] = useState(template.subject || (isNew ? STARTER_SUBJECT : ""))
  const [html, setHtml] = useState(initialHtml)
  const [mode, setMode] = useState<NonNullable<QuotationTemplate["applies_to_mode"]>>(template.applies_to_mode ?? "any")
  const [isDefault, setIsDefault] = useState(template.is_default)
  const [active, setActive] = useState(template.active)
  const [options, setOptions] = useState<TemplateOptions>(normalizeOptions(template.options))
  const [sourceFile, setSourceFile] = useState<string | null>(template.source_filename ?? null)

  const [view, setView] = useState<View>("edit")
  const [side, setSide] = useState<Side>("variables")
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const editorRef = useRef<HTMLDivElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const savedRange = useRef<Range | null>(null)
  const emailRef = useRef<HTMLTextAreaElement>(null)
  const lastFocus = useRef<"subject" | "body" | "email">("body")

  // Load HTML into the contentEditable whenever the edit view (re)opens.
  useEffect(() => {
    if (view === "edit" && editorRef.current) editorRef.current.innerHTML = html
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const readEditor = useCallback(() => {
    if (view === "edit" && editorRef.current) {
      const v = editorRef.current.innerHTML
      setHtml(v)
      return v
    }
    return html
  }, [view, html])

  function rememberSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && editorRef.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange()
  }

  function restoreSelection() {
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (sel && savedRange.current) { sel.removeAllRanges(); sel.addRange(savedRange.current) }
  }

  function exec(cmd: string, value?: string) {
    if (view !== "edit") return
    restoreSelection()
    document.execCommand(cmd, false, value)
    rememberSelection()
    readEditor()
  }

  function insertTable() {
    const cell = "border:1px solid #cbd5e1;padding:6px 8px"
    const row = `<tr><td style="${cell}">&nbsp;</td><td style="${cell}">&nbsp;</td><td style="${cell}">&nbsp;</td></tr>`
    exec("insertHTML", `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid #cbd5e1">${row}${row}${row}</table><p><br></p>`)
  }

  function insertVariable(key: string, block: boolean) {
    const token = `{{${key}}}`
    if (lastFocus.current === "email" && emailRef.current && !block && options.delivery === "pdf") {
      const el = emailRef.current
      const s = el.selectionStart ?? options.email_body.length, e = el.selectionEnd ?? options.email_body.length
      setOptions({ ...options, email_body: options.email_body.slice(0, s) + token + options.email_body.slice(e) })
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length) })
      return
    }
    if (lastFocus.current === "subject" && subjectRef.current && !block) {
      const el = subjectRef.current
      const s = el.selectionStart ?? subject.length, e = el.selectionEnd ?? subject.length
      setSubject(subject.slice(0, s) + token + subject.slice(e))
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length) })
      return
    }
    if (view === "source") { setHtml((h) => `${h}${block ? "\n" : ""}${token}`); return }
    if (view === "preview") return
    exec("insertHTML", block ? `<p>${token}</p>` : token)
  }

  function insertIf(kind: "if" | "unless") {
    const key = window.prompt(`Show this block only when which variable ${kind === "if" ? "has a value" : "is empty"}? (e.g. free_days)`)?.trim()
    if (!key) return
    exec("insertHTML", `{{#${kind} ${key}}}…{{/${kind}}}`)
  }

  async function handleImport(file: File | undefined) {
    if (!file) return
    setError(null); setNotice(null); setImporting(true)
    try {
      const r = await importDocxFile(file)
      setHtml(r.html)
      if (editorRef.current && view === "edit") editorRef.current.innerHTML = r.html
      setSourceFile(file.name)
      if (!name.trim()) setName(file.name.replace(/\.docx$/i, ""))
      setNotice(
        `Imported "${file.name}". ${r.converted > 0 ? `${r.converted} bracketed placeholder${r.converted === 1 ? "" : "s"} were converted to variables. ` : "No bracketed placeholders were found — add variables from the list. "}` +
        `Word colours, fonts and page layout aren't carried over; use the options tab to restyle.` +
        (r.warnings.length ? ` Notes: ${r.warnings.join("; ")}` : ""),
      )
    } catch (e) { setError((e as Error).message) }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = "" }
  }

  const { used, unknown } = useMemo(() => findVariables(subject, html, options.delivery === "pdf" ? options.email_body : ""), [subject, html, options.delivery, options.email_body])
  const missingRecommended = !RECOMMENDED_KEYS.some((k) => used.includes(k))

  const previewDoc = useMemo(() => {
    if (view !== "preview") return ""
    const ctx = sampleContext(options)
    return htmlDocument(renderTemplate(html, ctx, "html"), options)
  }, [view, html, options])

  const previewEmail = useMemo(() => options.delivery === "pdf" ? renderTemplate(options.email_body || "Dear {{sender_first_name}},\n\nPlease find our quotation {{quotation_number}} attached.\n\nBest regards,\n{{prepared_by}}", sampleContext(options), "text") : "", [options])
  const previewSubject = useMemo(() => renderTemplate(subject, sampleContext(options), "text"), [subject, options])

  function switchView(next: View) {
    if (next === view) return
    readEditor()
    setView(next)
  }

  function printPreview() {
    const w = window.open("", "_blank")
    if (!w) { setError("Pop-up blocked — allow pop-ups to print."); return }
    w.document.write(htmlDocument(renderTemplate(html, sampleContext(options), "html"), options))
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return VARIABLE_GROUPS
    return VARIABLE_GROUPS.map((g) => ({
      ...g, vars: g.vars.filter((v) => v.key.includes(q) || v.label.toLowerCase().includes(q)),
    })).filter((g) => g.vars.length)
  }, [query])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const finalHtml = readEditor()
    if (!name.trim()) { setError("Give the template a name."); return }
    setSaving(true)
    try {
      const payload = {
        template_name: name.trim(), description, subject, format: "html", body_html: finalHtml,
        applies_to_mode: mode, is_default: isDefault && active, active, options, source_filename: sourceFile,
      }
      const res = await fetch("/api/quotation-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
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

  const tbtn = "flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--table-header-bg)] disabled:opacity-40"
  const tools: { icon: React.ElementType; label: string; run: () => void }[] = [
    { icon: Undo2, label: "Undo", run: () => exec("undo") },
    { icon: Redo2, label: "Redo", run: () => exec("redo") },
    { icon: Heading2, label: "Heading", run: () => exec("formatBlock", "h3") },
    { icon: Bold, label: "Bold", run: () => exec("bold") },
    { icon: Italic, label: "Italic", run: () => exec("italic") },
    { icon: Underline, label: "Underline", run: () => exec("underline") },
    { icon: List, label: "Bulleted list", run: () => exec("insertUnorderedList") },
    { icon: ListOrdered, label: "Numbered list", run: () => exec("insertOrderedList") },
    { icon: AlignLeft, label: "Align left", run: () => exec("justifyLeft") },
    { icon: AlignCenter, label: "Align centre", run: () => exec("justifyCenter") },
    { icon: AlignRight, label: "Align right", run: () => exec("justifyRight") },
    { icon: AlignJustify, label: "Justify", run: () => exec("justifyFull") },
    { icon: Link2, label: "Link", run: () => { const u = window.prompt("Link address (https://…)"); if (u && /^(https?:|mailto:)/i.test(u)) exec("createLink", u) } },
    { icon: Table2, label: "Insert table", run: insertTable },
    { icon: Minus, label: "Divider", run: () => exec("insertHorizontalRule") },
    { icon: Eraser, label: "Clear formatting", run: () => exec("removeFormat") },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:rounded-2xl" style={{ background: "var(--card-bg)" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ background: "var(--brand-primary-dark, #0D1B2A)" }}>
          <h3 className="font-semibold text-white">{isNew ? "New Quotation Template" : "Edit Quotation Template"}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[1fr_320px] lg:overflow-hidden">
            {/* ── main column ─────────────────────────────────────────── */}
            <div className="flex min-h-0 flex-col gap-3 p-5 lg:overflow-y-auto">
              {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>}
              {notice && <p className="rounded-md px-4 py-3 text-sm" style={{ background: "rgba(34,197,94,0.1)", color: "var(--text-primary)" }}>{notice}</p>}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>Template name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} style={inputStyle} placeholder="e.g. Sea freight — standard" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>Use for</label>
                  <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className={inputCls} style={inputStyle}>
                    <option value="any">Any mode (general)</option>
                    <option value="sea">Sea freight quotes</option>
                    <option value="air">Air freight quotes</option>
                    <option value="land">Land / trucking quotes</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>How is it sent?</label>
                <select value={options.delivery} onChange={(e) => setOptions({ ...options, delivery: e.target.value as TemplateOptions["delivery"] })} className={inputCls} style={inputStyle}>
                  <option value="email_html">Formatted email — this template is the email</option>
                  <option value="pdf">PDF attachment — this template is the PDF, with a separate email text</option>
                  <option value="email_text">Plain-text email — no formatting</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>Description <span className="font-normal" style={{ color: "var(--text-muted)" }}>(for your team, not shown to customers)</span></label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className={inputCls} style={inputStyle} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>Email subject</label>
                <input ref={subjectRef} value={subject} onChange={(e) => setSubject(e.target.value)} onFocus={() => { lastFocus.current = "subject" }}
                  placeholder="Quotation {{quotation_number}} — {{origin}} to {{destination}}" className={inputCls} style={inputStyle} />
              </div>

              {/* view switch + import */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--card-border)" }}>
                  {([["edit", "Edit", Pencil], ["source", "HTML", Code2], ["preview", "Preview", Eye]] as const).map(([v, label, Icon]) => (
                    <button key={v} type="button" onClick={() => switchView(v)}
                      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
                      style={view === v ? { background: "var(--text-primary)", color: "#fff" } : { color: "var(--text-secondary)" }}>
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {view === "preview" && (
                    <button type="button" onClick={async () => { setPdfBusy(true); try { await downloadQuotationPdf(renderTemplate(html, sampleContext(options), "html"), "Quotation preview", options.page_size) } catch { setError("Couldn't create the PDF.") } finally { setPdfBusy(false) } }}
                      disabled={pdfBusy} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                      {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download PDF
                    </button>
                  )}
                  {view === "preview" && (
                    <button type="button" onClick={printPreview} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                      <Printer className="h-3.5 w-3.5" /> Print / PDF
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={(e) => handleImport(e.target.files?.[0])} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={importing}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                    {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />} Import Word (.docx)
                  </button>
                </div>
              </div>

              {view === "edit" && (
                <div className="flex flex-wrap items-center gap-0.5 rounded-md border p-1" style={{ borderColor: "var(--card-border)" }}>
                  {tools.map((t) => (
                    <button key={t.label} type="button" title={t.label} aria-label={t.label} className={tbtn}
                      onMouseDown={(e) => e.preventDefault()} onClick={t.run}>
                      <t.icon className="h-4 w-4" />
                    </button>
                  ))}
                  <label title="Text colour" className={`${tbtn} relative cursor-pointer`}>
                    <Palette className="h-4 w-4" />
                    <input type="color" defaultValue="#0D1B2A" className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      onMouseDown={() => rememberSelection()} onChange={(e) => exec("foreColor", e.target.value)} />
                  </label>
                  <span className="mx-1 h-5 w-px" style={{ background: "var(--divider)" }} />
                  <button type="button" className="rounded-md px-2 py-1 text-[11px] font-semibold hover:bg-[var(--table-header-bg)]" style={{ color: "var(--text-secondary)" }} onMouseDown={(e) => e.preventDefault()} onClick={() => insertIf("if")}>+ If</button>
                  <button type="button" className="rounded-md px-2 py-1 text-[11px] font-semibold hover:bg-[var(--table-header-bg)]" style={{ color: "var(--text-secondary)" }} onMouseDown={(e) => e.preventDefault()} onClick={() => insertIf("unless")}>+ Unless</button>
                </div>
              )}

              {view === "edit" && (
                <div ref={editorRef} contentEditable suppressContentEditableWarning
                  onInput={() => { rememberSelection(); setHtml(editorRef.current?.innerHTML ?? "") }}
                  onKeyUp={rememberSelection} onMouseUp={rememberSelection} onBlur={rememberSelection}
                  onFocus={() => { lastFocus.current = "body" }}
                  className="min-h-[360px] flex-1 overflow-y-auto rounded-md border bg-white p-5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/40 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-bold [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:ml-5 [&_ul]:list-disc [&_a]:text-blue-700 [&_a]:underline"
                  style={{ borderColor: "var(--card-border)", fontFamily: options.font_family }} />
              )}

              {view === "source" && (
                <textarea value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false}
                  className="min-h-[360px] flex-1 rounded-md border p-3 font-mono text-xs outline-none" style={inputStyle} />
              )}

              {view === "preview" && (
                <div className="flex min-h-[360px] flex-1 flex-col gap-2">
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Preview with sample data · Subject: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{previewSubject || "—"}</span></p>
                  <iframe title="Preview" sandbox="" srcDoc={previewDoc} className="min-h-[420px] w-full flex-1 rounded-md border bg-white" style={{ borderColor: "var(--card-border)" }} />
                  {options.delivery === "pdf" && (
                    <div>
                      <p className="mb-1 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Email text sent with the PDF</p>
                      <pre className="whitespace-pre-wrap rounded-md border p-3 text-xs" style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}>{previewEmail}</pre>
                    </div>
                  )}
                </div>
              )}

              {options.delivery === "pdf" && (
                <div>
                  <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Email text <span className="font-normal" style={{ color: "var(--text-muted)" }}>(the message that goes with the PDF — the template above becomes the PDF)</span>
                  </label>
                  <textarea ref={emailRef} value={options.email_body} rows={7} onFocus={() => { lastFocus.current = "email" }}
                    onChange={(e) => setOptions({ ...options, email_body: e.target.value })}
                    placeholder={"Dear {{sender_first_name|Sir/Madam}},\n\nPlease find attached our quotation {{quotation_number}} for {{origin}} to {{destination}}.\n\nBest regards,\n{{prepared_by}}\n{{company_name}}"}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none" style={inputStyle} />
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>Click a variable on the right to insert it here. Leave empty to use a short default message.</p>
                </div>
              )}

              {(unknown.length > 0 || missingRecommended) && (
                <div className="space-y-1 rounded-md px-3 py-2.5 text-xs" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--text-primary)" }}>
                  {unknown.length > 0 && (
                    <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Unknown variable{unknown.length > 1 ? "s" : ""}: {unknown.map((u) => `{{${u}}}`).join(", ")} — they will print blank. Check the spelling against the list.</p>
                  )}
                  {missingRecommended && (
                    <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      The price isn't in this template. Add {"{{charges_table}}"}, {"{{summary_table}}"} or {"{{final_price_with_currency}}"}.</p>
                  )}
                </div>
              )}
            </div>

            {/* ── side column ─────────────────────────────────────────── */}
            <aside className="flex min-h-0 flex-col border-t lg:border-l lg:border-t-0" style={{ borderColor: "var(--divider)" }}>
              <div className="flex border-b" style={{ borderColor: "var(--divider)" }}>
                {(["variables", "options"] as Side[]).map((s) => (
                  <button key={s} type="button" onClick={() => setSide(s)} className="flex-1 px-3 py-2.5 text-xs font-semibold capitalize"
                    style={side === s ? { color: "var(--brand-accent)", borderBottom: "2px solid var(--brand-accent)" } : { color: "var(--text-secondary)" }}>
                    {s === "variables" ? "Variables" : "Options & settings"}
                  </button>
                ))}
              </div>

              {side === "variables" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="p-3">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: "var(--text-muted)" }} />
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search variables…" className="h-9 w-full rounded-md border pl-8 pr-3 text-sm outline-none" style={inputStyle} />
                    </div>
                    <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                      Click to insert at the cursor. Use <code>{"{{name|fallback}}"}</code> for a default value.
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4 lg:max-h-none max-h-72">
                    {filteredGroups.map((g) => (
                      <div key={g.id}>
                        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{g.label}</p>
                        {g.description && <p className="mb-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{g.description}</p>}
                        <div className="flex flex-wrap gap-1.5">
                          {g.vars.map((v) => (
                            <button key={v.key} type="button" onMouseDown={(e) => e.preventDefault()}
                              onClick={() => insertVariable(v.key, v.kind === "block")}
                              title={`${v.label}${v.example ? ` — e.g. ${v.example}` : ""}${v.note ? `\n${v.note}` : ""}`}
                              className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-[var(--brand-accent)]"
                              style={{ borderColor: used.includes(v.key) ? "var(--brand-accent)" : "var(--card-border)", color: "var(--text-secondary)", background: v.kind === "block" ? "var(--table-header-bg)" : undefined }}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {filteredGroups.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No variables match.</p>}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 overflow-y-auto p-4">
                  <Toggle on={isDefault} onChange={setIsDefault} label="Default template" hint="Only one default. Setting this replaces the current one." />
                  <Toggle on={active} onChange={setActive} label="Active" hint="Inactive templates are hidden when building a quotation." />

                  <div>
                    <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Charges table style</label>
                    <select value={options.charges_style} onChange={(e) => setOptions({ ...options, charges_style: e.target.value as TemplateOptions["charges_style"] })} className={inputCls} style={inputStyle}>
                      <option value="detailed">Carrier lines + a separate markup row</option>
                      <option value="marked_up">Markup spread across lines (one price per line)</option>
                      <option value="total_only">Total only</option>
                    </select>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>Applies to {"{{charges_table}}"}.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Markup row name</label>
                    <input value={options.markup_label} maxLength={60} onChange={(e) => setOptions({ ...options, markup_label: e.target.value })}
                      placeholder="Service fee" className={inputCls} style={inputStyle} />
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>The row that shows your markup in the charges table, e.g. Handling &amp; documentation, Agency fee, Service fee. If the markup is a percentage and ticked to show, it is added after the name: &ldquo;Service fee (10%)&rdquo;.</p>
                  </div>
                  <Toggle on={options.show_unit_rates} onChange={(v) => setOptions({ ...options, show_unit_rates: v })} label="Show unit rates" hint="Adds rate × quantity columns." />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Accent colour</label>
                      <input type="color" value={options.accent_color} onChange={(e) => setOptions({ ...options, accent_color: e.target.value })} className="h-10 w-full cursor-pointer rounded-md border p-1" style={{ borderColor: "var(--card-border)" }} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Valid for (days)</label>
                      <input type="number" min={1} max={365} value={options.validity_days ?? ""} placeholder="Carrier's"
                        onChange={(e) => setOptions({ ...options, validity_days: e.target.value ? Number(e.target.value) : null })} className={inputCls} style={inputStyle} />
                    </div>
                  </div>

                  {options.delivery === "pdf" && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>PDF page size</label>
                      <select value={options.page_size} onChange={(e) => setOptions({ ...options, page_size: e.target.value as TemplateOptions["page_size"] })} className={inputCls} style={inputStyle}>
                        <option value="a4">A4</option><option value="letter">US Letter</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Font</label>
                    <select value={options.font_family} onChange={(e) => setOptions({ ...options, font_family: e.target.value })} className={inputCls} style={inputStyle}>
                      {[
                        ["Arial, Helvetica, sans-serif", "Arial"], ["Calibri, Carlito, sans-serif", "Calibri"],
                        ["Georgia, serif", "Georgia"], ["'Times New Roman', Times, serif", "Times New Roman"], ["Tahoma, Verdana, sans-serif", "Tahoma"],
                      ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={() => setOptions(DEFAULT_OPTIONS)} className="text-xs font-semibold underline" style={{ color: "var(--text-secondary)" }}>Reset options</button>

                  {sourceFile && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Imported from {sourceFile}</p>}
                  {!isNew && (
                    <button type="button" onClick={() => { setHtml(STARTER_HTML); if (editorRef.current) editorRef.current.innerHTML = STARTER_HTML }}
                      className="text-xs font-semibold underline" style={{ color: "var(--text-secondary)" }}>Replace body with the starter layout</button>
                  )}
                </div>
              )}
            </aside>
          </div>

          <div className="flex items-center justify-end gap-3 border-t p-4" style={{ borderColor: "var(--divider)" }}>
            <button type="button" onClick={onClose} disabled={saving} className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--brand-accent)" }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save template
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
