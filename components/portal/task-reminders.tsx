"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { X } from "lucide-react"

type Top = { key: string; ref: string; title: string; sender: string; overdue: boolean; urgent: boolean }
type Summary = {
  counts: { overdue: number; actionable: number; waiting: number; snoozed: number; dueToday: number }
  doneToday: number; goal: number; top: Top[]; overdueKeys: string[]
  reminders: { popups: boolean; interval_min: number; daily_window: boolean; browser: boolean; quiet_from: string; quiet_to: string }
}

export const TASK_COUNTS_EVENT = "lt-task-counts"
const mins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m }
function inQuietHours(from: string, to: string) {
  const d = new Date(), now = d.getHours() * 60 + d.getMinutes(), a = mins(from), b = mins(to)
  if (a === b) return false
  return a < b ? now >= a && now < b : now >= a || now < b   // e.g. 20:00 → 07:00 wraps past midnight
}
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }

/**
 * Reminders, in the portal: keeps the Tasks count fresh, puts the overdue count in the browser tab's title, pops up when
 * tasks go overdue (and now and then while they stay overdue), and shows "Here's your day" the first time each day.
 * Everything honours the Admin → Task Setup settings and each person's quiet hours.
 */
export function TaskReminders() {
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname() ?? ""
  const pathRef = useRef(pathname)
  useEffect(() => { pathRef.current = pathname }, [pathname])
  const seen = useRef<Set<string> | null>(null)
  const [day, setDay] = useState<Summary | null>(null)

  // title prefix "(3) …" while something is overdue
  const overdueRef = useRef(0)
  useEffect(() => {
    const strip = (t: string) => t.replace(/^\(\d+\)\s/, "")
    const apply = () => {
      const want = overdueRef.current > 0 ? `(${overdueRef.current}) ${strip(document.title)}` : strip(document.title)
      if (document.title !== want) document.title = want
    }
    const titleEl = document.querySelector("title")
    const mo = new MutationObserver(apply)
    if (titleEl) mo.observe(titleEl, { childList: true, characterData: true, subtree: true })
    const t = setInterval(apply, 5000)
    ;(window as any).__ltApplyTitle = apply
    return () => { mo.disconnect(); clearInterval(t) }
  }, [])

  useEffect(() => {
    let stopped = false
    const notify = (title: string, body: string) => {
      try {
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          const n = new Notification(title, { body, tag: "lt-tasks" })
          n.onclick = () => { window.focus(); router.push("/tasks"); n.close() }
        }
      } catch { /* */ }
    }
    async function poll() {
      if (document.hidden && seen.current) return
      try {
        const r = await fetch(`/api/tasks?summary=1&tz=${new Date().getTimezoneOffset()}`, { cache: "no-store" })
        if (!r.ok || stopped) return
        const s: Summary = await r.json()
        overdueRef.current = s.counts.overdue
        ;(window as any).__ltTaskCounts = s.counts
        window.dispatchEvent(new CustomEvent(TASK_COUNTS_EVENT, { detail: s.counts }))
        ;(window as any).__ltApplyTitle?.()

        const rem = s.reminders
        const quiet = inQuietHours(rem.quiet_from, rem.quiet_to)
        const onTasks = pathRef.current === "/tasks"
        const keys = new Set(s.overdueKeys)
        const first = seen.current === null

        // "Here's your day": once per calendar day per browser, on the first look
        let shownDay = false
        if (first && rem.daily_window && s.counts.actionable > 0 && !quiet) {
          try { if (localStorage.getItem("lt_day_window") !== dayKey()) { localStorage.setItem("lt_day_window", dayKey()); setDay(s); shownDay = true } } catch { /* */ }
        }
        // newly overdue since the last look → popup
        const fresh = first ? [] : s.overdueKeys.filter((k) => !seen.current!.has(k))
        seen.current = keys
        if (rem.popups && !quiet && !onTasks) {
          let nag = false
          if (fresh.length === 0 && s.counts.overdue > 0) {
            try { nag = Date.now() - Number(localStorage.getItem("lt_task_nag") || 0) > rem.interval_min * 60_000 } catch { /* */ }
            if (shownDay) nag = false   // the daily window just said it
          }
          if (fresh.length > 0 || nag) {
            try { localStorage.setItem("lt_task_nag", String(Date.now())) } catch { /* */ }
            const n = fresh.length || s.counts.overdue
            const title = fresh.length ? `${n} task${n > 1 ? "s" : ""} just went overdue` : `You have ${n} overdue task${n > 1 ? "s" : ""}`
            toast({ variant: "warning", title, duration: 10_000, action: { label: "Open tasks", onClick: () => router.push("/tasks") } })
            if (rem.browser) notify("Logistricks", title)
          }
        }
      } catch { /* try again next time */ }
    }
    void poll()
    const t = setInterval(poll, 60_000)
    const v = () => { if (!document.hidden) void poll() }
    document.addEventListener("visibilitychange", v)
    return () => { stopped = true; clearInterval(t); document.removeEventListener("visibilitychange", v) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!day) return null
  const c = day.counts
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: "rgba(8,15,30,0.55)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setDay(null) }}>
      <div className="relative w-full max-w-[480px] rounded-[22px] px-7 py-8 text-center text-white"
        style={{ background: "radial-gradient(520px 200px at 100% 0%, rgb(var(--brand-accent-rgb) / 0.30), transparent 65%), linear-gradient(135deg, #0F1E36 0%, #1A2D4A 100%)", border: "1px solid rgba(255,255,255,.18)", boxShadow: "0 30px 60px -20px rgba(0,0,0,.6)" }}>
        <button type="button" aria-label="Close" onClick={() => setDay(null)} className="absolute right-4 top-4 text-white/50 hover:text-white"><X className="h-4 w-4" /></button>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "#E8821A" }}>Here&apos;s your day</p>
        <h2 className="mt-2 text-[28px] font-extrabold leading-tight">
          {c.overdue > 0 ? `${c.overdue} thing${c.overdue > 1 ? "s" : ""} waiting on you` : `${c.actionable} task${c.actionable > 1 ? "s" : ""} for today`}
        </h2>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-[13px] font-semibold">
          <span className="rounded-full px-3.5 py-1.5" style={{ background: c.overdue ? "rgba(239,68,68,0.28)" : "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>{c.overdue} overdue</span>
          <span className="rounded-full px-3.5 py-1.5" style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>{c.dueToday} due today</span>
          <span className="rounded-full px-3.5 py-1.5" style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" }}>{c.waiting} waiting on others</span>
        </div>
        {day.top.length > 0 && (
          <div className="mt-5 space-y-1.5 text-left">
            <p className="text-center text-[11.5px] font-bold uppercase tracking-wide text-white/60">Start with</p>
            {day.top.map((t) => (
              <div key={t.key} className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <span className="min-w-0 truncate text-[13.5px] font-semibold">{t.title}</span>
                <span className="shrink-0 font-mono text-[12px] text-white/70">{t.ref}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-center gap-2.5">
          <Link href="/tasks" onClick={() => setDay(null)} className="rounded-xl px-7 py-3 text-[15px] font-extrabold" style={{ background: "#E8821A", color: "#0F1E36" }}>Open my tasks</Link>
          <button type="button" onClick={() => setDay(null)} className="rounded-xl px-5 py-3 text-[14px] font-semibold text-white/80">Later</button>
        </div>
      </div>
    </div>
  )
}
