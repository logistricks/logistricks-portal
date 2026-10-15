/**
 * GET /api/tasks?tz=<minutes>[&count=1]
 * The company's to-do list, worked out from its requests (see lib/task-rules.ts), minus anything snoozed or marked
 * "not needed", plus how many task-type actions were done today (for the progress ring).
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { computeTasks, loadLimits, loadReminders } from "@/lib/task-rules"
import { loadEmails } from "@/lib/task-emails"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Things people do that clear a task
const DONE_EVENTS = ["request_fields_confirmed", "rfq_sent", "quotation_created", "quotation_sent", "request_outcome", "approval_step_approved", "approval_step_rejected", "quotation_forwarded"]

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const tz = Number(sp.get("tz") ?? 0) || 0
  const admin = adminClient()
  const cc = session.clientCode
  const now = Date.now()

  try {
    const limits = await loadLimits(admin, cc)
    // lightweight: which requests are overdue / stuck (tags on the Requests list)
    if (sp.get("map")) {
      const [all, em] = await Promise.all([computeTasks(admin, cc, limits, now), loadEmails(admin, cc)])
      const map: Record<string, { lateH: number; title: string; stuck: boolean }> = {}
      for (const t of all) {
        if (t.waiting || t.dueAt >= now) continue
        const lateH = (now - t.dueAt) / 3600_000
        map[t.requestId] = { lateH: Math.round(lateH * 10) / 10, title: t.title, stuck: lateH >= em.escalate_after_h }
      }
      return NextResponse.json({ map, stuckAfterH: em.escalate_after_h })
    }
    const dayStart = (() => { const d = new Date(now - tz * 60_000); d.setUTCHours(0, 0, 0, 0); return d.getTime() + tz * 60_000 })()
    const [all, stateRes, doneRes] = await Promise.all([
      computeTasks(admin, cc, limits, now),
      admin.from("task_state").select("task_key, snoozed_until, dismissed").eq("client_code", cc).or(`dismissed.eq.true,snoozed_until.gt.${new Date(now).toISOString()}`).limit(5000),
      admin.from("activity_log").select("id", { count: "exact", head: true }).eq("client_code", cc).in("event_type", DONE_EVENTS).gte("created_at", new Date(dayStart).toISOString()),
    ])
    const state = new Map<string, { until: number; dismissed: boolean }>()
    for (const s of stateRes.data ?? []) state.set((s as any).task_key, { until: (s as any).snoozed_until ? Date.parse((s as any).snoozed_until) : 0, dismissed: !!(s as any).dismissed })

    const tasks = all.filter((x) => !state.get(x.key)?.dismissed && (state.get(x.key)?.until ?? 0) <= now)
    const snoozed = all.filter((x) => (state.get(x.key)?.until ?? 0) > now && !state.get(x.key)?.dismissed).map((x) => ({ ...x, snoozedUntil: state.get(x.key)!.until }))
    const actionable = tasks.filter((x) => !x.waiting)
    const counts = { overdue: actionable.filter((x) => x.dueAt < now).length, actionable: actionable.length, waiting: tasks.length - actionable.length, snoozed: snoozed.length }
    if (sp.get("count")) return NextResponse.json({ counts })
    if (sp.get("summary")) {
      // for the reminders: counts, the three most pressing tasks, which ones are overdue (to spot new ones), and the reminder settings
      const ranked = [...actionable].sort((a, b) => Number(a.dueAt >= now) - Number(b.dueAt >= now) || b.score - a.score || a.dueAt - b.dueAt)
      const dueToday = (() => { const e = new Date(now - tz * 60_000); e.setUTCHours(23, 59, 59, 999); const end = e.getTime() + tz * 60_000; return actionable.filter((x) => x.dueAt >= now && x.dueAt <= end).length })()
      return NextResponse.json({
        counts: { ...counts, dueToday }, doneToday: doneRes.count ?? 0, goal: limits.daily_goal,
        top: ranked.slice(0, 3).map((x) => ({ key: x.key, ref: x.ref, title: x.title, sender: x.sender, overdue: x.dueAt < now, urgent: x.urgent })),
        overdueKeys: actionable.filter((x) => x.dueAt < now).map((x) => x.key).slice(0, 300),
        reminders: await loadReminders(admin, cc),
      })
    }

    // yours first (overdue before not-yet-due, then by priority), things waiting on others last
    tasks.sort((a, b) => Number(a.waiting) - Number(b.waiting) || Number(a.dueAt >= now) - Number(b.dueAt >= now) || b.score - a.score || a.dueAt - b.dueAt)
    return NextResponse.json({ now, tasks, snoozed, counts, doneToday: doneRes.count ?? 0, goal: limits.daily_goal, limits })
  } catch (e: any) {
    console.error("[api/tasks]", e?.message ?? e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}
