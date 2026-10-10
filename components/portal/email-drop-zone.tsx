"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, MailPlus, CheckCircle2, AlertTriangle, Paperclip, X, ClipboardPaste } from "lucide-react"

type Props = {
  kind: "request" | "carrier_reply"
  freightRequestId?: string
  onDone?: () => void
  compact?: boolean
  /** One thin line: for pages where the box should stay out of the way. */
  slim?: boolean
}

type Staged = {
  file: File | null            // the .eml / .msg (null when the text was pasted)
  extra: File[]                // PDFs / images added by hand
  from_email: string
  subject: string
  body_text: string
  mailbox: string
  fileAttachments: { filename: string; size: number }[]
  message_id?: string
  hint?: string
}

/** Appends a step to the drop breadcrumb (read back on the next load if the page died mid-drop). */
function crumb(step: string) {
  try { const v = JSON.parse(localStorage.getItem("lt_drop_dbg") || "null"); if (v) { v.steps = [...(v.steps || []), step]; localStorage.setItem("lt_drop_dbg", JSON.stringify(v)) } } catch { /* ignore */ }
}
const isMail = (f: File) => /\.(eml|msg)$/i.test(f.name)
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/**
 * Two steps: (1) drop an .eml / .msg — or paste the email text and drop its PDFs — and check what was read;
 * (2) press Process to run the normal workflow. Works without any mailbox connection.
 */
