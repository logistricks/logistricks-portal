/**
 * lib/task-emails.ts  (server only)
 *
 * Email reminders, run by a scheduled call to /api/cron/reminders (every ~15 minutes is plenty):
 *   • morning digest  — each working day at a set time: what is overdue / due today, the top tasks, last week's score
 *   • urgent email    — an urgent / AOG / dangerous-goods task is overdue
 *   • escalation      — any task is badly overdue → the managers (admins)
 *   • weekly summary  — Pipeline Health for the week, to the managers
 * Every email is claimed in task_email_log first, so a run that repeats never sends the same thing twice.
 */
import { computeTasks, loadLimits, type Task } from "@/lib/task-rules"
import { computeHealth } from "@/lib/pipeline-health"
import { loadSmtp, sendMail, portalBaseUrl, smtpError } from "@/lib/notify"
import { emailDocument } from "@/lib/notification-events"

const H = 3600_000
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export const DEFAULT_EMAILS = {
  tz: "Asia/Amman",                 // the company's clock for "08:00" and "working days"
  digest: true, digest_time: "08:00", days: [0, 1, 2, 3, 4] as number[],   // 0 = Sunday … 6 = Saturday
  digest_roles: ["admin", "operator"] as string[],
  urgent: true, urgent_after_h: 1,
  escalate: true, escalate_after_h: 24,
  weekly: true, weekly_day: 0, weekly_time: "08:00",
}
export type TaskEmails = typeof DEFAULT_EMAILS

export function cleanEmails(v: any): TaskEmails {
  const o: any = { ...DEFAULT_EMAILS, days: [...DEFAULT_EMAILS.days], digest_roles: [...DEFAULT_EMAILS.digest_roles] }
  if (!v || typeof v !== "object") return o
  if (typeof v.tz === "string") { try { new Intl.DateTimeFormat("en", { timeZone: v.tz }); o.tz = v.tz } catch { /* keep default */ } }
  for (const k of ["digest", "urgent", "escalate", "weekly"] as const) if (typeof v[k] === "boolean") o[k] = v[k]
  for (const k of ["digest_time", "weekly_time"] as const) if (typeof v[k] === "string" && HHMM.test(v[k])) o[k] = v[k]
  if (Array.isArray(v.days)) o.days = Array.from(new Set(v.days.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))).sort()
  if (Array.isArray(v.digest_roles)) o.digest_roles = v.digest_roles.filter((r: unknown) => ["admin", "operator", "viewer"].includes(String(r))).map(String)
  const a = Number(v.urgent_after_h); if (Number.isFinite(a) && a >= 0 && a <= 168) o.urgent_after_h = a
  const b = Number(v.escalate_after_h); if (Number.isFinite(b) && b > 0 && b <= 720) o.escalate_after_h = b
  const d = Number(v.weekly_day); if (Number.isInteger(d) && d >= 0 && d <= 6) o.weekly_day = d
  return o
}

export async function loadEmails(admin: any, cc: string): Promise<TaskEmails> {
  try {
    const { data } = await admin.from("client_settings").select("value").eq("client_code", cc).eq("key", "task_emails").maybeSingle()
    return cleanEmails(data?.value)
  } catch { return cleanEmails(null) }
}

// ── small helpers ─────────────────────────────────────────────────────────────

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Local date parts for a time zone. */
function localParts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday)
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, wd, hour: Number(p.hour) }
}

function lateText(ms: number) {
  const h = Math.floor(ms / H)
  if (h < 1) return "just now"
  if (h < 48) return `${h}h late`
  return `${Math.floor(h / 24)}d late`
}

async function recipients(admin: any, cc: string, roles: string[]): Promise<string[]> {
  if (!roles.length) return []
  const { data } = await admin.from("portal_users").select("auth_email").ilike("client_code", cc).eq("is_active", true).in("role", roles)
  return Array.from(new Set((data ?? []).map((r: any) => String(r.auth_email ?? "").trim().toLowerCase()).filter((e: string) => EMAIL_RE.test(e) && !/\.portal$/i.test(e))))
}

/** Claims keys that were not sent before; returns the ones this run now owns. */
async function claim(admin: any, cc: string, keys: string[]): Promise<string[]> {
  if (!keys.length) return []
  const { data: have, error } = await admin.from("task_email_log").select("key").eq("client_code", cc).in("key", keys)
  if (error) throw new Error(/task_email_log/.test(error.message) ? "Run migration 073 (task_email_log) first." : error.message)
  const done = new Set((have ?? []).map((r: any) => r.key))
  const fresh = keys.filter((k) => !done.has(k))
  if (!fresh.length) return []
  const { error: e2 } = await admin.from("task_email_log").upsert(fresh.map((key) => ({ client_code: cc, key })), { onConflict: "client_code,key", ignoreDuplicates: true })
  if (e2) throw new Error(e2.message)
  return fresh
}
const release = (admin: any, cc: string, keys: string[]) => admin.from("task_email_log").delete().eq("client_code", cc).in("key", keys)

