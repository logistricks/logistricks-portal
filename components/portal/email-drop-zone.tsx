"use client"

import { useRef, useState } from "react"
import { Loader2, MailPlus, CheckCircle2, AlertTriangle } from "lucide-react"

type Props = {
  kind: "request" | "carrier_reply"
  freightRequestId?: string
  onDone?: () => void
  compact?: boolean
}

/** Drag an .eml / .msg onto this area (or click to choose) to add it without a mailbox connection. */
export function EmailDropZone({ kind, freightRequestId, onDone, compact }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function send(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /\.(eml|msg)$/i.test(f.name))
    if (!list.length) { setMsg({ ok: false, text: "Drop an .eml or .msg email file (save or drag the email out of your mail app)." }); return }
    setBusy(true); setMsg(null)
    const lines: string[] = []; let allOk = true
    for (const f of list) {
      const fd = new FormData()
      fd.set("file", f); fd.set("kind", kind)
      if (freightRequestId) fd.set("freight_request_id", freightRequestId)
      try {
        const r = await fetch("/api/inbound/email", { method: "POST", body: fd })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || j.ok === false) { allOk = false; lines.push(`${f.name}: ${j.error || `failed (${r.status})`}`) }
        else lines.push(`${f.name}: ${describe(kind, j.result)}`)
      } catch (e) { allOk = false; lines.push(`${f.name}: ${e instanceof Error ? e.message : "network error"}`) }
    }
    setBusy(false); setMsg({ ok: allOk, text: lines.join("\n") })
    if (list.length) onDone?.()
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) send(e.dataTransfer.files) }}
        onClick={() => !busy && input.current?.click()}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed text-xs font-medium transition-colors ${compact ? "px-3 py-2" : "px-4 py-4"}`}
        style={{ borderColor: over ? "var(--brand-accent)" : "var(--card-border)", background: over ? "rgba(59,130,246,0.06)" : "transparent", color: "var(--text-secondary)" }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}
        <span>{busy ? "Reading the email…" : kind === "request"
          ? "Drop a client's request email here (.eml / .msg) to add it without a mailbox connection"
          : "Drop a carrier's reply email here (.eml / .msg) to add its quote"}</span>
        <input ref={input} type="file" accept=".eml,.msg" multiple hidden onChange={(e) => { if (e.target.files) send(e.target.files); e.target.value = "" }} />
      </div>
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
  if (!r || typeof r !== "object") return "added"
  if (kind === "request") {
    const miss = Array.isArray(r.missing_fields) && r.missing_fields.length ? ` — missing: ${r.missing_fields.join(", ")}` : ""
    return `request ${r.request_ref ?? ""} created${miss}${r.exw_pickup_address_missing ? " — EXW pickup address missing" : ""}`
  }
  if (r.linked === false) return `stored as a non-linked quote (${String(r.reason ?? "").replace(/_/g, " ")})`
  return r.review_status === "needs_review" ? "linked to the request — needs review" : "quote linked to the request"
}
