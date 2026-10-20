/**
 * lib/approval-reminders.ts (server) — repeated reminders to the people an approval is waiting for, at the interval set on each
 * workflow. Called by the reminders cron; safe to run as often as you like (it reads the notification log to avoid repeats).
 */
import { loadAllCycleNotify } from "@/lib/approval-notify"
import { emailsForUsernames, notify, requestValues } from "@/lib/notify"

const H = 3600_000
const ts = (v: unknown) => { const n = v ? Date.parse(String(v)) : NaN; return Number.isNaN(n) ? 0 : n }
function span(ms: number) {
  const h = Math.floor(ms / H)
  return h < 1 ? "less than an hour" : h < 48 ? `${h} hour${h > 1 ? "s" : ""}` : `${Math.floor(h / 24)} days`
}

export async function runApprovalReminders(admin: any, now = Date.now()) {
  const { data: smtpRows } = await admin.from("smtp_settings").select("client_code, enabled")
  const clients: string[] = (smtpRows ?? []).filter((r: any) => r.enabled !== false).map((r: any) => String(r.client_code))
  const report: { client: string; sent: number }[] = []
  for (const cc of clients) {
    let sent = 0
    try {
      const all = await loadAllCycleNotify(admin, cc)
      const on = Object.entries(all).filter(([, v]) => v.remind_enabled)
      if (!on.length) { report.push({ client: cc, sent }); continue }
      const everyH = new Map(on.map(([id, v]) => [id, v.remind_every_h]))
      const { data: active } = await admin.from("approval_requests")
        .select("id, request_id, cycle_id, sort_order, submitted_by, assigned_to, assigned_usernames, created_at, freight_requests!inner ( client_code, status )")
        .eq("step_status", "active").in("cycle_id", on.map(([id]) => id)).eq("freight_requests.client_code", cc)
      for (const row of (active ?? []) as any[]) {
        if (row.freight_requests?.status !== "Waiting for Approval") continue
        const { data: chain } = await admin.from("approval_requests").select("sort_order, decided_at").eq("request_id", row.request_id)
        const prev = ((chain ?? []) as any[]).filter((x) => x.sort_order < row.sort_order).map((x) => ts(x.decided_at))
        const since = Math.max(ts(row.created_at), ...prev, 0)
        const { data: last } = await admin.from("notification_log").select("created_at").eq("client_code", cc).eq("event_key", "approval_reminder").eq("request_id", row.request_id).order("created_at", { ascending: false }).limit(1)
        const from = Math.max(since, ts((last ?? [])[0]?.created_at))
        if (now - from < (everyH.get(row.cycle_id) ?? 24) * H) continue
        const names: string[] = row.assigned_usernames?.length ? row.assigned_usernames : [row.assigned_to].filter(Boolean)
        const to = await emailsForUsernames(admin, cc, names)
        const vals = await requestValues(admin, cc, row.request_id)
        const r = await notify(admin, cc, "approval_reminder", { ...vals, approval_step: String(row.sort_order + 1), submitted_by: row.submitted_by ?? "", waiting_for: span(now - since) }, { to, requestId: row.request_id })
        if (r.status === "sent") sent++
      }
    } catch (e) { console.error("[approval reminders]", cc, (e as Error).message) }
    report.push({ client: cc, sent })
  }
  return report
}