function card(title: string, intro: string, body: string, link: { href: string; label: string }) {
  const inner = `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:26px 24px;text-align:center">
    <div style="font-size:21px;font-weight:800;color:#0f172a;margin-bottom:6px">${esc(title)}</div>
    <div style="font-size:14px;color:#475569;margin-bottom:18px;line-height:1.5">${intro}</div>
    ${body}
    <div style="margin-top:22px"><a href="${esc(link.href)}" style="display:inline-block;background:#e8821a;color:#0f172a;text-decoration:none;font-weight:700;font-size:14px;padding:11px 26px;border-radius:999px">${esc(link.label)}</a></div>
  </div>`
  return emailDocument(inner)
}

function taskRows(tasks: Task[], now: number, base: string, max = 8): { html: string; text: string } {
  const top = tasks.slice(0, max)
  const html = top.map((t) => `<div style="text-align:left;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;margin:8px 0">
      <div style="font-size:13.5px;font-weight:700;color:#0f172a"><a href="${esc(base)}/requests/${esc(t.requestId)}" style="color:#0f172a;text-decoration:none">${esc(t.ref)}</a> · ${esc(t.title)}${t.urgent ? ' <span style="color:#dc2626">· urgent</span>' : ""}</div>
      <div style="font-size:12.5px;color:#64748b;margin-top:2px">${esc([t.sender, t.route].filter(Boolean).join(" · "))}</div>
      <div style="font-size:12.5px;color:${t.dueAt < now ? "#dc2626" : "#64748b"};margin-top:2px">${esc(t.why)}${t.dueAt < now ? ` · ${lateText(now - t.dueAt)}` : ""}</div>
    </div>`).join("") + (tasks.length > max ? `<div style="font-size:12.5px;color:#64748b;margin-top:6px">and ${tasks.length - max} more</div>` : "")
  const text = top.map((t) => `- ${t.ref} · ${t.title}${t.urgent ? " (urgent)" : ""} — ${t.why}${t.dueAt < now ? `, ${lateText(now - t.dueAt)}` : ""}`).join("\n") + (tasks.length > max ? `\n…and ${tasks.length - max} more` : "")
  return { html, text }
}

const byScore = (a: Task, b: Task) => b.score - a.score

// ── the run ────────────────────────────────────────────────────────────────────

