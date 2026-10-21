/**
 * lib/carrier-reminders.ts  (server only)
 *
 * Reminds carriers that haven't answered a rate request. A carrier is "waiting" while its RFQ has no real answer:
 * no quote, no decline and no question from it. An out-of-office or other automatic reply does not count as an answer.
 *  - findWaiting:         who is waiting, how long, how many reminders so far, and when the next one is due
 *  - sendReminder:        writes the reminder from the company's template, sends it, records it
 *  - runCarrierReminders: the scheduled run (every ~15 minutes): sends what is due for the companies that switched it on
 * The subject carries the RFQ reference, so whatever the carrier answers links back to the same request.
 */
import { logEvent } from "@/lib/system-events"
import { sendClientMail, type SendOutcome } from "@/lib/mailer"
import { applyTemplate } from "@/lib/template-render"
import { rfqVars } from "@/lib/rfq-send"
import { cleanCarrierEmails } from "@/lib/carrier-emails"

const H = 3600_000
const ANSWERS = ["quote", "update", "counter_offer", "decline", "info_request"]
const LOOKBACK_DAYS = 30
const MIN_GAP_H = 1   // a person's click is ignored if a reminder went out less than this long ago

export interface ReminderSettings { enabled: boolean; after_h: number; max: number }
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: false, after_h: 24, max: 2 }

export function cleanReminderSettings(v: any): ReminderSettings {
  const o = { ...DEFAULT_REMINDER_SETTINGS }
  if (!v || typeof v !== "object") return o
  if (typeof v.enabled === "boolean") o.enabled = v.enabled
  const a = Number(v.after_h); if (Number.isFinite(a) && a >= 1 && a <= 720) o.after_h = Math.round(a * 100) / 100
  const m = Number(v.max); if (Number.isFinite(m) && m >= 1 && m <= 10) o.max = Math.round(m)
  return o
}

export async function loadReminderSettings(admin: any, clientCode: string): Promise<ReminderSettings> {
  try {
    const { data } = await admin.from("client_settings").select("value").eq("client_code", clientCode).eq("key", "carrier_reminders").maybeSingle()
    return cleanReminderSettings(data?.value)
  } catch { return { ...DEFAULT_REMINDER_SETTINGS } }
}

export interface Waiting {
  rfq_id: number; freight_request_id: string; request_ref: string; carrier_pk: number; carrier_id: number | null
  carrier_name: string; person_name: string; email: string; cc: string[]
  rfq_reference: string; message_id: string | null; sent_at: string
  hours_waiting: number; sent_count: number; last_sent_at: string | null; next_due_at: string
  /** the settings' time and maximum say a reminder is due now */
  due: boolean
}

const t = (v: unknown) => { const n = v ? Date.parse(String(v)) : NaN; return isNaN(n) ? 0 : n }

