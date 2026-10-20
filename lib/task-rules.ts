/**
 * lib/task-rules.ts  (server only)
 *
 * Works out each company's to-do list from its requests. A task is never stored: it follows from what has (and has not)
 * happened to a request — confirmed? RFQ sent? quote back? quotation sent? — so it appears when it is due and goes
 * away by itself when the work is done. One task per request: its next step.
 */

export type TaskType = "approve" | "confirm_fields" | "send_rfq" | "chase_carriers" | "prepare_quotation" | "send_quotation" | "follow_up"

export const DEFAULT_LIMITS = {
  confirm_h: 1,        // new request → fields confirmed
  rfq_h: 4,            // confirmed → carriers asked
  chase_h: 24,         // RFQ sent, no quote → chase the carriers
  quotation_h: 4,      // first carrier quote → quotation prepared
  send_h: 2,           // quotation prepared → sent
  followup_h: 72,      // quotation sent, no outcome → follow up with the client
  approval_h: 8,       // waiting for approval
  daily_goal: 10,
  health_target: 85,   // Pipeline Health score to aim for (%)
}
export type TaskLimits = typeof DEFAULT_LIMITS

export type Task = {
  key: string
  requestId: string
  ref: string
  type: TaskType
  title: string
  why: string
  action: string
  dueAt: number
  /** the next step is on someone else until dueAt (carrier / client); after that it is yours to chase */
  waiting: boolean
  urgent: boolean
  score: number
  sender: string
  route: string
  cargo: string
  modes: string[]
  value: number | null
  snoozedUntil?: number | null
}

const t = (v: unknown) => { const n = v ? Date.parse(String(v)) : NaN; return isNaN(n) ? 0 : n }
const H = 3600_000
const max = (...xs: number[]) => Math.max(0, ...xs)
const min = (xs: number[]) => (xs.length ? Math.min(...xs) : 0)

export async function loadLimits(admin: any, clientCode: string): Promise<TaskLimits> {
  try {
    const { data } = await admin.from("client_settings").select("value").eq("client_code", clientCode).eq("key", "task_limits").maybeSingle()
    const v = (data?.value ?? {}) as Record<string, unknown>
    const out: any = { ...DEFAULT_LIMITS }
    for (const k of Object.keys(DEFAULT_LIMITS)) { const n = Number(v[k]); if (Number.isFinite(n) && n > 0) out[k] = n }
    return out
  } catch { return { ...DEFAULT_LIMITS } }
}