export async function runReminders(admin: any, now = Date.now()) {
  const { data: smtpRows } = await admin.from("smtp_settings").select("client_code, enabled")
  const clients: string[] = (smtpRows ?? []).filter((r: any) => r.enabled !== false).map((r: any) => String(r.client_code))
  const report: Record<string, unknown>[] = []

  for (const cc of clients) {
    const out: Record<string, unknown> = { client: cc }
    try {
      const [S, limits, cfg] = await Promise.all([loadEmails(admin, cc), loadLimits(admin, cc), loadSmtp(admin, cc)])
      if (!cfg || !cfg.enabled) { out.skipped = "email server off"; report.push(out); continue }
      if (!S.digest && !S.urgent && !S.escalate && !S.weekly) { out.skipped = "all reminder emails off"; report.push(out); continue }
      const base = portalBaseUrl()
      const lp = localParts(now, S.tz)
      const daytime = lp.hour >= 7 && lp.hour < 21
      const needTasks = S.digest || S.urgent || S.escalate
      const tasks = needTasks ? await computeTasks(admin, cc, limits, now) : []
      const open = tasks.filter((t) => !t.waiting)
      const overdue = open.filter((t) => t.dueAt < now)
      const sent: string[] = []

      // morning digest
      if (S.digest && S.days.includes(lp.wd) && lp.hm >= S.digest_time) {
        const key = `digest:${lp.date}`
        const to = await recipients(admin, cc, S.digest_roles)
        if (to.length && (await claim(admin, cc, [key])).length) {
          try {
            const dueToday = open.filter((t) => t.dueAt >= now && t.dueAt < now + 18 * H)
            const list = [...overdue.sort(byScore), ...dueToday.sort(byScore)]
            let healthLine = ""
            try {
              const h = await computeHealth(admin, cc, limits, now - 7 * 24 * H, now, now)
              if (h.score !== null) healthLine = `Pipeline Health, last 7 days: <b>${h.score}</b> (target ${h.target})`
            } catch { /* optional */ }
            const rows = taskRows(list, now, base)
            const title = overdue.length ? `${overdue.length} overdue, ${dueToday.length} due today` : dueToday.length ? `${dueToday.length} due today` : "Nothing overdue"
            const html = card("Here's your day", `${esc(title)}${healthLine ? `<br><span style="font-size:13px">${healthLine}</span>` : ""}`, list.length ? rows.html : `<div style="font-size:14px;color:#16a34a;font-weight:700">All clear. Nice work.</div>`, { href: `${base}/tasks`, label: "Open my tasks" })
            await sendMail(cfg, { to, subject: `Your day: ${title}`, html, text: `Here's your day — ${title}\n\n${rows.text}\n\n${base}/tasks` })
            sent.push(`digest → ${to.length}`)
          } catch (e) { await release(admin, cc, [key]); throw e }
        }
      }

      // urgent + escalation (daytime only)
      if (daytime) {
        if (S.urgent) {
          const list = open.filter((t) => t.urgent && now - t.dueAt >= S.urgent_after_h * H).sort(byScore)
          const fresh = await claim(admin, cc, list.map((t) => `urgent:${t.key}`))
          const mine = list.filter((t) => fresh.includes(`urgent:${t.key}`))
          const to = await recipients(admin, cc, S.digest_roles)
          if (mine.length && to.length) {
            try {
              const rows = taskRows(mine, now, base, 10)
              const html = card("Urgent request overdue", `${mine.length} urgent task${mine.length > 1 ? "s are" : " is"} past ${mine.length > 1 ? "their" : "its"} time limit.`, rows.html, { href: `${base}/tasks`, label: "Open my tasks" })
              await sendMail(cfg, { to, subject: `Urgent: ${mine[0].ref}${mine.length > 1 ? ` and ${mine.length - 1} more` : ""} overdue`, html, text: `Urgent tasks overdue:\n\n${rows.text}\n\n${base}/tasks` })
              sent.push(`urgent → ${to.length}`)
            } catch (e) { await release(admin, cc, mine.map((t) => `urgent:${t.key}`)); throw e }
          } else if (mine.length) await release(admin, cc, mine.map((t) => `urgent:${t.key}`))
        }
        if (S.escalate) {
          const list = open.filter((t) => now - t.dueAt >= S.escalate_after_h * H).sort(byScore)
          const fresh = await claim(admin, cc, list.map((t) => `escalate:${t.key}`))
          const mine = list.filter((t) => fresh.includes(`escalate:${t.key}`))
          const to = await recipients(admin, cc, ["admin"])
          if (mine.length && to.length) {
            try {
              const rows = taskRows(mine, now, base, 10)
              const html = card("Needs a manager's eye", `${mine.length} task${mine.length > 1 ? "s have" : " has"} been overdue for more than ${S.escalate_after_h} hours.`, rows.html, { href: `${base}/tasks`, label: "Open tasks" })
              await sendMail(cfg, { to, subject: `Escalation: ${mine.length} task${mine.length > 1 ? "s" : ""} overdue by ${S.escalate_after_h}h+`, html, text: `Overdue by more than ${S.escalate_after_h} hours:\n\n${rows.text}\n\n${base}/tasks` })
              sent.push(`escalation → ${to.length}`)
            } catch (e) { await release(admin, cc, mine.map((t) => `escalate:${t.key}`)); throw e }
          } else if (mine.length) await release(admin, cc, mine.map((t) => `escalate:${t.key}`))
        }
      }

      // weekly manager summary
      if (S.weekly && lp.wd === S.weekly_day && lp.hm >= S.weekly_time) {
        const key = `weekly:${lp.date}`
        const to = await recipients(admin, cc, ["admin"])
        if (to.length && (await claim(admin, cc, [key])).length) {
          try {
            const h = await computeHealth(admin, cc, limits, now - 7 * 24 * H, now, now)
            const delta = h.score !== null && h.prevScore !== null ? h.score - h.prevScore : null
            const bars = h.parts.map((p) => `<div style="text-align:left;margin:9px 0"><div style="font-size:13px;color:#0f172a;font-weight:600">${esc(p.label)} <span style="float:right;color:#64748b;font-weight:400">${p.pct === null ? "no data" : `${p.pct}% · ${p.ok} of ${p.total}`}</span></div><div style="height:8px;background:#e2e8f0;border-radius:99px;margin-top:4px"><div style="height:8px;width:${p.pct ?? 0}%;background:${(p.pct ?? 0) >= h.target ? "#16a34a" : (p.pct ?? 0) >= h.target - 20 ? "#d97706" : "#dc2626"};border-radius:99px"></div></div></div>`).join("")
            const intro = h.score === null ? "Nothing to measure this week yet." : `Score <b style="font-size:26px;color:#0f172a">${h.score}</b> / 100 (target ${h.target})${delta !== null ? ` · ${delta >= 0 ? "+" : ""}${delta} vs last week` : ""}<br><span style="font-size:13px">${h.requests} request${h.requests === 1 ? "" : "s"} received · ${h.rightNow.overdue} overdue of ${h.rightNow.open} open tasks right now</span>`
            const html = card("Your week in the pipeline", intro, bars, { href: `${base}/dashboard`, label: "Open the dashboard" })
            const text = `Pipeline Health, last 7 days: ${h.score ?? "no data"} (target ${h.target})\n` + h.parts.map((p) => `- ${p.label}: ${p.pct === null ? "no data" : `${p.pct}% (${p.ok} of ${p.total})`}`).join("\n") + `\n\n${base}/dashboard`
            await sendMail(cfg, { to, subject: `Weekly Pipeline Health: ${h.score ?? "–"}${delta !== null ? ` (${delta >= 0 ? "+" : ""}${delta})` : ""}`, html, text })
            sent.push(`weekly → ${to.length}`)
          } catch (e) { await release(admin, cc, [key]); throw e }
        }
      }
      out.sent = sent
    } catch (e) { out.error = smtpError(e) }
    report.push(out)
  }
  return report
}
