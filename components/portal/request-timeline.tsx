"use client"

import { useCallback, useEffect, useState } from "react"
import { BadgeCheck, ChevronDown, FilePlus2, FileText, Inbox, Loader2, Mail, MailWarning, RefreshCw, Reply, Send, Truck } from "lucide-react"
import { fmtDateTimeSec, fmtDuration } from "@/lib/duration"
import type { TimelineEvent } from "@/app/api/request-timeline/route"

const KIND: Record<TimelineEvent["kind"], { color: string; Icon: typeof Mail }> = {
  request_sent:    { color: "#3b82f6", Icon: Mail },
  added:           { color: "#64748b", Icon: FilePlus2 },
  requester_reply: { color: "#8b5cf6", Icon: Reply },
  rfq_sent:        { color: "#e8821a", Icon: Send },
  carrier_reply:   { color: "#10b981", Icon: Truck },
  reply_sent:      { color: "#0ea5e9", Icon: Inbox },
  quotation_sent:  { color: "#14b8a6", Icon: FileText },
  failed:          { color: "#ef4444", Icon: MailWarning },
  outcome:         { color: "#16a34a", Icon: BadgeCheck },
}

/** The whole path of a request: every email in and out, to the second, oldest first. Click an email to read it. */
export function RequestTimeline({ requestId, refreshKey }: { requestId: string; refreshKey?: unknown }) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/request-timeline?freight_request_id=${encodeURIComponent(requestId)}`, { cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      setEvents((await res.json()).events ?? [])
      setFailed(false)
    } catch { setFailed(true) }
  }, [requestId])

  useEffect(() => { void load() }, [load, refreshKey])
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void load() }, 30_000)
    return () => clearInterval(t)
  }, [load])

  const flip = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  if (events === null && !failed) {
    return <div className="flex items-center gap-2 px-5 py-6 text-xs" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading timeline…</div>
  }
  if (failed && events === null) {
    return (
      <div className="px-5 py-6 text-xs" style={{ color: "var(--text-muted)" }}>
        Could not load the timeline. <button onClick={() => void load()} className="font-semibold" style={{ color: "var(--brand-accent)" }}>Try again</button>
      </div>
    )
  }

  const list = events ?? []
  return (
    <div className="px-4 pb-4">
      <div className="mb-2 flex justify-end">
        <button onClick={() => void load()} className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}><RefreshCw className="h-3 w-3" /> Refresh</button>
      </div>
      <ol className="relative">
        <span aria-hidden className="absolute bottom-2 left-[13px] top-2 w-px" style={{ background: "var(--divider)" }} />
        {list.map((e, i) => {
          const { color, Icon } = KIND[e.kind] ?? KIND.added
          const expandable = !!(e.body || e.subject || e.from || e.to)
          const isOpen = open.has(e.id)
          const gap = i > 0 ? Date.parse(e.at) - Date.parse(list[i - 1].at) : null
          return (
            <li key={e.id} className="relative pb-3 pl-9">
              <span className="absolute left-0 top-0.5 flex h-[27px] w-[27px] items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 16%, var(--card-bg))`, border: `1.5px solid ${color}`, color }}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <button
                type="button"
                disabled={!expandable}
                onClick={() => flip(e.id)}
                aria-expanded={isOpen}
                className="w-full rounded-lg px-2.5 py-1.5 text-left transition-colors"
                style={{ background: isOpen ? "var(--table-header-bg)" : "transparent", cursor: expandable ? "pointer" : "default" }}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: e.kind === "failed" ? "#ef4444" : "var(--text-primary)" }}>{e.title}</span>
                  {expandable && <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform" style={{ color: "var(--text-muted)", transform: isOpen ? "rotate(180deg)" : undefined }} />}
                </span>
                <span className="mt-0.5 block font-mono text-[11.5px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  {fmtDateTimeSec(e.at)}
                  {gap != null && gap >= 0 && <span style={{ color: "var(--text-muted)" }}>{`  ·  +${fmtDuration(gap)}`}</span>}
                </span>
                {(e.from || e.to) && (
                  <span className="mt-0.5 block break-words text-[11.5px]" style={{ color: "var(--text-secondary)" }}>
                    {e.from && <b className="font-semibold">{e.from}</b>}{e.from && e.to && " → "}{e.to && <span>{e.to}</span>}
                  </span>
                )}
                {e.note && <span className="mt-0.5 block text-[11.5px] font-medium" style={{ color: e.kind === "carrier_reply" ? "#10b981" : "var(--text-muted)" }}>{e.note}</span>}
              </button>
              {isOpen && (
                <div className="mt-1 rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", animation: "lt-drop-in .16s ease-out" }}>
                  {e.subject && <p className="mb-1.5 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{e.subject}</p>}
                  {e.body
                    ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{e.body}</pre>
                    : <p className="text-xs" style={{ color: "var(--text-muted)" }}>The text of this email was not saved.</p>}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
