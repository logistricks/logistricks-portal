"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, MailPlus, CheckCircle2, AlertTriangle, Paperclip, X, ClipboardPaste } from "lucide-react"

type Props = {
  kind: "request" | "carrier_reply"
  freightRequestId?: string
  onDone?: () => void
  compact?: boolean
}

type Staged = {
  file: File | null            // the .eml / .msg (null when the text was pasted)
  extra: File[]                // PDFs / images added by hand
  from_email: string
  subject: string
  body_text: string
  mailbox: string
  fileAttachments: { filename: string; size: number }[]
}

const isMail = (f: File) => /\.(eml|msg)$/i.test(f.name)
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/**
 * Two steps: (1) drop an .eml / .msg — or paste the email text and drop its PDFs — and check what was read;
 * (2) press Process to run the normal workflow. Works without any mailbox connection.
 */
export function EmailDropZone({ kind, freightRequestId, onDone, compact }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<"" | "reading" | "processing">("")
  const [staged, setStaged] = useState<Staged | null>(null)
  const [mailboxes, setMailboxes] = useState<string[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // A file dropped anywhere outside the zone would make the browser open it and leave the page: block that.
  useEffect(() => {
    const stop = (e: DragEvent) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault() }
    window.addEventListener("dragover", stop)
    window.addEventListener("drop", stop)
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop) }
  }, [])

  // Ctrl/Cmd+V anywhere on the page (outside text fields) starts a pasted email.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      const files = Array.from(e.clipboardData?.files ?? [])
      const text = e.clipboardData?.getData("text/plain") ?? ""
      if (files.length || text.trim()) { e.preventDefault(); void take(files, text) }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  })

  async function loadMailboxes(): Promise<string[]> {
    if (mailboxes.length) return mailboxes
    try {
      const r = await fetch("/api/inbound/email"); const j = await r.json()
      const m: string[] = Array.isArray(j.mailboxes) ? j.mailboxes : []
      setMailboxes(m); return m
    } catch { return [] }
  }

  /** Step 1: take whatever was dropped / pasted. */
  async function take(files: File[], text = "") {
    setMsg(null)
    const mail = files.find(isMail)
    const others = files.filter((f) => !isMail(f))
    // More attachments for something already staged.
    if (staged && !mail) {
      setStaged({ ...staged, extra: [...staged.extra, ...others], body_text: text.trim() && !staged.body_text ? text : staged.body_text })
      return
    }
    if (mail) {
      setBusy("reading")
      const fd = new FormData()
      fd.set("file", mail); fd.set("kind", kind); fd.set("mode", "preview")
      try {
        const r = await fetch("/api/inbound/email", { method: "POST", body: fd })
        const j = await r.json().catch(() => ({}))
        if (j.mailboxes) setMailboxes(j.mailboxes)
        if (!r.ok || j.ok === false) { setMsg({ ok: false, text: `${mail.name}: ${j.error || `could not be read (${r.status})`}` }); return }
        const p = j.preview
        setStaged({ file: mail, extra: others, from_email: p.from_email, subject: p.subject, body_text: p.body_text, mailbox: p.mailbox ?? "", fileAttachments: p.attachments })
      } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Network error" }) }
      finally { setBusy("") }
      return
    }
    if (text.trim() || others.length) {
      const m = await loadMailboxes()
      const sender = (text.match(/[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/) || [""])[0].toLowerCase()
      setStaged({ file: null, extra: others, from_email: sender, subject: (text.match(/^Subject:\s*(.+)$/im) || [])[1] ?? "", body_text: text, mailbox: m.length === 1 ? m[0] : "", fileAttachments: [] })
      return
    }
    setMsg({ ok: false, text: "That drag didn't carry a file or text. Drop an .eml / .msg file, or copy the email text and paste it here (Ctrl/Cmd+V)." })
  }

  /** Step 2: run the workflow. */
  async function process() {
    if (!staged) return
    setBusy("processing"); setMsg(null)
    const fd = new FormData()
    fd.set("kind", kind); fd.set("mode", "process")
    if (freightRequestId) fd.set("freight_request_id", freightRequestId)
    if (staged.file) fd.set("file", staged.file)
    for (const f of staged.extra) fd.append("extra", f)
    fd.set("overrides", JSON.stringify({ from_email: staged.from_email, subject: staged.subject, body_text: staged.body_text, mailbox: staged.mailbox }))
    try {
      const r = await fetch("/api/inbound/email", { method: "POST", body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.ok === false) { setMsg({ ok: false, text: j.error || `Failed (${r.status})` }); return }
      setMsg({ ok: true, text: describe(kind, j.result) })
      setStaged(null); onDone?.()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Network error" }) }
    finally { setBusy("") }
  }

  const upd = (p: Partial<Staged>) => setStaged((s) => (s ? { ...s, ...p } : s))
  const field = "w-full rounded border px-2 py-1.5 text-xs"
  const fstyle = { borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" } as const

  return (
    <div>
      {!staged && (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation(); setOver(false)
            void take(Array.from(e.dataTransfer.files || []), e.dataTransfer.getData("text/plain") || "")
          }}
          onClick={() => !busy && input.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs font-medium transition-colors ${compact ? "px-3 py-2" : "px-4 py-4"}`}
          style={{ borderColor: over ? "var(--brand-accent)" : "var(--card-border)", background: over ? "rgba(59,130,246,0.06)" : "transparent", color: "var(--text-secondary)" }}
        >
          <span className="flex items-center gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}
            {busy ? "Reading the email…" : kind === "request"
              ? "Drop a client's request email (.eml / .msg) — or click to choose a file"
              : "Drop a carrier's reply email (.eml / .msg) — or click to choose a file"}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
            <ClipboardPaste className="h-3 w-3" /> Web mail: copy the email text and paste it here (Ctrl/Cmd+V), then add its PDFs
          </span>
          <input ref={input} type="file" accept=".eml,.msg,.pdf,image/*" multiple hidden onClick={(e) => e.stopPropagation()}
            onChange={(e) => { if (e.target.files) void take(Array.from(e.target.files)); e.target.value = "" }} />
        </div>
      )}

      {staged && (
        <div className="space-y-2 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
          <div className="flex items-center justify-between">
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              Step 2 of 2 — check, then process {staged.file ? `(${staged.file.name})` : "(pasted text)"}
            </p>
            <button onClick={() => { setStaged(null); setMsg(null) }} aria-label="Cancel" style={{ color: "var(--text-muted)" }}><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1"><span style={{ color: "var(--text-muted)" }}>Sender email</span>
              <input value={staged.from_email} onChange={(e) => upd({ from_email: e.target.value })} className={field} style={fstyle} placeholder="name@company.com" /></label>
            <label className="space-y-1"><span style={{ color: "var(--text-muted)" }}>Sent to (client mailbox)</span>
              {staged.file && staged.mailbox
                ? <input value={staged.mailbox} readOnly className={field} style={fstyle} />
                : <select value={staged.mailbox} onChange={(e) => upd({ mailbox: e.target.value })} className={field} style={fstyle}>
                    <option value="">Choose the mailbox…</option>
                    {mailboxes.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>}</label>
          </div>
          <label className="block space-y-1"><span style={{ color: "var(--text-muted)" }}>Subject</span>
            <input value={staged.subject} onChange={(e) => upd({ subject: e.target.value })} className={field} style={fstyle} /></label>
          <label className="block space-y-1"><span style={{ color: "var(--text-muted)" }}>Email text</span>
            <textarea value={staged.body_text} onChange={(e) => upd({ body_text: e.target.value })} rows={6} className={field} style={fstyle} /></label>
          <div className="flex flex-wrap items-center gap-1.5">
            {staged.fileAttachments.map((a) => (
              <span key={a.filename} className="inline-flex items-center gap-1 rounded px-2 py-0.5" style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)" }}>
                <Paperclip className="h-3 w-3" />{a.filename} · {kb(a.size)}</span>))}
            {staged.extra.map((f, i) => (
              <span key={f.name + i} className="inline-flex items-center gap-1 rounded px-2 py-0.5" style={{ background: "rgba(139,92,246,0.12)", color: "#7c3aed" }}>
                <Paperclip className="h-3 w-3" />{f.name} · {kb(f.size)}
                <button onClick={() => upd({ extra: staged.extra.filter((_, j) => j !== i) })} aria-label="Remove"><X className="h-3 w-3" /></button></span>))}
            <button onClick={() => input.current?.click()} className="rounded border border-dashed px-2 py-0.5" style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}>+ add PDF / image</button>
            <input ref={input} type="file" accept=".pdf,image/*" multiple hidden onChange={(e) => { if (e.target.files) upd({ extra: [...staged.extra, ...Array.from(e.target.files)] }); e.target.value = "" }} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setStaged(null); setMsg(null) }} className="rounded px-3 py-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>Cancel</button>
            <button onClick={() => void process()} disabled={busy === "processing" || !staged.mailbox || !staged.from_email}
              className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-semibold text-white disabled:opacity-50" style={{ background: "var(--brand-accent)" }}>
              {busy === "processing" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy === "processing" ? "Processing…" : kind === "request" ? "Process request" : "Process quote"}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className="mt-2 flex items-start gap-2 whitespace-pre-line rounded-lg px-3 py-2 text-xs"
          style={{ background: msg.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: msg.ok ? "#059669" : "#dc2626" }}>
          {msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  )
}

function describe(kind: string, r: any): string {
  if (!r || typeof r !== "object") return "Added."
  if (kind === "request") {
    const miss = Array.isArray(r.missing_fields) && r.missing_fields.length ? ` — missing: ${r.missing_fields.join(", ")}` : ""
    return `Request ${r.request_ref ?? ""} created${miss}${r.exw_pickup_address_missing ? " — EXW pickup address missing" : ""}`
  }
  if (r.linked === false) return `Stored as a non-linked quote (${String(r.reason ?? "").replace(/_/g, " ")})`
  return r.review_status === "needs_review" ? "Quote linked to the request — needs review" : "Quote linked to the request"
}