export function EmailDropZone({ kind, freightRequestId, onDone, compact, slim }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<"" | "reading" | "processing">("")
  const [staged, setStaged] = useState<Staged | null>(null)
  const [mailboxes, setMailboxes] = useState<string[]>([])
  const mbRef = useRef<string[]>([])
  useEffect(() => { mbRef.current = mailboxes }, [mailboxes])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Anything dropped anywhere on the page is taken by the portal — never by the browser, which would otherwise
  // open the file / link (e.g. Apple Mail's message:// link) and leave the page. A full-page overlay shows while dragging.
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const takeRef = useRef<(files: File[], text: string, types: string[], uri: string) => void>(() => {})
  useEffect(() => {
    // A file dropped on the box itself is handled by the browser's own file input (Safari can't read Mail's drags in script).
    const native = (e: DragEvent) => (e.target as HTMLElement | null)?.dataset?.ltDrop === "1" && !!e.dataTransfer && Array.from(e.dataTransfer.types).indexOf("Files") >= 0
    const has = (e: DragEvent) => !!e.dataTransfer && e.dataTransfer.types.length > 0 && !native(e)
    const enter = (e: DragEvent) => { if (has(e)) { e.preventDefault(); depth.current++; setDragging(true) } }
    const leave = () => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDragging(false) }
    const over = (e: DragEvent) => { if (has(e)) e.preventDefault() }
    const drop = (e: DragEvent) => {
      if (!has(e)) return
      e.preventDefault(); depth.current = 0; setDragging(false)
      try { localStorage.setItem("lt_drop_dbg", JSON.stringify({ at: new Date().toISOString(), ua: navigator.userAgent.slice(0, 90), types: Array.from(e.dataTransfer!.types), files: Array.from(e.dataTransfer!.files || []).map((f) => `${f.name}|${f.type}|${f.size}`), uri: (e.dataTransfer!.getData("text/uri-list") || "").slice(0, 120) })) } catch { /* private mode */ }
      crumb("drop recorded (v4); calling take"); takeRef.current(Array.from(e.dataTransfer!.files || []), e.dataTransfer!.getData("text/plain") || "", Array.from(e.dataTransfer!.types), e.dataTransfer!.getData("text/uri-list") || "")
    }
    window.addEventListener("dragenter", enter); window.addEventListener("dragleave", leave)
    window.addEventListener("dragover", over); window.addEventListener("drop", drop)
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragleave", leave); window.removeEventListener("dragover", over); window.removeEventListener("drop", drop) }
  }, [])

  // If the page died during a drop, the breadcrumb is still here on the next load: show it.
  const [crash, setCrash] = useState<string | null>(null)
  useEffect(() => {
    try { const v = localStorage.getItem("lt_drop_dbg"); if (v) { setCrash(v); localStorage.removeItem("lt_drop_dbg") } } catch { /* ignore */ }
    const onErr = (e: ErrorEvent) => { try { const v = JSON.parse(localStorage.getItem("lt_drop_dbg") || "null"); if (v) localStorage.setItem("lt_drop_dbg", JSON.stringify({ ...v, error: `${e.message} @${e.lineno}` })) } catch { /* ignore */ } }
    window.addEventListener("error", onErr)
    const bu = () => crumb("beforeunload — the page is navigating away or reloading")
    const ph = () => crumb("pagehide")
    window.addEventListener("beforeunload", bu); window.addEventListener("pagehide", ph)
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("beforeunload", bu); window.removeEventListener("pagehide", ph) }
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

  // Loaded as soon as the page opens, so a drop never has to wait on the network (Safari kills the page if it does).
  useEffect(() => { void loadMailboxes() }, [])
  const [safari, setSafari] = useState(false)
  useEffect(() => { setSafari(/^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)) }, [])
  async function pasteFromClipboard() {
    setMsg(null)
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) { setMsg({ ok: false, text: "The clipboard is empty. In your mail app open the email, press Cmd+A then Cmd+C, and try again." }); return }
      await take([], text)
    } catch { setMsg({ ok: false, text: "Your browser blocked clipboard access. Click on the page (not in a box) and press Cmd+V (Ctrl+V on Windows) instead." }) }
  }
  async function loadMailboxes(): Promise<string[]> {
    if (mbRef.current.length) return mbRef.current
    try {
      const r = await fetch("/api/inbound/email"); const j = await r.json()
      const m: string[] = Array.isArray(j.mailboxes) ? j.mailboxes : []
      mbRef.current = m; setMailboxes(m); return m
    } catch { return [] }
  }

  /** Step 1: take whatever was dropped / pasted. */
  async function take(files: File[], text = "", types: string[] = [], uri = "") {
    try { await take2(files, text, types, uri) } finally { try { localStorage.removeItem("lt_drop_dbg") } catch { /* ignore */ } }
  }
  async function take2(files: File[], text = "", types: string[] = [], uri = "") {
    crumb("take2 start")
    setMsg(null)
    // Safari hands over Mail's message as a placeholder file of 0 bytes that cannot be read (uploading it kills the page).
    // Treat it like Apple Mail's link: keep the subject from the file name, ask for the body by paste.
    const empty = files.find((f) => isMail(f) && f.size === 0)
    if (empty && !staged) {
      crumb("empty file path: no waiting")
      const m = mbRef.current
      setStaged({
        file: null, extra: files.filter((f) => !isMail(f)), from_email: "", mailbox: m.length === 1 ? m[0] : "", fileAttachments: [],
        subject: empty.name.replace(/\.(eml|msg)$/i, "").replace(/\s\d{1,2}$/, "").trim(), body_text: "",
        hint: "Your browser sent the email as an empty placeholder file (Safari does this with Apple Mail), so only the subject came through. Open the email in Mail, press Cmd+A then Cmd+C, and paste it here with Cmd+V (click outside the boxes first). Add the PDF too if there is one. Chrome can read the file directly if you drag from Outlook.",
      })
      crumb("staged ok")
      return
    }
    const real = files.filter((f) => !(isMail(f) && f.size === 0))
    const mail = real.find(isMail)
    const others = real.filter((f) => !isMail(f))
    // More attachments for something already staged.
    if (staged && !mail) {
      const fill = text.trim() && !staged.body_text.trim()
      let add: Partial<Staged> = {}
      if (fill) {
        const m = await loadMailboxes()
        const all = Array.from(new Set((text.match(/[^\s<>,;"'()]+@[^\s<>,;"'()]+\.[^\s<>,;"'()]+/g) || []).map((a) => a.toLowerCase())))
        const fromLine = (text.match(/^From:.*?([^\s<>,;"'()]+@[^\s<>,;"'()]+\.[^\s<>,;"'()]+)/im) || [])[1]?.toLowerCase()
        add = { body_text: text, hint: undefined,
          from_email: staged.from_email || fromLine || all.find((a) => !m.includes(a)) || "",
          mailbox: staged.mailbox || all.find((a) => m.includes(a)) || "" }
      }
      setStaged({ ...staged, ...add, extra: [...staged.extra, ...others] })
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
    // Apple Mail drags only a message: link plus the subject as text — no body, no file.
    if (/^message:/i.test(uri.trim())) {
      const m = await loadMailboxes()
      let mid = ""; try { mid = decodeURIComponent(uri.trim().replace(/^message:/i, "")) } catch { /* keep empty */ }
      setStaged({
        file: null, extra: others, from_email: "", subject: text.trim().split("\n")[0] ?? "", body_text: "",
        mailbox: m.length === 1 ? m[0] : "", fileAttachments: [], message_id: mid || undefined,
        hint: "Apple Mail only shares the subject, not the email itself. Open the email in Mail, press Cmd+A then Cmd+C, and paste it here with Cmd+V (click outside the boxes first). Add the PDF too if there is one.",
      })
      return
    }
    if (text.trim() || others.length) {
      const m = await loadMailboxes()
      const all = Array.from(new Set((text.match(/[^\s<>,;"'()]+@[^\s<>,;"'()]+\.[^\s<>,;"'()]+/g) || []).map((a) => a.toLowerCase())))
      const fromLine = (text.match(/^From:.*?([^\s<>,;"'()]+@[^\s<>,;"'()]+\.[^\s<>,;"'()]+)/im) || [])[1]?.toLowerCase()
      const box = all.find((a) => m.includes(a)) ?? (m.length === 1 ? m[0] : "")
      const sender = fromLine ?? all.find((a) => !m.includes(a)) ?? ""
      setStaged({ file: null, extra: others, from_email: sender, subject: (text.match(/^Subject:\s*(.+)$/im) || [])[1] ?? "", body_text: text, mailbox: box, fileAttachments: [] })
      return
    }
    setMsg({ ok: false, text: `That drag didn't carry a file or text${types.length ? ` (it only carried: ${types.join(", ")})` : ""}. Your mail app handed over a link, not the email itself. Drag the email onto your desktop first, or copy its text and paste it here (Ctrl/Cmd+V).` })
  }
  takeRef.current = (f, t, ty, u) => { void take(f, t, ty, u) }

  /** Step 2: run the workflow. */
  async function process() {
    if (!staged) return
    setBusy("processing"); setMsg(null)
    const fd = new FormData()
    fd.set("kind", kind); fd.set("mode", "process")
    if (freightRequestId) fd.set("freight_request_id", freightRequestId)
    if (staged.file) fd.set("file", staged.file)
    for (const f of staged.extra) fd.append("extra", f)
    fd.set("overrides", JSON.stringify({ from_email: staged.from_email, subject: staged.subject, body_text: staged.body_text, mailbox: staged.mailbox, message_id: staged.message_id }))
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
  const field = "w-full rounded-xl border px-3 py-2 text-[13px]"
  const fstyle = { borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" } as const

  return (
    <div>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(15,23,42,0.55)" }}>
          <div className="rounded-2xl border-2 border-dashed px-10 py-8 text-center text-white" style={{ borderColor: "var(--brand-accent)", background: "rgba(15,23,42,0.85)" }}>
            <MailPlus className="mx-auto mb-2 h-8 w-8" />
            <p className="text-base font-semibold">Drop the email anywhere to add it</p>
          </div>
        </div>
      )}
      {crash && (
        <div className="mb-2 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
          <p className="font-semibold">The page reloaded during your last drop. Please send this to support:</p>
          <pre className="mt-1 whitespace-pre-wrap break-all">{crash}</pre>
          <button onClick={() => setCrash(null)} className="mt-1 underline">Dismiss</button>
        </div>
      )}
      {!staged && (
        <div
          className={`relative flex items-center rounded-[18px] border-2 border-dashed transition-all ${slim ? "flex-row flex-wrap justify-center gap-x-8 gap-y-2 px-5 py-3 text-center" : `flex-col justify-center gap-2 text-center ${compact ? "px-4 py-4" : "px-6 py-6"}`}`}
          style={{
            borderColor: "var(--brand-accent)",
            background: over ? "rgb(var(--brand-accent-rgb) / 0.16)" : "rgb(var(--brand-accent-rgb) / 0.07)",
            color: "var(--text-secondary)",
            boxShadow: over ? "0 0 0 5px var(--brand-accent-ring)" : "none",
          }}
        >
          <span className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white" style={{ color: "var(--brand-accent)", border: "1px solid rgb(var(--brand-accent-rgb) / 0.3)" }}>
              {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <MailPlus className="h-6 w-6" />}
            </span>
            <span className="text-left">
              <span className="block text-[17px] font-bold leading-tight" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display), var(--font-sans), sans-serif" }}>
                {busy ? "Reading the email…" : kind === "request"
                  ? (slim ? "Drop a request email here to add it" : "Drop a client's request email here")
                  : "Drop a carrier's reply email here"}
              </span>
              <span className="mt-0.5 block text-[13.5px] font-normal" style={{ color: "var(--text-secondary)" }}>
                {kind === "request" ? ".eml or .msg, or click to choose a file" : ".eml or .msg, or click to choose a file"}
              </span>
            </span>
          </span>
          <span className={`${slim ? "hidden" : "flex"} items-center gap-1 text-[12px] font-normal`} style={{ color: "var(--text-muted)" }}>
            <ClipboardPaste className="h-3 w-3" /> Web mail / Apple Mail: copy the email text (Cmd+A, Cmd+C in the email) and paste it here (Cmd/Ctrl+V), then add its PDFs
          </span>
          <button type="button" onClick={(e) => { e.stopPropagation(); void pasteFromClipboard() }}
            className="relative z-20 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold"
            style={{ background: "var(--brand-accent)" }}>
            <ClipboardPaste className="h-4 w-4" /> Paste copied email
          </button>
          {safari && !slim && (
            <span className="mt-1 text-center text-[11px] font-normal" style={{ color: "#b45309" }}>
              Safari: drop the email onto this box itself (not elsewhere on the page). If Mail only sends the subject, use the copy &amp; paste button.
            </span>
          )}
          {/* The real drop target: a native file input stretched over the box. Dropping or clicking both land here. */}
          <input ref={input} data-lt-drop="1" type="file" accept=".eml,.msg,.pdf,image/*" multiple title="Drop an email here or click to choose a file"
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            onDragEnter={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}
            onChange={(e) => { const f = e.target.files ? Array.from(e.target.files) : []; e.target.value = ""; if (f.length) void take(f) }} />
        </div>
      )}

      {staged && (
        <div className="space-y-3 rounded-[18px] border p-5 text-[13px]" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between">
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              Step 2 of 2 — check, then process {staged.file ? `(${staged.file.name})` : "(pasted text)"}
            </p>
            <button onClick={() => { setStaged(null); setMsg(null) }} aria-label="Cancel" style={{ color: "var(--text-muted)" }}><X className="h-4 w-4" /></button>
          </div>
          {staged.hint && (
            <p className="rounded px-2 py-1.5" style={{ background: "rgba(245,158,11,0.12)", color: "#b45309" }}>{staged.hint}</p>
          )}
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
            <button onClick={() => void process()} disabled={busy === "processing" || !staged.mailbox || !staged.from_email || (!staged.body_text.trim() && !staged.extra.length && !staged.fileAttachments.length)}
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
  if (kind === "request" && r.outcome) {
    const ref = r.request_ref ? ` ${r.request_ref}` : ""
    if (r.outcome === "linked_as_reply") return `Linked as a reply to request${ref}`
    if (r.outcome === "new_possible_reply") return `Request${ref} created — flagged as a possible reply, please check`
    return `Request${ref} created`
  }
  if (kind === "request") {
    const miss = Array.isArray(r.missing_fields) && r.missing_fields.length ? ` — missing: ${r.missing_fields.join(", ")}` : ""
    return `Request ${r.request_ref ?? ""} created${miss}${r.exw_pickup_address_missing ? " — EXW pickup address missing" : ""}`
  }
  if (r.linked === false) return `Stored as a non-linked quote (${String(r.reason ?? "").replace(/_/g, " ")})`
  return r.review_status === "needs_review" ? "Quote linked to the request — needs review" : "Quote linked to the request"
}
