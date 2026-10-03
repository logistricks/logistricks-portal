"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle, AlignCenter, AlignLeft, AlignRight, Bold, CheckCircle2, ClipboardCheck, Code2, Eraser, Eye, FileText, Heading2,
  Inbox, Italic, Link2, List, ListOrdered, Loader2, Minus, Palette, Pencil, Redo2, Reply, RotateCcw, Search, Send, Server, Table2, Underline, Undo2,
} from "lucide-react"
import { findVariables, renderTemplate } from "@/lib/quotation-render"
import {
  NOTIFICATION_EVENTS, ROLE_OPTIONS, emailDocument, eventGroups, eventVarKeys, normalizeRecipients, sampleBlocks, sampleValues,
  type NotificationEvent, type Recipients,
} from "@/lib/notification-events"

type SavedRow = { event_key: string; enabled: boolean; subject: string; body_html: string; recipients: Recipients; updated_at?: string; updated_by?: string }
type LogRow = { id: number; event_key: string; to_emails: string[]; subject: string | null; status: "sent" | "failed" | "skipped"; error: string | null; created_at: string }
type Draft = { enabled: boolean; subject: string; html: string; recipients: Recipients }
type View = "edit" | "source" | "preview"
type Side = "variables" | "recipients" | "activity"

const ICONS: Record<NotificationEvent["icon"], React.ElementType> = { inbox: Inbox, reply: Reply, quote: FileText, alert: AlertTriangle, approval: ClipboardCheck, decision: CheckCircle2 }
const inputCls = "h-10 w-full rounded-md border px-3 text-sm outline-none"
const inputStyle = { borderColor: "var(--card-border)", background: "var(--input-bg, transparent)", color: "var(--text-primary)" } as const
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

