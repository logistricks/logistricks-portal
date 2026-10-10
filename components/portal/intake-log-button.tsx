"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Activity, CheckCircle2, AlertTriangle, Loader2, XCircle, MinusCircle, RefreshCw, X, ChevronDown, ChevronRight } from "lucide-react"
import Link from "next/link"

type Log = {
  id: string; kind: string; source: string; filename: string | null; from_email: string | null; subject: string | null
  status: "running" | "success" | "failed" | "unconfirmed" | "ignored"; stage: string | null; http_status: number | null
  error: string | null; result: any; freight_request_id: string | null; created_by: string | null
  started_at: string; finished_at: string | null; duration_ms: number | null
}

const STATUS: Record<Log["status"], { label: string; color: string; bg: string; Icon: typeof Loader2 }> = {
  running:     { label: "Running",     color: "#2563eb", bg: "rgba(37,99,235,0.1)",  Icon: Loader2 },
  success:     { label: "Done",        color: "#16a34a", bg: "rgba(22,163,74,0.1)",  Icon: CheckCircle2 },
  failed:      { label: "Failed",      color: "#dc2626", bg: "rgba(220,38,38,0.1)",  Icon: XCircle },
  unconfirmed: { label: "No result",   color: "#b45309", bg: "rgba(245,158,11,0.14)", Icon: AlertTriangle },
  ignored:     { label: "Skipped",     color: "#64748b", bg: "rgba(100,116,139,0.12)", Icon: MinusCircle },
}

const OUTCOME: Record<string, string> = {
  new_request: "New request created", linked_as_reply: "Linked as a reply to an existing request",
  new_possible_reply: "New request created — flagged as a possible reply", carrier_quote: "Carrier quote stored",
}

function when(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })
}
const dur = (ms: number | null) => (ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

/** Top-right button of the Requests page: opens the log of manual email runs through n8n. */
export function IntakeLogButton() {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<Log[]>([])
  const [running, setRunning] = useState(0)
  const [failed, setFailed] = useState(0)
  const [loading, setLoading] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [full, setFull] = useState<Record<string, any>>({})
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/intake-logs", { cache: "no-store" })
      if (!r.ok) return
      const j = await r.json()
      setLogs(j.logs ?? []); setRunning(j.running ?? 0); setFailed(j.failed24h ?? 0)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  // refresh quickly while something is running or the window is open
  useEffect(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => void load(), open || running ? 4000 : 60000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [open, running, load])

  async function toggle(id: string) {
    const next = openId === id ? null : id
    setOpenId(next)
    if (next && !full[next]) {
      try { const r = await fetch(`/api/intake-logs?id=${next}`, { cache: "no-store" }); const j = await r.json(); if (j.log) setFull((f) => ({ ...f, [next]: j.log })) } catch { /* ignore */ }
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} title="Email intake log — what happened to each email you added"
        className="relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition hover:bg-white/15"
        style={{ color: "#fff", border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.08)" }}>
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#2563eb" }} /> : <Activity className="h-3.5 w-3.5" />}
        Intake log
        {failed > 0 && !running && (
          <span className="ml-0.5 rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: "#dc2626" }}>{failed}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-end p-4" style={{ background: "rgba(15,23,42,0.35)" }} onClick={() => setOpen(false)}>
          <div className="flex max-h-[88vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl shadow-2xl"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid var(--divider)" }}>
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Email intake log</p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Emails added on this page and what happened to each.</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => void load()} title="Refresh" className="rounded p-1.5" style={{ color: "var(--text-secondary)" }}>
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button onClick={() => setOpen(false)} className="rounded p-1.5" style={{ color: "var(--text-secondary)" }}><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="overflow-y-auto">
              {logs.length === 0 && (
                <p className="px-5 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>Nothing here yet. Emails you drop on the Requests page will be listed with their result.</p>
              )}
              {logs.map((l) => {
                const st = STATUS[l.status] ?? STATUS.failed
                const isOpen = openId === l.id
                const f = full[l.id]
                const res = l.result || {}
                return (
                  <div key={l.id} style={{ borderBottom: "1px solid var(--divider)" }}>
                    <button onClick={() => void toggle(l.id)} className="flex w-full items-start gap-3 px-5 py-3 text-left">
                      {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.bg, color: st.color }}>
                            <st.Icon className={`h-3 w-3 ${l.status === "running" ? "animate-spin" : ""}`} />{st.label}
                          </span>
                          <span className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{l.subject || l.filename || "(no subject)"}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {l.from_email || "—"} · {when(l.started_at)}{l.duration_ms != null ? ` · ${dur(l.duration_ms)}` : ""}{l.kind === "carrier_reply" ? " · carrier reply" : ""}
                        </p>
                        {l.status === "success" && res.outcome && (
                          <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                            {OUTCOME[res.outcome] ?? res.outcome}{res.request_ref ? " — " : ""}
                            {res.request_ref && l.freight_request_id ? <Link href={`/requests/${l.freight_request_id}`} className="font-semibold underline" style={{ color: "var(--brand-accent)" }} onClick={(e) => e.stopPropagation()}>{res.request_ref}</Link> : res.request_ref}
                          </p>
                        )}
                        {l.error && l.status !== "success" && <p className="mt-1 text-xs" style={{ color: st.color }}>{l.error}</p>}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="space-y-2 px-5 pb-4 pl-12 text-xs" style={{ color: "var(--text-secondary)" }}>
                        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1">
                          <dt style={{ color: "var(--text-muted)" }}>Stage</dt><dd>{l.stage ?? "—"}</dd>
                          <dt style={{ color: "var(--text-muted)" }}>Status code</dt><dd>{l.http_status ?? "—"}</dd>
                          <dt style={{ color: "var(--text-muted)" }}>File</dt><dd>{l.filename ?? "—"}</dd>
                          <dt style={{ color: "var(--text-muted)" }}>Added by</dt><dd>{l.created_by ?? "—"}</dd>
                          {res.match_method && (<><dt style={{ color: "var(--text-muted)" }}>Matched by</dt><dd>{res.match_method}{res.match_confidence != null ? ` (${Math.round(res.match_confidence * 100)}%)` : ""}</dd></>)}
                          {res.match_reason && (<><dt style={{ color: "var(--text-muted)" }}>Reason</dt><dd>{res.match_reason}</dd></>)}
                        </dl>
                        <p className="pt-1 font-semibold" style={{ color: "var(--text-muted)" }}>Result</p>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded p-2 text-[11px]" style={{ background: "var(--page-bg, rgba(100,116,139,0.08))", border: "1px solid var(--card-border)" }}>
                          {JSON.stringify(res, null, 2) === "{}" ? "—" : JSON.stringify(res, null, 2)}
                        </pre>
                        <p className="font-semibold" style={{ color: "var(--text-muted)" }}>Raw response</p>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded p-2 text-[11px]" style={{ background: "var(--page-bg, rgba(100,116,139,0.08))", border: "1px solid var(--card-border)" }}>
                          {f ? (f.n8n_response || "—") : "Loading…"}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