/** Carriers still waiting on a rate request (of one request, or all open ones). */
export async function findWaiting(admin: any, clientCode: string, s: ReminderSettings, opts: { requestId?: string; now?: number } = {}): Promise<Waiting[]> {
  const now = opts.now ?? Date.now()
  const since = new Date(now - LOOKBACK_DAYS * 24 * H).toISOString()
  let q = admin.from("carrier_quote_requests")
    .select("id, freight_request_id, carrier_id, status, sent_at, rfq_reference, email_thread_id, email_message_id, freight_requests!inner(client_code, request_ref, status, outcome)")
    .eq("freight_requests.client_code", clientCode).in("status", ["sent", "responded"]).gte("sent_at", since)
  if (opts.requestId) q = q.eq("freight_request_id", opts.requestId)
  const { data: rfqs } = await q
  const open = ((rfqs ?? []) as any[]).filter((r) => {
    const fr = r.freight_requests
    return !/^manual-/.test(String(r.email_thread_id ?? "")) && fr && fr.outcome == null && !["Closed", "Rejected"].includes(String(fr.status))
  })
  if (!open.length) return []
  const ids = open.map((r) => r.id)

  const [{ data: qs }, { data: rem }, { data: cars }] = await Promise.all([
    admin.from("carrier_quotes").select("carrier_quote_request_id, response_type").in("carrier_quote_request_id", ids),
    admin.from("carrier_reminders").select("carrier_quote_request_id, created_at").eq("status", "sent").in("carrier_quote_request_id", ids),
    admin.from("carriers").select("id, carrier_id, carrier_name, person_name, email, active, is_cc").ilike("client_code", clientCode).in("id", Array.from(new Set(open.map((r) => r.carrier_id)))),
  ])
  const answered = new Set<number>()
  for (const x of (qs ?? []) as any[]) if (x.response_type == null || ANSWERS.includes(x.response_type)) answered.add(x.carrier_quote_request_id)
  const log = new Map<number, string[]>()
  for (const x of (rem ?? []) as any[]) { const l = log.get(x.carrier_quote_request_id); l ? l.push(x.created_at) : log.set(x.carrier_quote_request_id, [x.created_at]) }
  const byPk = new Map<number, any>(((cars ?? []) as any[]).map((c) => [c.id, c]))

  const logicalIds = Array.from(new Set(((cars ?? []) as any[]).map((c) => c.carrier_id).filter((x) => x != null)))
  const ccBy = new Map<number, string[]>()
  if (logicalIds.length) {
    const { data: ccs } = await admin.from("carriers").select("carrier_id, email").ilike("client_code", clientCode).eq("is_cc", true).eq("active", true).in("carrier_id", logicalIds)
    for (const c of (ccs ?? []) as any[]) if (String(c.email ?? "").trim()) { const l = ccBy.get(c.carrier_id); l ? l.push(String(c.email).trim()) : ccBy.set(c.carrier_id, [String(c.email).trim()]) }
  }

  const out: Waiting[] = []
  for (const r of open) {
    if (answered.has(r.id)) continue
    const car = byPk.get(r.carrier_id)
    if (!car || car.is_cc || car.active === false || !String(car.email ?? "").trim()) continue
    const times = (log.get(r.id) ?? []).map(t).sort((a, b) => a - b)
    const last = times.length ? times[times.length - 1] : 0
    const nextDue = (last || t(r.sent_at)) + s.after_h * H
    out.push({
      rfq_id: r.id, freight_request_id: r.freight_request_id, request_ref: String(r.freight_requests.request_ref ?? ""),
      carrier_pk: r.carrier_id, carrier_id: car.carrier_id ?? null, carrier_name: String(car.carrier_name ?? ""), person_name: String(car.person_name ?? ""),
      email: String(car.email).trim(), cc: ccBy.get(car.carrier_id) ?? [],
      rfq_reference: String(r.rfq_reference ?? r.email_thread_id ?? ""), message_id: r.email_message_id ?? null, sent_at: r.sent_at,
      hours_waiting: Math.max(0, Math.round(((now - t(r.sent_at)) / H) * 10) / 10),
      sent_count: times.length, last_sent_at: last ? new Date(last).toISOString() : null, next_due_at: new Date(nextDue).toISOString(),
      due: s.enabled && times.length < s.max && now >= nextDue,
    })
  }
  return out.sort((a, b) => t(a.sent_at) - t(b.sent_at))
}

/** What the portal reports for a send that didn't go out, in words a person can act on. */
export function mailProblem(o: SendOutcome): string {
  if (o.status === "skipped") return "The email server isn't set up (Settings → Emails) or is switched off."
  if (o.status === "rejected") return `The email was refused: ${String(o.reason ?? "").replace(/_/g, " ")}`
  return o.reason || "The email could not be sent."
}

/** The email the RFQ went out in (and anything sent in its thread since): its subject, and the Message-IDs to thread under. */
export async function rfqThread(admin: any, clientCode: string, w: { freight_request_id: string; rfq_reference: string; email: string }) {
  const { data } = await admin.from("outbound_emails").select("subject, message_id, rfq_reference, to_emails, created_at")
    .ilike("client_code", clientCode).eq("freight_request_id", w.freight_request_id).eq("purpose", "rfq").eq("status", "sent").order("created_at", { ascending: true })
  const rows = (data ?? []) as any[]
  const mine = rows.filter((r) => (w.rfq_reference && r.rfq_reference === w.rfq_reference)
    || (!rows.some((x) => x.rfq_reference === w.rfq_reference) && (r.to_emails ?? []).map((e: string) => String(e).toLowerCase()).includes(w.email.toLowerCase())))
  const root = mine[0]
  const ids = mine.map((r) => String(r.message_id ?? "").trim()).filter(Boolean)
  return { subject: String(root?.subject ?? "").replace(/^((re|fw|fwd)\s*:\s*)+/i, "").trim(), ids }
}

