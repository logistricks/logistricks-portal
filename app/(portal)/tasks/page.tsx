"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlarmClock, ArrowRight, BellOff, CheckCircle2, Clock, Crosshair, Hourglass, Loader2, PartyPopper, RefreshCw, Siren } from "lucide-react"
import { PageHero } from "@/components/portal/page-hero"
import { useToast } from "@/components/ui/toast"

type Task = {
  key: string; requestId: string; ref: string; type: string; title: string; why: string; action: string
  dueAt: number; waiting: boolean; urgent: boolean; sender: string; route: string; cargo: string; modes: string[]
  value: number | null; snoozedUntil?: number | null
}
type Data = { now: number; tasks: Task[]; snoozed: Task[]; counts: { overdue: number; actionable: number; waiting: number; snoozed: number }; doneToday: number; goal: number }

const href = (t: Task) => (t.type === "approve" ? "/approvals" : `/requests/${t.requestId}`)
function dur(ms: number) {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h${m % 60 ? ` ${m % 60}m` : ""}`
  const d = Math.floor(h / 24)
  return `${d}d${h % 24 ? ` ${h % 24}h` : ""}`
}
const dueText = (t: Task, now: number) => (t.dueAt < now ? `Overdue by ${dur(now - t.dueAt)}` : `Due in ${dur(t.dueAt - now)}`)
const money = (v: number | null) => (v ? `$${Math.round(v).toLocaleString("en-US")}` : "")

const SNOOZES: { label: string; at: () => number }[] = [
  { label: "In 1 hour", at: () => Date.now() + 3600_000 },
  { label: "In 4 hours", at: () => Date.now() + 4 * 3600_000 },
  { label: "Tomorrow, 9:00", at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime() } },
  { label: "Next Monday, 9:00", at: () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(9, 0, 0, 0); return d.getTime() } },
]
const REASONS = ["Waiting on the requester", "Waiting on a carrier", "Need more information", "Other"]

function Ring({ done, goal }: { done: number; goal: number }) {
  const pct = Math.min(1, goal ? done / goal : 0), r = 42, c = 2 * Math.PI * r
  return (
    <div className="relative flex h-[116px] w-[116px] items-center justify-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--brand-accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="text-center text-white">
        <div className="text-[28px] font-extrabold leading-none">{done}</div>
        <div className="mt-0.5 text-[11px] font-semibold text-white/70">of {goal} today</div>
      </div>
    </div>
  )
}

function SnoozeMenu({ onPick, onClose }: { onPick: (until: number, reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h)
  }, [onClose])
  return (
    <div ref={ref} className="absolute left-1/2 top-full z-30 mt-2 w-[290px] -translate-x-1/2 rounded-2xl border p-3 text-center shadow-2xl"
      style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
      <p className="mb-2 text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Remind me</p>
      <div className="grid grid-cols-2 gap-1.5">
        {SNOOZES.map((s) => (
          <button key={s.label} type="button" onClick={() => onPick(s.at(), reason)} className="rounded-lg border px-2 py-2 text-[12.5px] font-semibold"
            style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>{s.label}</button>
        ))}
      </div>
      <p className="mb-1.5 mt-3 text-[11.5px] font-semibold" style={{ color: "var(--text-muted)" }}>Why? (optional)</p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(reason === r ? "" : r)} className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
            style={reason === r ? { background: "var(--brand-accent)", color: "var(--brand-navy)", borderColor: "transparent" } : { borderColor: "var(--card-border)", color: "var(--text-secondary)" }}>{r}</button>
        ))}
      </div>
    </div>
  )
}

export default function TasksPage() {
  const { error: toastError } = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [focus, setFocus] = useState(false)
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => { try { setFocus(localStorage.getItem("lt_tasks_focus") === "1") } catch { /* */ } }, [])
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await fetch(`/api/tasks?tz=${new Date().getTimezoneOffset()}`, { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Could not load tasks")
      setData(j)
    } catch (e) { if (!silent) toastError("Tasks failed to load", (e as Error).message) }
    finally { setLoading(false) }
  }, [toastError])
  useEffect(() => {
    void load()
    const t = setInterval(() => { if (!document.hidden) void load(true) }, 30_000)
    const v = () => { if (!document.hidden) void load(true) }
    document.addEventListener("visibilitychange", v)
    const clock = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => { clearInterval(t); clearInterval(clock); document.removeEventListener("visibilitychange", v) }
  }, [load])

  const when = Date.now() + (tick ? 0 : 0) // re-read on every render; `tick` re-renders every 30 s so the "overdue by" times keep moving

  const groups = useMemo(() => {
    const eod = new Date(); eod.setHours(23, 59, 59, 999)
    const mine = (data?.tasks ?? []).filter((t) => !t.waiting)
    return {
      overdue: mine.filter((t) => t.dueAt < when),
      today: mine.filter((t) => t.dueAt >= when && t.dueAt <= eod.getTime()),
      later: mine.filter((t) => t.dueAt > eod.getTime()),
      waiting: (data?.tasks ?? []).filter((t) => t.waiting),
    }
  }, [data, when])
  const next = groups.overdue[0] ?? groups.today[0] ?? groups.later[0] ?? null
  const remaining = groups.overdue.length + groups.today.length + groups.later.length

  async function act(task: Task, body: Record<string, unknown>) {
    setBusy(task.key); setSnoozeFor(null)
    try {
      const r = await fetch("/api/tasks/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: task.key, ...body }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toastError("Could not update the task", j.error); return }
      await load(true)
    } finally { setBusy(null) }
  }
  const setFocusPersist = (v: boolean) => { setFocus(v); try { localStorage.setItem("lt_tasks_focus", v ? "1" : "0") } catch { /* */ } }

  const Row = ({ t, muted }: { t: Task; muted?: boolean }) => (
    <Link href={href(t)} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 py-3.5 text-center transition-colors"
      style={{ borderTop: "1px solid var(--divider)", opacity: muted ? 0.8 : 1 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
      <span className="font-mono text-[12.5px] font-bold" style={{ color: "var(--text-primary)" }}>{t.ref}</span>
      <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{t.title}</span>
      <span className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>{t.sender}{t.route ? ` · ${t.route}` : ""}</span>
      <span className="text-[12px] font-bold" style={{ color: t.dueAt < when && !t.waiting ? "#dc2626" : "var(--text-muted)" }}>
        {t.waiting ? `Chase in ${dur(t.dueAt - when)}` : t.snoozedUntil ? `Back in ${dur(t.snoozedUntil - when)}` : dueText(t, when)}
      </span>
      {t.urgent && <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: "rgba(239,68,68,0.12)", color: "#dc2626" }}>URGENT</span>}
    </Link>
  )
  const Section = ({ title, icon, items, tone, muted }: { title: string; icon: React.ReactNode; items: Task[]; tone?: string; muted?: boolean }) =>
    items.length === 0 ? null : (
      <div className="ds-card overflow-hidden">
        <div className="ds-card-header" style={{ justifyContent: "center" }}>
          <span className="flex items-center gap-2 font-display text-[18px] font-extrabold" style={{ color: tone ?? "var(--text-primary)" }}>{icon}{title}
            <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: "var(--page-bg)", color: "var(--text-secondary)" }}>{items.length}</span></span>
        </div>
        {items.map((t) => <Row key={t.key} t={t} muted={muted} />)}
      </div>
    )

  return (
    <div className="portal-page space-y-5 p-6">
      <PageHero
        eyebrow={<>Tasks<RefreshCw className="h-3 w-3" /></>}
        title="Your focus for today"
        chips={data ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white" style={{ background: groups.overdue.length ? "rgba(239,68,68,0.28)" : "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>{`${groups.overdue.length} overdue`}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white" style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>{`${groups.today.length} due today`}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white" style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>{`${groups.waiting.length} waiting on others`}</span>
          </>
        ) : null}
        aside={data ? <Ring done={data.doneToday} goal={data.goal} /> : null}
        floatAside
      />

      <div className="flex justify-center">
        <button type="button" onClick={() => setFocusPersist(!focus)} className="inline-flex items-center gap-2 rounded-xl border-[1.5px] px-5 py-2.5 text-[13.5px] font-bold"
          style={{ borderColor: focus ? "var(--brand-accent)" : "var(--text-secondary)", color: "var(--text-primary)", background: focus ? "rgb(var(--brand-accent-rgb) / 0.12)" : "var(--card-bg)" }}>
          <Crosshair className="h-4 w-4" /> Focus mode {focus ? "on" : "off"}
        </button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--text-muted)" }} /></div>
      ) : (
        <>
          {/* Do this next */}
          {next ? (
            <div className="ds-card relative mx-auto w-full max-w-[860px] p-7 text-center" style={{ outline: "2px solid rgb(var(--brand-accent-rgb) / 0.55)" }}>
              <p className="font-mono text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--brand-accent)" }}>Do this next</p>
              <h2 className="mt-2 text-[30px] font-extrabold leading-tight" style={{ color: "var(--text-primary)" }}>{next.title}</h2>
              <p className="mt-1 text-[15px]" style={{ color: "var(--text-secondary)" }}>{next.why}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[13.5px]" style={{ color: "var(--text-primary)" }}>
                <span className="font-mono font-bold">{next.ref}</span><span style={{ color: "var(--text-muted)" }}>·</span>
                <span className="font-semibold">{next.sender}</span>
                {next.route && <><span style={{ color: "var(--text-muted)" }}>·</span><span>{next.route}</span></>}
                {next.modes.length > 0 && <><span style={{ color: "var(--text-muted)" }}>·</span><span>{next.modes.join(" / ")}</span></>}
                {next.value ? <><span style={{ color: "var(--text-muted)" }}>·</span><span className="font-semibold">{money(next.value)}</span></> : null}
                {next.urgent && <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: "rgba(239,68,68,0.12)", color: "#dc2626" }}>URGENT</span>}
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: next.dueAt < when ? "#dc2626" : "var(--text-secondary)" }}>
                <Clock className="h-3.5 w-3.5" />{dueText(next, when)}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                <Link href={href(next)} className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-[16px] font-extrabold"
                  style={{ background: "var(--brand-accent)", color: "var(--brand-navy)", boxShadow: "0 14px 28px -14px rgb(var(--brand-accent-rgb) / .8)" }}>
                  {next.action} <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="relative">
                  <button type="button" onClick={() => setSnoozeFor(snoozeFor === next.key ? null : next.key)} disabled={busy === next.key}
                    className="inline-flex items-center gap-2 rounded-xl border-[1.5px] px-5 py-3 text-[14px] font-bold"
                    style={{ borderColor: "var(--text-secondary)", color: "var(--text-primary)", background: "var(--card-bg)" }}>
                    <AlarmClock className="h-4 w-4" /> Snooze
                  </button>
                  {snoozeFor === next.key && <SnoozeMenu onClose={() => setSnoozeFor(null)} onPick={(until, reason) => void act(next, { action: "snooze", until: new Date(until).toISOString(), reason })} />}
                </div>
                <button type="button" onClick={() => void act(next, { action: "dismiss" })} disabled={busy === next.key}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                  <BellOff className="h-4 w-4" /> Not needed
                </button>
              </div>
              {focus && <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{remaining - 1} more after this one</p>}
            </div>
          ) : (
            <div className="ds-card mx-auto w-full max-w-[860px] p-9 text-center">
              <PartyPopper className="mx-auto h-9 w-9" style={{ color: "var(--brand-accent)" }} />
              <h2 className="mt-3 text-[28px] font-extrabold" style={{ color: "var(--text-primary)" }}>All clear</h2>
              <p className="mt-1 text-[15px]" style={{ color: "var(--text-secondary)" }}>
                Nothing needs you right now{groups.waiting.length ? ` — ${groups.waiting.length} request${groups.waiting.length > 1 ? "s are" : " is"} waiting on others.` : "."}
              </p>
            </div>
          )}

          {!focus && (
            <div className="mx-auto w-full max-w-[1000px] space-y-5">
              <Section title="Overdue" icon={<Siren className="h-5 w-5" />} tone="#dc2626" items={groups.overdue.filter((t) => t !== next)} />
              <Section title="Due today" icon={<Clock className="h-5 w-5" />} items={groups.today.filter((t) => t !== next)} />
              <Section title="Later" icon={<CheckCircle2 className="h-5 w-5" />} items={groups.later.filter((t) => t !== next)} />
              <Section title="Waiting on others" icon={<Hourglass className="h-5 w-5" />} items={groups.waiting} muted />
              {(data?.snoozed.length ?? 0) > 0 && (
                <div className="text-center">
                  <button type="button" onClick={() => setShowSnoozed(!showSnoozed)} className="text-[13px] font-semibold underline" style={{ color: "var(--text-secondary)" }}>
                    {showSnoozed ? "Hide" : "Show"} {data!.snoozed.length} snoozed
                  </button>
                  {showSnoozed && (
                    <div className="ds-card mt-3 overflow-hidden">
                      {data!.snoozed.map((t) => (
                        <div key={t.key} className="flex flex-wrap items-center justify-center gap-4" style={{ borderTop: "1px solid var(--divider)" }}>
                          <div className="flex-1"><Row t={t} muted /></div>
                          <button type="button" onClick={() => void act(t, { action: "restore" })} className="mr-4 rounded-lg border px-3 py-1.5 text-[12px] font-bold" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>Bring back</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
