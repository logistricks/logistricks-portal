/**
 * lib/rfq-run.ts — the "send to carriers" work itself, shared by the send dialog's API and by the approval flow
 * (a send held for approval runs from here after the last approval).
 */
import { loadSmtp } from "@/lib/notify"
import { logActivity } from "@/lib/log-activity"
import { defaultTemplateFor } from "@/lib/template-defaults"
import { allLegs, optionMode, rowForLeg } from "@/lib/shipment-types"
import { loadCarrierContacts, registerRfqRows, renderRfqDraft } from "@/lib/rfq-send"

export type RunOut = { status: number; json: any }
const out = (json: any, init?: { status?: number }): RunOut => ({ status: init?.status ?? 200, json })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const ids = (v: unknown): number[] => Array.from(new Set((Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)))

/** Which leg an RFQ is about: "all" = one email covering every leg, otherwise a leg number - 1 (default 0 = leg 1). */
export function legParam(v: unknown, count: number): { all: boolean; index: number } {
  if (v === "all" && count > 1) return { all: true, index: 0 }
  const n = Number(v)
  return { all: false, index: Number.isInteger(n) && n >= 0 && n < count ? n : 0 }
}
/** The request as seen for ONE leg / option. Option 1 is the request itself, but the email must still be about that option only, so it is marked with its index. */
export const legRowOf = (row: Record<string, any>, i: number, count: number) => (count > 1 ? { ...rowForLeg(row, i), leg_index: i } : rowForLeg(row, i))
export const modesOf = (r: Record<string, any>) => [r.is_sea ? "Sea" : "", r.is_air ? "Air" : "", r.is_land ? "Land" : ""].filter(Boolean)

export async function loadRequest(admin: any, clientCode: string, id: string) {
  const { data } = await admin.from("freight_requests").select("*").eq("id", id).ilike("client_code", clientCode).maybeSingle()
  return data as Record<string, any> | null
}

export async function emailTemplates(admin: any, clientCode: string) {
  const { data } = await admin.from("templates").select("*").ilike("client_code", clientCode).eq("type", "Email").order("template_id", { ascending: true })
  return ((data ?? []) as any[]).filter((t) => t.active !== false && !t.is_reply_template && !t.is_missing_reply_template && !t.is_complete_reply_template)
}