function Toggle({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-3">
      <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#F97316]" : "bg-[#CBD5E1]"}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
      </button>
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {label}
        {hint && <span className="block text-xs font-normal" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      </span>
    </label>
  )
}

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function NotificationTemplatesPanel({ onOpenSmtp }: { onOpenSmtp?: () => void }) {
  const [rows, setRows] = useState<Record<string, SavedRow>>({})
  const [log, setLog] = useState<LogRow[]>([])
  const [smtp, setSmtp] = useState<{ configured: boolean; enabled: boolean }>({ configured: false, enabled: false })
  const [role, setRole] = useState("viewer")
  const [migrated, setMigrated] = useState(true)
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<string>(NOTIFICATION_EVENTS[0].key)
  const ev = useMemo(() => NOTIFICATION_EVENTS.find((e) => e.key === selected)!, [selected])
  const canEdit = role === "admin"

  const fromRow = useCallback((e: NotificationEvent, r?: SavedRow): Draft => ({
    enabled: r ? r.enabled : true,
    subject: r?.subject || e.defaultSubject,
    html: r?.body_html || e.defaultHtml,
    recipients: normalizeRecipients(r?.recipients, e.defaultRecipients),
  }), [])

  const [draft, setDraft] = useState<Draft>(() => fromRow(NOTIFICATION_EVENTS[0]))
  const [base, setBase] = useState<string>("")  // JSON of the last saved/loaded draft, to detect unsaved changes
  const [view, setView] = useState<View>("edit")
  const [side, setSide] = useState<Side>("variables")
  const [query, setQuery] = useState("")
  const [extraText, setExtraText] = useState("")
  const [saving, setSaving] = useState(false)
  const [testTo, setTestTo] = useState("")
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const editorRef = useRef<HTMLDivElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const savedRange = useRef<Range | null>(null)
  const lastFocus = useRef<"subject" | "body">("body")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notification-templates")
      if (!res.ok) return
      const d = await res.json()
      const map: Record<string, SavedRow> = {}
      for (const r of d.rows ?? []) map[r.event_key] = r
      setRows(map); setLog(d.log ?? []); setSmtp(d.smtp ?? { configured: false, enabled: false }); setRole(d.role ?? "viewer"); setMigrated(d.migrated !== false)
      return map
    } finally { setLoading(false) }
  }, [])

  // Load the draft whenever the event (or the saved data) changes.
  const open = useCallback((key: string, map: Record<string, SavedRow>) => {
    const e = NOTIFICATION_EVENTS.find((x) => x.key === key)!
    const d = fromRow(e, map[key])
    setSelected(key); setDraft(d); setBase(JSON.stringify(d)); setView("edit"); setError(null); setNotice(null)
    setExtraText(d.recipients.extra.join(", "))
    requestAnimationFrame(() => { if (editorRef.current) editorRef.current.innerHTML = d.html })
  }, [fromRow])

  useEffect(() => { load().then((m) => open(selected, m ?? {})) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  useEffect(() => {
    if (view === "edit" && editorRef.current) editorRef.current.innerHTML = draft.html
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const readEditor = useCallback(() => {
    if (view === "edit" && editorRef.current) { const v = editorRef.current.innerHTML; setDraft((d) => ({ ...d, html: v })); return v }
    return draft.html
  }, [view, draft.html])

  const dirty = JSON.stringify(draft) !== base
  const isCustom = !!rows[selected]

  function choose(key: string) {
    if (key === selected) return
    if (dirty && !window.confirm("You have unsaved changes to this email. Switch anyway and lose them?")) return
    open(key, rows)
  }

  function rememberSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && editorRef.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange()
  }
  function exec(cmd: string, value?: string) {
    if (view !== "edit" || !canEdit) return
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (sel && savedRange.current) { sel.removeAllRanges(); sel.addRange(savedRange.current) }
    document.execCommand(cmd, false, value)
    rememberSelection(); readEditor()
  }
  function insertTable() {
    const cell = "border:1px solid #cbd5e1;padding:6px 8px"
    const r = `<tr><td style="${cell}">&nbsp;</td><td style="${cell}">&nbsp;</td></tr>`
    exec("insertHTML", `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid #cbd5e1">${r}${r}</table><p><br></p>`)
  }
  function insertVariable(key: string, block: boolean) {
    if (!canEdit) return
    const token = `{{${key}}}`
    if (lastFocus.current === "subject" && subjectRef.current && !block) {
      const el = subjectRef.current
      const s = el.selectionStart ?? draft.subject.length, e = el.selectionEnd ?? draft.subject.length
      setDraft((d) => ({ ...d, subject: d.subject.slice(0, s) + token + d.subject.slice(e) }))
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length) })
      return
    }
    if (view === "source") { setDraft((d) => ({ ...d, html: `${d.html}${token}` })); return }
    if (view === "preview") return
    exec("insertHTML", block ? `<p>${token}</p>` : token)
  }
  function insertIf(kind: "if" | "unless") {
    const key = window.prompt(`Show this block only when which variable ${kind === "if" ? "has a value" : "is empty"}? (e.g. missing_fields)`)?.trim()
    if (key) exec("insertHTML", `{{#${kind} ${key}}}…{{/${kind}}}`)
  }

  const known = useMemo(() => eventVarKeys(ev), [ev])
  const { unknown } = useMemo(() => findVariables(draft.subject, draft.html), [draft.subject, draft.html])
  const unknownHere = unknown.filter((u) => !known.has(u))
  const usedKeys = useMemo(() => new Set(findVariables(draft.subject, draft.html).used), [draft.subject, draft.html])

  const sample = useMemo(() => ({ values: sampleValues(ev), blocks: sampleBlocks(ev) }), [ev])
  const previewDoc = useMemo(() => (view === "preview" ? emailDocument(renderTemplate(draft.html, sample, "html")) : ""), [view, draft.html, sample])
  const previewSubject = useMemo(() => renderTemplate(draft.subject, sample, "text"), [draft.subject, sample])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = eventGroups(ev)
    if (!q) return all
    return all.map((g) => ({ ...g, vars: g.vars.filter((v) => v.key.includes(q) || v.label.toLowerCase().includes(q)) })).filter((g) => g.vars.length)
  }, [ev, query])

  function setExtra(text: string) {
    setExtraText(text)
    const list = text.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)
    setDraft((d) => ({ ...d, recipients: { ...d.recipients, extra: list.filter((x) => EMAIL_RE.test(x)) } }))
  }
  const badExtra = extraText.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x && !EMAIL_RE.test(x))

  async function save() {
    setError(null); setNotice(null)
    const html = readEditor()
    if (badExtra.length) { setError(`These aren't valid email addresses: ${badExtra.join(", ")}`); return }
    setSaving(true)
    try {
      const res = await fetch("/api/notification-templates", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_key: selected, enabled: draft.enabled, subject: draft.subject, body_html: html, recipients: draft.recipients }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `Server error ${res.status}`)
      const map = (await load()) ?? rows
      const nd = fromRow(ev, map[selected]); setDraft(nd); setBase(JSON.stringify(nd))
      if (editorRef.current && view === "edit") editorRef.current.innerHTML = nd.html
      setNotice("Saved.")
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  async function reset() {
    if (!window.confirm("Replace this email with the built-in default? Your changes to it will be lost.")) return
    setError(null); setNotice(null)
    const res = await fetch(`/api/notification-templates?event_key=${selected}`, { method: "DELETE" })
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Couldn't reset."); return }
    const map = (await load()) ?? {}
    open(selected, map); setNotice("Back to the default.")
  }

  async function sendTest() {
    setError(null); setNotice(null); setTesting(true)
    try {
      const res = await fetch("/api/notification-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", event_key: selected, subject: draft.subject, body_html: readEditor(), to: testTo || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) throw new Error(d.error ?? "The test email couldn't be sent.")
      setNotice(`Test email sent to ${d.to} using sample data.`)
    } catch (e) { setError((e as Error).message) } finally { setTesting(false) }
  }

  const tbtn = "flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--table-header-bg)] disabled:opacity-40"
  const tools: { icon: React.ElementType; label: string; run: () => void }[] = [
    { icon: Undo2, label: "Undo", run: () => exec("undo") }, { icon: Redo2, label: "Redo", run: () => exec("redo") },
    { icon: Heading2, label: "Heading", run: () => exec("formatBlock", "h3") }, { icon: Bold, label: "Bold", run: () => exec("bold") },
    { icon: Italic, label: "Italic", run: () => exec("italic") }, { icon: Underline, label: "Underline", run: () => exec("underline") },
    { icon: List, label: "Bulleted list", run: () => exec("insertUnorderedList") }, { icon: ListOrdered, label: "Numbered list", run: () => exec("insertOrderedList") },
    { icon: AlignLeft, label: "Align left", run: () => exec("justifyLeft") }, { icon: AlignCenter, label: "Align centre", run: () => exec("justifyCenter") }, { icon: AlignRight, label: "Align right", run: () => exec("justifyRight") },
    { icon: Link2, label: "Link", run: () => { const u = window.prompt("Link address (https://… or {{request_url}})"); if (u && /^(https?:|mailto:|\{\{)/i.test(u)) exec("createLink", u) } },
    { icon: Table2, label: "Insert table", run: insertTable }, { icon: Minus, label: "Divider", run: () => exec("insertHorizontalRule") },
    { icon: Eraser, label: "Clear formatting", run: () => exec("removeFormat") },
  ]

  const evLog = log.filter((l) => l.event_key === selected)
  const sections = (["Requests", "Carriers", "Approvals"] as const).map((g) => ({ g, items: NOTIFICATION_EVENTS.filter((e) => e.group === g) }))

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--text-muted)" }} /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Notification templates</h2>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>One email for each thing the portal tells your team about. Pick one on the left and edit it like a quotation template.</p>
        </div>
        <button type="button" onClick={onOpenSmtp} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
          style={{ borderColor: smtp.configured && smtp.enabled ? "rgba(34,197,94,0.4)" : "rgba(245,158,11,0.5)", color: "var(--text-primary)", background: smtp.configured && smtp.enabled ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.1)" }}>
          <Server className="h-3.5 w-3.5" />
          {smtp.configured && smtp.enabled ? "Email server connected" : smtp.configured ? "Email server switched off" : "Set up the email server to start sending"}
        </button>
      </div>

      {!migrated && <p className="rounded-md px-4 py-3 text-sm" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--text-primary)" }}>The database update for email notifications (migration 046) hasn&apos;t been run yet, so changes can&apos;t be saved.</p>}

      <div className="grid gap-4 lg:grid-cols-[272px_1fr]">
        {/* ── navigator ── */}
        <nav className="space-y-4 lg:sticky lg:top-4 lg:self-start" aria-label="Notification types">
          {sections.map(({ g, items }) => (
            <div key={g}>
              <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{g}</p>
              <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
                {items.map((e) => {
                  const Icon = ICONS[e.icon]
                  const on = selected === e.key
                  const row = rows[e.key]
                  const enabled = on ? draft.enabled : row ? row.enabled : true
                  return (
                    <button key={e.key} type="button" onClick={() => choose(e.key)} aria-current={on}
                      className="flex min-w-[220px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all lg:min-w-0"
                      style={{ borderColor: on ? "var(--brand-accent)" : "var(--card-border)", background: on ? "rgba(232,130,26,0.08)" : "var(--card-bg)", boxShadow: on ? "0 0 0 1px var(--brand-accent)" : undefined }}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: on ? "var(--brand-accent)" : "var(--table-header-bg)", color: on ? "#fff" : "var(--text-secondary)" }}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{e.label}</span>
                        <span className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{e.short}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="h-2 w-2 rounded-full" title={enabled ? "On" : "Off"} style={{ background: enabled ? "#22c55e" : "#cbd5e1" }} />
                        {row && <span className="rounded px-1 text-[9px] font-bold uppercase" style={{ background: "var(--table-header-bg)", color: "var(--text-muted)" }}>Edited</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── editor ── */}
        <div className="min-w-0 overflow-hidden rounded-xl border" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5" style={{ background: "var(--brand-primary-dark, #0D1B2A)" }}>
            <div className="min-w-0">
              <h3 className="font-semibold text-white">{ev.label}</h3>
              <p className="text-xs text-white/60">{ev.when}</p>
            </div>
            <div className="shrink-0">
              <button type="button" role="switch" aria-checked={draft.enabled} disabled={!canEdit} onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                <span className="h-2 w-2 rounded-full" style={{ background: draft.enabled ? "#22c55e" : "#94a3b8" }} />
                {draft.enabled ? "Sending" : "Turned off"}
              </button>
            </div>
          </div>

          <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[1fr_300px]">
            <div className="flex min-w-0 flex-col gap-3 p-5">
              {!canEdit && <p className="rounded-md px-3 py-2 text-xs" style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)" }}>Only admins can change notification emails.</p>}
              {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>}
              {notice && <p className="rounded-md px-4 py-3 text-sm" style={{ background: "rgba(34,197,94,0.1)", color: "var(--text-primary)" }}>{notice}</p>}

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>Email subject</label>
                <input ref={subjectRef} value={draft.subject} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} onFocus={() => { lastFocus.current = "subject" }} className={inputCls} style={inputStyle} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1 rounded-lg border p-0.5" style={{ borderColor: "var(--card-border)" }}>
                  {([["edit", "Edit", Pencil], ["source", "HTML", Code2], ["preview", "Preview", Eye]] as const).map(([v, label, Icon]) => (
                    <button key={v} type="button" onClick={() => { if (v !== view) { readEditor(); setView(v) } }}
                      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
                      style={view === v ? { background: "var(--text-primary)", color: "#fff" } : { color: "var(--text-secondary)" }}>
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>
                {isCustom && canEdit && (
                  <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                    <RotateCcw className="h-3.5 w-3.5" /> Back to default
                  </button>
                )}
              </div>

              {view === "edit" && canEdit && (
                <div className="flex flex-wrap items-center gap-0.5 rounded-md border p-1" style={{ borderColor: "var(--card-border)" }}>
                  {tools.map((t) => (
                    <button key={t.label} type="button" title={t.label} aria-label={t.label} className={tbtn} onMouseDown={(e) => e.preventDefault()} onClick={t.run}><t.icon className="h-4 w-4" /></button>
                  ))}
                  <label title="Text colour" className={`${tbtn} relative cursor-pointer`}>
                    <Palette className="h-4 w-4" />
                    <input type="color" defaultValue="#0D1B2A" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onMouseDown={() => rememberSelection()} onChange={(e) => exec("foreColor", e.target.value)} />
                  </label>
                  <span className="mx-1 h-5 w-px" style={{ background: "var(--divider)" }} />
                  <button type="button" className="rounded-md px-2 py-1 text-[11px] font-semibold hover:bg-[var(--table-header-bg)]" style={{ color: "var(--text-secondary)" }} onMouseDown={(e) => e.preventDefault()} onClick={() => insertIf("if")}>+ If</button>
                  <button type="button" className="rounded-md px-2 py-1 text-[11px] font-semibold hover:bg-[var(--table-header-bg)]" style={{ color: "var(--text-secondary)" }} onMouseDown={(e) => e.preventDefault()} onClick={() => insertIf("unless")}>+ Unless</button>
                </div>
              )}

              {view === "edit" && (
                <div ref={editorRef} contentEditable={canEdit} suppressContentEditableWarning
                  onInput={() => { rememberSelection(); setDraft((d) => ({ ...d, html: editorRef.current?.innerHTML ?? d.html })) }}
                  onKeyUp={rememberSelection} onMouseUp={rememberSelection} onBlur={rememberSelection} onFocus={() => { lastFocus.current = "body" }}
                  className="min-h-[420px] overflow-x-auto overflow-y-auto rounded-md border p-4 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/40 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-bold [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
                  style={{ borderColor: "var(--card-border)", background: "#f1f5f9", color: "#1e293b", fontFamily: "Arial, Helvetica, sans-serif" }} />
              )}
              {view === "source" && (
                <textarea value={draft.html} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, html: e.target.value })} spellCheck={false}
                  className="min-h-[420px] rounded-md border p-3 font-mono text-xs outline-none" style={inputStyle} />
              )}
              {view === "preview" && (
                <div className="flex min-h-[420px] flex-col gap-2">
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Preview with sample data · Subject: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{previewSubject || "—"}</span></p>
                  <iframe title="Preview" sandbox="" srcDoc={previewDoc} className="min-h-[480px] w-full flex-1 rounded-md border bg-white" style={{ borderColor: "var(--card-border)" }} />
                </div>
              )}

              {unknownHere.length > 0 && (
                <p className="flex items-start gap-1.5 rounded-md px-3 py-2.5 text-xs" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--text-primary)" }}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Unknown variable{unknownHere.length > 1 ? "s" : ""}: {unknownHere.map((u) => `{{${u}}}`).join(", ")} — they will print blank for this email.
                </p>
              )}

              {/* actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--divider)" }}>
                <div className="flex items-center gap-2">
                  <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Send a test to (default: you)" className="h-9 w-56 rounded-md border px-3 text-xs outline-none" style={inputStyle} disabled={!canEdit} />
                  <button type="button" onClick={sendTest} disabled={testing || !canEdit} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold disabled:opacity-50" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {dirty && <span className="text-xs" style={{ color: "var(--text-muted)" }}>Unsaved changes</span>}
                  <button type="button" onClick={save} disabled={saving || !dirty || !canEdit}
                    className="inline-flex h-9 items-center gap-2 rounded-md px-5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand-accent)" }}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
                  </button>
                </div>
              </div>
            </div>

            {/* ── side ── */}
            <aside className="flex min-h-0 flex-col border-t lg:border-l lg:border-t-0" style={{ borderColor: "var(--divider)" }}>
              <div className="flex border-b" style={{ borderColor: "var(--divider)" }}>
                {([["variables", "Variables"], ["recipients", "Recipients"], ["activity", "Activity"]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setSide(k)} className="flex-1 px-2 py-2.5 text-xs font-semibold"
                    style={side === k ? { color: "var(--brand-accent)", borderBottom: "2px solid var(--brand-accent)" } : { color: "var(--text-secondary)" }}>{label}</button>
                ))}
              </div>

              {side === "variables" && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="p-3">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: "var(--text-muted)" }} />
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search variables…" className="h-9 w-full rounded-md border pl-8 pr-3 text-sm outline-none" style={inputStyle} />
                    </div>
                    <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>Click to insert at the cursor. Use <code>{"{{name|fallback}}"}</code> for a default value. Rows whose value is empty are hidden automatically.</p>
                  </div>
                  <div className="max-h-[480px] min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
                    {groups.map((g) => (
                      <div key={g.id}>
                        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{g.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.vars.map((v) => (
                            <button key={v.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVariable(v.key, v.kind === "block")}
                              title={`${v.label}${v.example ? ` — e.g. ${v.example}` : ""}`}
                              className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-[var(--brand-accent)]"
                              style={{ borderColor: usedKeys.has(v.key) ? "var(--brand-accent)" : "var(--card-border)", color: "var(--text-secondary)", background: v.kind === "block" ? "var(--table-header-bg)" : undefined }}>{v.label}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {groups.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No variables match.</p>}
                  </div>
                </div>
              )}

              {side === "recipients" && (
                <div className="space-y-4 p-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Send to everyone with the role</p>
                    <div className="space-y-2">
                      {ROLE_OPTIONS.map((r) => (
                        <label key={r.key} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                          <input type="checkbox" className="h-4 w-4" disabled={!canEdit} checked={draft.recipients.roles.includes(r.key)}
                            onChange={(e) => setDraft((d) => ({ ...d, recipients: { ...d.recipients, roles: e.target.checked ? [...d.recipients.roles, r.key] : d.recipients.roles.filter((x) => x !== r.key) } }))} />
                          {r.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Also send to these addresses</label>
                    <textarea value={extraText} rows={3} disabled={!canEdit} onChange={(e) => setExtra(e.target.value)} placeholder="ops@company.com, manager@company.com" className="w-full rounded-md border px-3 py-2 text-sm outline-none" style={inputStyle} />
                    {badExtra.length > 0 && <p className="mt-1 text-[11px] text-red-600">Not valid: {badExtra.join(", ")}</p>}
                  </div>
                  {ev.dynamicRecipients && <p className="rounded-md px-3 py-2 text-xs" style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)" }}>{ev.dynamicRecipients}</p>}
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Role emails come from each user&apos;s login email on the Users page. Addresses that aren&apos;t real mailboxes are skipped.</p>
                </div>
              )}

              {side === "activity" && (
                <div className="max-h-[560px] space-y-2 overflow-y-auto p-3">
                  {evLog.length === 0 && <p className="p-1 text-xs" style={{ color: "var(--text-muted)" }}>Nothing has been sent for this email yet.</p>}
                  {evLog.map((l) => (
                    <div key={l.id} className="rounded-md border p-2.5 text-xs" style={{ borderColor: "var(--card-border)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold" style={{ color: l.status === "sent" ? "#16a34a" : l.status === "failed" ? "#dc2626" : "var(--text-muted)" }}>{l.status === "sent" ? "Sent" : l.status === "failed" ? "Failed" : "Skipped"}</span>
                        <span style={{ color: "var(--text-muted)" }}>{ago(l.created_at)}</span>
                      </div>
                      {l.subject && <p className="mt-1 truncate" style={{ color: "var(--text-primary)" }}>{l.subject}</p>}
                      {l.to_emails.length > 0 && <p className="mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>To {l.to_emails.join(", ")}</p>}
                      {l.error && <p className="mt-1" style={{ color: "var(--text-secondary)" }}>{l.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