/** Writes and sends one reminder through the portal's mail gateway, in the original RFQ's thread, and records it. Never throws. */
export async function sendReminder(admin: any, clientCode: string, w: Waiting, mode: "auto" | "manual", by: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  let subject = "", text = ""
  const log = (status: "sent" | "failed", error?: string) => admin.from("carrier_reminders").insert({
    client_code: clientCode, freight_request_id: w.freight_request_id, carrier_quote_request_id: w.rfq_id, carrier_id: w.carrier_pk,
    mode, status, to_email: w.email, subject, body: text, error: error ?? null, created_by: by,
  })
  try {
    const [{ data: fr }, { data: set }, smtp] = await Promise.all([
      admin.from("freight_requests").select("*").eq("id", w.freight_request_id).ilike("client_code", clientCode).maybeSingle(),
      admin.from("client_settings").select("value").eq("client_code", clientCode).eq("key", "carrier_emails").maybeSingle(),
      admin.from("smtp_settings").select("from_name").ilike("client_code", clientCode).maybeSingle(),
    ])
    if (!fr) return { ok: false, error: "Request not found" }
    const vars: Record<string, string> = {
      ...rfqVars(fr, { carrier_name: w.carrier_name, person_name: w.person_name, email: w.email }),
      sent_date: new Date(w.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      sender_name: by || String(smtp?.data?.from_name ?? ""),
    }
    text = applyTemplate(cleanCarrierEmails(set?.value).reminder, vars).replace(/\n{3,}/g, "\n\n").trim()
    const thread = await rfqThread(admin, clientCode, w)
    const route = [vars.origin_city, vars.destination_city].filter(Boolean).join(" to ")
    // a reply to the original email keeps its subject exactly (that is what makes mail programs group it into the same conversation)
    subject = thread.subject ? `Re: ${thread.subject}` : `Reminder: Rate request ${vars.request_ref}${route ? ` - ${route}` : ""}`.trim()
    const out = await sendClientMail(admin, {
      clientCode, purpose: "rfq", freightRequestId: w.freight_request_id, to: [w.email], cc: w.cc, subject, text,
      rfqReference: w.rfq_reference || null, idempotencyKey: `carrier-reminder-${w.rfq_id}-${w.sent_count + 1}`,
      inReplyTo: thread.ids.length ? thread.ids[thread.ids.length - 1] : null, references: thread.ids.slice(0, 1),
    })
    if (out.status === "sent" || out.status === "duplicate") { await log("sent"); return { ok: true } }
    const msg = mailProblem(out)
    await log("failed", msg)
    return { ok: false, error: msg }
  } catch (e) {
    const msg = (e as Error).message || "The email could not be sent."
    await log("failed", msg).catch(() => {})
    await logEvent(admin, { clientCode, kind: "reminder_failed", title: "A carrier reminder could not be written or sent", message: msg, requestId: w.freight_request_id })
    return { ok: false, error: msg }
  }
}

/** Manual: sends to the chosen waiting carriers (skips one reminded in the last hour). */
export async function remindNow(admin: any, clientCode: string, by: string, opts: { requestId: string; rfqId?: number }) {
  const s = await loadReminderSettings(admin, clientCode)
  const list = (await findWaiting(admin, clientCode, s, { requestId: opts.requestId })).filter((w) => opts.rfqId == null || w.rfq_id === opts.rfqId)
  const res = { sent: 0, skipped: [] as string[], failed: [] as string[] }
  for (const w of list) {
    if (w.last_sent_at && Date.now() - t(w.last_sent_at) < MIN_GAP_H * H) { res.skipped.push(`${w.carrier_name} (reminded less than an hour ago)`); continue }
    const out = await sendReminder(admin, clientCode, w, "manual", by)
    if (out.ok) res.sent++; else res.failed.push(`${w.carrier_name}: ${out.error}`)
  }
  return res
}

/** The scheduled run. */
export async function runCarrierReminders(admin: any) {
  const { data } = await admin.from("client_settings").select("client_code, value").eq("key", "carrier_reminders")
  const report: { client: string; sent: number; failed: number }[] = []
  for (const row of (data ?? []) as any[]) {
    const s = cleanReminderSettings(row.value)
    if (!s.enabled) continue
    const cc = String(row.client_code)
    let sent = 0, failed = 0
    for (const w of (await findWaiting(admin, cc, s)).filter((x) => x.due)) {
      const out = await sendReminder(admin, cc, w, "auto", null)
      if (out.ok) sent++; else failed++
    }
    report.push({ client: cc, sent, failed })
  }
  return report
}