/** One send (one leg / option, or all in one email). body: {method, carrier_ids, leg?, template_id?, drafts?, override?} */
export async function runSend(admin: any, code: string, actor: string, id: string, body: any): Promise<RunOut> {
  const method = body.method === "automatic" ? "automatic" : "manual"
  const carrierIds = ids(body.carrier_ids)
  if (!carrierIds.length) return  out({ error: "Select at least one carrier." }, { status: 400 })

    const row = await loadRequest(admin, code, id)
  if (!row) return  out({ error: "Request not found" }, { status: 404 })
  const legCount = allLegs(row).length
  const opts = optionMode(row)
  // alternatives sent automatically always go out as ONE email per carrier that covers every destination
  const sel = legParam(body.leg ?? (method === "automatic" && opts ? "all" : undefined), legCount)
  // automatic sending (the n8n workflow) does not know about legs yet: multi-leg requests are sent manually, one email per leg or one for all
  const contacts = (await loadCarrierContacts(admin, code, carrierIds)).filter((c) => c.email)
  if (!contacts.length) return  out({ error: "None of the selected carriers has an email address." }, { status: 400 })

    type Result = { carrier_id: number; carrier_name: string; email: string; status: "sent" | "failed" | "pending"; error?: string | null; rfq_reference?: string | null; subject?: string | null }
  let results: Result[] = []
  let n8nInfo: { ok: boolean; status: number | null; error?: string } | null = null

  if (method === "automatic") {
    const cfg = await loadSmtp(admin, code)
    if (!cfg || !cfg.enabled) {
      return  out({ error: "smtp_not_configured", message: "Automatic sending needs your email server. Set it up in Settings → Email server, or choose Send manually." }, { status: 409 })
    }
    const url = process.env.N8N_RFQ_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_RFQ_WEBHOOK_URL
    if (!url) return  out({ error: "n8n_not_configured", message: "The automatic sending workflow is not connected yet (N8N_RFQ_WEBHOOK_URL). Choose Send manually, or ask your administrator." }, { status: 409 })

    let autoDrafts: { carrier_id: number; to: string; cc: string[]; subject: string; body: string }[] | null = null
    {
      const tpls = await emailTemplates(admin, code)
      const modes = modesOf(row)
      const wanted = Number(body.template_id)
      const tpl = tpls.find((t) => t.template_id === wanted) ?? defaultTemplateFor(tpls, modes) ?? tpls[0]
      if (!tpl) return  out({ error: "no_template", message: "There is no email template to send. Add one under Builder → Templates." }, { status: 409 })
      const draftRow = sel.all ? row : legRowOf(row, sel.index, legCount)
      autoDrafts = contacts.map((c) => { const d = renderRfqDraft(tpl, draftRow, c); const o = body.override ?? {}; return { carrier_id: c.carrier_id, to: c.email, cc: Array.isArray(o.cc) && o.cc.length ? o.cc : c.cc, ...d, ...(o.subject ? { subject: String(o.subject) } : {}), ...(o.body ? { body: String(o.body) } : {}) } })
    }
    const startedAt = new Date(Date.now() - 2000).toISOString()
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(process.env.PORTAL_WEBHOOK_SECRET ? { "X-Portal-Secret": process.env.PORTAL_WEBHOOK_SECRET } : {}) },
        // the portal writes the emails itself (alternatives must name every destination) and n8n just sends them
        body: JSON.stringify({ client_code: code, freight_request_id: id, carrier_ids: carrierIds, requested_by: actor, ...(legCount > 1 && !sel.all ? { leg_index: sel.index } : {}), ...(autoDrafts ? { drafts: autoDrafts, all_options: opts && sel.all } : {}) }),
        signal: AbortSignal.timeout(45_000),
      })
      const txt = (await res.text().catch(() => "")).slice(0, 300)
      n8nInfo = { ok: res.ok, status: res.status, ...(res.ok ? {} : { error: txt || `n8n answered ${res.status}` }) }
    } catch (e) {
      n8nInfo = { ok: false, status: null, error: (e as Error).name === "TimeoutError" ? "n8n did not answer in time" : (e as Error).message }
    }

    // What really went out? The mail gateway logs every send; wait briefly for it.
    let logged: any[] = []
    if (n8nInfo.ok) {
      for (let i = 0; i < 8; i++) {
        const { data } = await admin.from("outbound_emails").select("to_emails, status, error, subject, rfq_reference, created_at").eq("freight_request_id", id).eq("purpose", "rfq").gte("created_at", startedAt)
        logged = data ?? []
        if (contacts.every((c) => logged.some((l) => (l.to_emails ?? []).map((e: string) => e.toLowerCase()).includes(c.email.toLowerCase())))) break
        await sleep(1500)
      }
    }
    results = contacts.map((c) => {
      const hit = logged.filter((l) => (l.to_emails ?? []).map((e: string) => e.toLowerCase()).includes(c.email.toLowerCase())).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
      if (hit) return { carrier_id: c.carrier_id, carrier_name: c.carrier_name, email: c.email, status: hit.status === "sent" ? "sent" : "failed", error: hit.error ?? null, rfq_reference: hit.rfq_reference ?? null, subject: hit.subject ?? null }
      return { carrier_id: c.carrier_id, carrier_name: c.carrier_name, email: c.email, status: n8nInfo!.ok ? "pending" : "failed", error: n8nInfo!.ok ? "n8n accepted the job but no sent email was logged yet. Check Auto-reply logs in a minute." : n8nInfo!.error ?? "Failed" }
    })
  } else {
    const drafts: Record<string, any> = {}
    for (const d of Array.isArray(body.drafts) ? body.drafts : []) if (d && Number.isFinite(Number(d.carrier_id))) drafts[Number(d.carrier_id)] = d
    const refs = await registerRfqRows(admin, id, contacts, legCount > 1 && !sel.all ? sel.index : null)
    const now = new Date().toISOString()
    for (const c of contacts) {
      const d = drafts[c.carrier_id] ?? {}
      const subject = String(d.subject ?? "").slice(0, 250) || null
      const text = String(d.body ?? "").slice(0, 100000)
      const base = { client_code: code, purpose: "rfq", freight_request_id: id, rfq_reference: refs[c.carrier_id] ?? null, to_emails: [c.email.toLowerCase()], cc_emails: c.cc.map((e) => e.toLowerCase()), subject, status: "sent", sent_at: now }
      let r = await admin.from("outbound_emails").insert({ ...base, method: "manual", body_text: text })
      if (r.error) r = await admin.from("outbound_emails").insert(base)
      results.push({ carrier_id: c.carrier_id, carrier_name: c.carrier_name, email: c.email, status: refs[c.carrier_id] ? "sent" : "failed", error: refs[c.carrier_id] ? null : "Could not register the send, replies may not link automatically", rfq_reference: refs[c.carrier_id] ?? null, subject })
    }
  }

  // logs, like the auto-replies: one row per carrier
  try {
    await admin.from("auto_reply_logs").insert(results.map((r) => ({
      client_code: code, log_type: "carrier", sender_email: r.email, sender_name: r.carrier_name, subject: r.subject ?? null, request_id: id,
      meta: { method, leg: legCount > 1 ? (sel.all ? "all" : sel.index + 1) : undefined, status: r.status, error: r.error ?? null, rfq_reference: r.rfq_reference ?? null, request_ref: row.request_ref ?? null, sent_by: actor, n8n_status: n8nInfo?.status ?? null },
    })))
  } catch { /* logging is best effort */ }

  const sent = results.filter((r) => r.status === "sent").length
  await logActivity({
    clientCode: code, eventType: "rfq_sent", actor, requestId: id,
    description: `Request ${row.request_ref ?? ""} sent to ${sent} of ${results.length} carrier(s) (${method}${legCount > 1 ? (sel.all ? ", all legs" : `, leg ${sel.index + 1}`) : ""})`.replace("  ", " "),
    meta: { method, results: results.map((r) => ({ carrier: r.carrier_name, status: r.status, error: r.error ?? null })) },
  })
  if (sent > 0) await admin.from("freight_requests").update({ status: "Sent to Carrier" }).eq("id", id).ilike("client_code", code)

  return  out({ ok: sent > 0, method, sent, total: results.length, n8n: n8nInfo, results }, { status: sent > 0 || results.some((r) => r.status === "pending") ? 200 : 502 })
}


/** Several sends in a row (one per option), answered as one. */
export async function runJobs(admin: any, code: string, actor: string, id: string, base: any, jobs: { leg?: string; drafts?: any[] }[]): Promise<RunOut> {
  const list = jobs.length ? jobs : [{}]
  if (list.length === 1) return runSend(admin, code, actor, id, { ...base, leg: list[0].leg, drafts: list[0].drafts })
  let sent = 0, total = 0, n8n: any = null
  const results: any[] = []
  for (const j of list) {
    const r = await runSend(admin, code, actor, id, { ...base, leg: j.leg, drafts: j.drafts })
    if (!r.json?.results) return r
    sent += r.json.sent; total += r.json.total; if (r.json.n8n && !r.json.n8n.ok) n8n = r.json.n8n
    results.push(...r.json.results.map((x: any) => ({ ...x, carrier_name: `${x.carrier_name} · Option ${Number(j.leg) + 1}` })))
  }
  return out({ ok: sent > 0, method: base.method, sent, total, n8n, results }, { status: sent > 0 ? 200 : 502 })
}
