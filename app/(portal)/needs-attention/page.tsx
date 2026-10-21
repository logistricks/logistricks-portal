"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react"
import { useToast } from "@/components/ui/toast"

type Ev = {
  id: string; client_code: string | null; source: "portal" | "n8n"; kind: string; severity: "error" | "warning"; title: string; message: string | null
  workflow: string | null; node: string | null; execution_id: string | null; request_id: string | null; count: number; status: "open" | "resolved"
  first_seen: string; last_seen: string; resolved_by: string | null; resolved_at: string | null
}

const KIND: Record<string, string> = {
  email_failed: "Email not sent", ai_failed: "AI not available", auto_send_failed: "Automatic send failed", workflow_error: "Workflow error",
  silent_noop: "Nothing found", cron_failed: "Scheduled job failed", reminder_failed: "Reminder not sent",
}
const when = (v: string) => new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/** Everything that went wrong (portal and n8n) in one list, until a person resolves it. */
export default function NeedsAttentionPage() {
  const { error: toastError, success } = useToast()
  const [tab, setTab] = useState<"open" | "resolved">("open")
  const [events, setEvents] = useState<Ev[]>([])
  const [owner, setOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/system-events?status=${tab}`, { cache: "no-store" })
      const j = await r.json().catch(() => ({}))
      setEvents(j.events ?? []); setOwner(!!j.owner); setNote(j.error ?? "")
    } finally { setLoading(false) }
  }, [tab])
  useEffect(() => { void load() }, [load])

  async function resolve(ids: string[], on = true) {
    setBusy(ids.join(","))
    try {
      const r = await fetch("/api/system-events", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, resolve: on }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toastError("Could not update", j.error); return }
      success(on ? "Marked as resolved" : "Reopened"); await load()
    } finally { setBusy(null) }
  }

  return (
    <div className="portal-page space-y-5 p-6 pb-20 md:pb-0">
      <div className="page-band flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-[var(--text-primary)]" style={{ letterSpacing: "-0.01em" }}>Needs attention</h1>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Things that failed or went quiet, from the portal and from n8n. The same problem repeating is one line with a count.</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "open" && events.length > 1 && <button onClick={() => void resolve(events.map((e) => e.id))} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">Resolve all</button>}
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)]"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
        </div>
      </div>

      <div className="flex gap-2">
        {(["open", "resolved"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded-full border px-4 py-1.5 text-xs font-bold capitalize"
            style={{ borderColor: tab === t ? "var(--brand-accent)" : "var(--card-border)", color: tab === t ? "var(--brand-accent)" : "var(--text-secondary)" }}>{t}</button>
        ))}
      </div>

      {note && <p className="text-sm text-amber-700">{note}</p>}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--text-muted)]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10"><CheckCircle2 className="h-7 w-7 text-green-600" /></div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{tab === "open" ? "Nothing needs attention" : "Nothing resolved yet"}</h2>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="ds-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    {e.severity === "error" ? <XCircle className="h-4 w-4 text-red-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                    {e.title}
                    {e.count > 1 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">×{e.count}</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    {KIND[e.kind] ?? e.kind} · {e.source === "n8n" ? "n8n" : "Portal"}{owner && e.client_code ? ` · ${e.client_code}` : owner ? " · unassigned" : ""}
                  </p>
                  {e.message && <p className="mt-1.5 whitespace-pre-wrap break-words text-xs" style={{ color: "var(--text-secondary)" }}>{e.message}</p>}
                  <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {e.workflow ? `${e.workflow}${e.node ? ` → ${e.node}` : ""} · ` : ""}first {when(e.first_seen)} · last {when(e.last_seen)}
                    {e.resolved_by ? ` · resolved by ${e.resolved_by}` : ""}
                    {e.request_id && <> · <a className="underline" href={`/requests/${e.request_id}`}>open the request</a></>}
                  </p>
                </div>
                <button disabled={busy === e.id} onClick={() => void resolve([e.id], e.status === "open")} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                  {e.status === "open" ? "Mark resolved" : "Reopen"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