async function fetchAll<T>(build: (a: number, b: number) => any, cap = 5000): Promise<T[]> {
  const out: T[] = []
  for (let a = 0; a < cap; a += 1000) {
    const { data, error } = await build(a, a + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function computeTasks(admin: any, clientCode: string, limits: TaskLimits, now = Date.now(), username?: string | null): Promise<Task[]> {
  const since = new Date(now - 120 * 24 * H).toISOString()
  const COLS = "id, request_ref, status, received_at, outcome, sender_name, sender_email, origin_city, destination_city, cargo_type, urgency, aog, dgr, is_sea, is_air, is_land, missing_fields, reply_sent_type, replied_at, fields_confirmed_at, fields_edited_at"
  const loadReqs = (cols: string) => fetchAll<any>((a, b) =>
    admin.from("freight_requests").select(cols).eq("client_code", clientCode).is("outcome", null)
      .not("status", "in", "(Closed,Rejected)").gte("received_at", since).order("received_at", { ascending: false }).range(a, b))

  const [reqs, rfqs, cqs, quos] = await Promise.all([
    loadReqs(COLS).catch(() => loadReqs("*")),
    fetchAll<any>((a, b) => admin.from("carrier_quote_requests").select("freight_request_id, sent_at, freight_requests!inner(client_code)")
      .eq("freight_requests.client_code", clientCode).gte("sent_at", since).range(a, b)).catch(() => [] as any[]),
    fetchAll<any>((a, b) => admin.from("carrier_quotes").select("freight_request_id, received_at, freight_requests!freight_request_id!inner(client_code)")
      .eq("freight_requests.client_code", clientCode).gte("received_at", since).range(a, b)).catch(() => [] as any[]),
    fetchAll<any>((a, b) => admin.from("quotations").select("freight_request_id, status, sent_at, created_at, final_price_usd")
      .eq("client_code", clientCode).gte("created_at", since).range(a, b)).catch(() => [] as any[]),
  ])

  // Approvals are personal: the approver is asked to decide, the person who sent it waits (everyone else sees nothing)
  const steps = new Map<string, any[]>()
  if (username) {
    const waitingIds = reqs.filter((r: any) => r.status === "Waiting for Approval").map((r: any) => String(r.id))
    if (waitingIds.length) {
      const { data } = await admin.from("approval_requests").select("request_id, sort_order, step_status, submitted_by, assigned_to, assigned_usernames, created_at, decided_at").in("request_id", waitingIds).order("sort_order", { ascending: true })
      for (const x of (data ?? []) as any[]) { const l = steps.get(x.request_id); l ? l.push(x) : steps.set(x.request_id, [x]) }
    }
  }

  const group = <T extends { freight_request_id: string }>(xs: T[]) => {
    const m = new Map<string, T[]>(); for (const x of xs) { const l = m.get(x.freight_request_id); l ? l.push(x) : m.set(x.freight_request_id, [x]) } return m
  }
  const rfqBy = group(rfqs), cqBy = group(cqs), quoBy = group(quos)

  const tasks: Task[] = []
  for (const r of reqs) {
    const id = String(r.id)
    const received = t(r.received_at)
    const myRfq = (rfqBy.get(id) ?? []).map((x) => t(x.sent_at)).filter(Boolean)
    const myQuotes = (cqBy.get(id) ?? []).map((x) => t(x.received_at)).filter(Boolean)
    const myQuos = quoBy.get(id) ?? []
    const sentQuos = myQuos.filter((q) => q.status === "sent")
    const draftQuos = myQuos.filter((q) => q.status !== "sent")
    const lastRfq = max(...myRfq), firstQuote = min(myQuotes)
    const sentAt = max(...sentQuos.map((q) => t(q.sent_at ?? q.created_at)))
    const lastDraft = max(...draftQuos.map((q) => t(q.created_at)))
    const value = sentQuos.concat(draftQuos).reduce((s, q) => s + (Number(q.final_price_usd) || 0), 0) || null

    // field confirmation state, from the same rules as the Confirm fields chip
    const conf = confirmState(r, lastRfq, max(...myQuotes))
    const missing = Array.isArray(r.missing_fields) ? r.missing_fields.length : 0

    let type: TaskType, due: number, waiting = false, stamp: number, title: string, why: string, action: string
    if (r.status === "Waiting for Approval") {
      type = "approve"; due = received + limits.approval_h * H; stamp = received
      title = "Approval needed"; why = "Waiting for an approval decision"; action = "Open approvals"
      if (username) {
        const chain = steps.get(id) ?? []
        const active = chain.find((x) => x.step_status === "active")
        const names = (x: any): string[] => (x?.assigned_usernames?.length ? x.assigned_usernames : [x?.assigned_to]).filter(Boolean)
        if (active && names(active).includes(username)) {
          const prev = chain.filter((x) => x.sort_order < active.sort_order).map((x) => t(x.decided_at))
          stamp = Math.max(t(active.created_at), ...prev, 0) || received
          due = stamp + limits.approval_h * H
          why = `Step ${active.sort_order + 1} of ${chain.length} · sent by ${active.submitted_by ?? "a colleague"}`
        } else if (chain.length && chain[0].submitted_by === username) {
          stamp = t(chain[0].created_at) || received
          due = stamp + limits.approval_h * H; waiting = due > now
          title = "Waiting for approval"; why = active ? `With ${names(active).join(" / ")} (step ${active.sort_order + 1} of ${chain.length})` : "Waiting for an approval decision"; action = "Open request"
        } else continue
      }
    } else if (sentAt) {
      type = "follow_up"; due = sentAt + limits.followup_h * H; waiting = due > now; stamp = sentAt
      title = "Follow up on the quotation"; why = waiting ? "Quotation sent — waiting for the requester" : "Quotation sent, no result yet"; action = "Follow up"
    } else if (draftQuos.length) {
      type = "send_quotation"; due = lastDraft + limits.send_h * H; stamp = lastDraft
      title = "Send the quotation"; why = "Quotation is prepared but not sent"; action = "Review & send"
    } else if (myQuotes.length) {
      type = "prepare_quotation"; due = firstQuote + limits.quotation_h * H; stamp = firstQuote
      title = "Prepare the quotation"; why = `${myQuotes.length} carrier quote${myQuotes.length > 1 ? "s" : ""} in, no quotation yet`; action = "Build quotation"
    } else if (myRfq.length) {
      type = "chase_carriers"; due = lastRfq + limits.chase_h * H; waiting = due > now; stamp = lastRfq
      title = "Chase the carriers"; why = waiting ? "RFQ sent — waiting for carrier quotes" : "No carrier quote yet"; action = "Open request"
    } else if (conf.state !== "confirmed") {
      type = "confirm_fields"; stamp = max(received, t(r.fields_edited_at))
      due = stamp + limits.confirm_h * H
      title = conf.state === "changed" ? "Re-confirm the fields" : "Confirm the fields"
      why = missing ? `New request · ${missing} item${missing > 1 ? "s" : ""} missing` : conf.state === "changed" ? "Fields were edited since they were confirmed" : "New request — check the details are right"
      action = "Review fields"
    } else {
      type = "send_rfq"; stamp = conf.at; due = conf.at + limits.rfq_h * H
      title = "Send to carriers"; why = "Fields confirmed, no carrier asked yet"; action = "Send RFQ"
    }

    const lateH = Math.max(0, (now - due) / H)
    const urgent = !!(r.aog || r.dgr || /urgent|high|critical/i.test(String(r.urgency ?? "")))
    tasks.push({
      key: `${id}:${type}:${stamp}`, requestId: id, ref: r.request_ref ?? `LT-${id}`, type, title, why, action, dueAt: due, waiting, urgent,
      score: (urgent ? 1000 : 0) + (r.aog ? 500 : 0) + Math.min(lateH, 200) * 4 + (value ? Math.min(value / 1000, 100) : 0),
      sender: r.sender_name || r.sender_email || "Unknown sender",
      route: [r.origin_city, r.destination_city].filter(Boolean).join(" → "),
      cargo: r.cargo_type ?? "",
      modes: [r.is_sea && "Sea", r.is_air && "Air", r.is_land && "Land"].filter(Boolean) as string[],
      value,
    })
  }
  return tasks
}

/** Same rules as the Confirm fields chip, from rows already loaded (no extra queries). */
function confirmState(r: any, lastRfq: number, lastQuote: number): { state: "unconfirmed" | "confirmed" | "changed"; at: number } {
  const ack = ["acknowledgement", "complete", "manual"].includes(String(r.reply_sent_type)) ? t(r.replied_at) : 0
  const at = max(t(r.fields_confirmed_at), ack, lastRfq, lastQuote)
  const edited = t(r.fields_edited_at)
  return { state: !at ? "unconfirmed" : edited > at ? "changed" : "confirmed", at }
}

export const DEFAULT_REMINDERS = {
  popups: true,          // popup when tasks go overdue, and a nudge while they stay overdue
  interval_min: 60,      // minutes between nudges
  daily_window: true,    // "Here's your day" summary the first time you open the portal each day
  browser: true,         // also use browser notifications when this tab is in the background (if allowed)
  quiet_from: "20:00",   // no popups between these times (each person's own clock)
  quiet_to: "07:00",
}
export type TaskReminders = typeof DEFAULT_REMINDERS

export async function loadReminders(admin: any, clientCode: string): Promise<TaskReminders> {
  try {
    const { data } = await admin.from("client_settings").select("value").eq("client_code", clientCode).eq("key", "task_reminders").maybeSingle()
    return cleanReminders(data?.value)
  } catch { return { ...DEFAULT_REMINDERS } }
}
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export function cleanReminders(v: any): TaskReminders {
  const o: any = { ...DEFAULT_REMINDERS }
  if (!v || typeof v !== "object") return o
  for (const k of ["popups", "daily_window", "browser"] as const) if (typeof v[k] === "boolean") o[k] = v[k]
  const n = Number(v.interval_min); if (Number.isFinite(n) && n >= 5 && n <= 1440) o.interval_min = Math.round(n)
  for (const k of ["quiet_from", "quiet_to"] as const) if (typeof v[k] === "string" && HHMM.test(v[k])) o[k] = v[k]
  return o
}
