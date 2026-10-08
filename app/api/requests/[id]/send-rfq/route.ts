/**
 * app/api/requests/[id]/send-rfq/route.ts — "Send to Carrier" from the request page.
 *
 * GET  ?carrier_ids=1,2&template_id=3 → { smtp, templates, drafts }   (drafts only when carrier_ids is given)
 * POST { method: "manual" | "automatic", carrier_ids, template_id?, drafts? }
 *
 *   automatic: needs the client's email server (Settings → Email server). The portal hands the job to the n8n RFQ
 *              workflow, waits for its answer, then reads the mail log to report what really went out per carrier.
 *   manual:    the user sent the emails from their own mail app; this registers the sends so carrier replies link
 *              back, and logs them.
 *
 * Both are logged: auto_reply_logs ("To Carriers"), outbound_emails (the request timeline), activity_log.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { loadSmtp } from "@/lib/notify"
import { logActivity } from "@/lib/log-activity"
import { loadCarrierContacts, registerRfqRows, renderRfqDraft } from "@/lib/rfq-send"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ids = (v: unknown): number[] => Array.from(new Set((Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)))

async function loadRequest(admin: any, clientCode: string, id: string) {
  const { data } = await admin.from("freight_requests").select("*").eq("id", id).ilike("client_code", clientCode).maybeSingle()
  return data as Record<string, any> | null
}

async function emailTemplates(admin: any, clientCode: string) {
  const { data } = await admin.from("templates").select("*").ilike("client_code", clientCode).eq("type", "Email").order("template_id", { ascending: true })
  return ((data ?? []) as any[]).filter((t) => t.active !== false && !t.is_reply_template && !t.is_missing_reply_template && !t.is_complete_reply_template)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const admin = adminClient()
  const row = await loadRequest(admin, s.session.clientCode, id)
  if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })

  const [cfg, tpls] = await Promise.all([loadSmtp(admin, s.session.clientCode), emailTemplates(admin, s.session.clientCode)])
  const out: Record<string, unknown> = {
    smtp: { configured: !!cfg, enabled: !!cfg?.enabled },
    n8n: !!(process.env.N8N_RFQ_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_RFQ_WEBHOOK_URL),
    templates: tpls.map((t) => ({ template_id: t.template_id, template_name: t.template_name, is_default: !!t.is_default })),
  }
  const carrierIds = ids(req.nextUrl.searchParams.get("carrier_ids"))
  if (carrierIds.length) {
    const wanted = Number(req.nextUrl.searchParams.get("template_id"))
    const tpl = tpls.find((t) => t.template_id === wanted) ?? tpls.find((t) => t.is_default) ?? tpls[0]
    const contacts = await loadCarrierContacts(admin, s.session.clientCode, carrierIds)
    out.template_id = tpl?.template_id ?? null
    out.drafts = tpl ? contacts.map((c) => ({ carrier_id: c.carrier_id, carrier_name: c.carrier_name, to: c.email, cc: c.cc, ...renderRfqDraft(tpl, row, c) })) : []
  }
  return NextResponse.json(out)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Your role cannot send requests to carriers." }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const method = body.method === "automatic" ? "automatic" : body.method === "manual" ? "manual" : null
  if (!method) return NextResponse.json({ error: "method must be manual or automatic" }, { status: 400 })
  const carrierIds = ids(body.carrier_ids)
  if (!carrierIds.length) return NextResponse.json({ error: "Select at least one carrier." }, { status: 400 })

  const code = s.session.clientCode
  const admin = adminClient()
  const row = await loadRequest(admin, code, id)
  if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  const contacts = (await loadCarrierContacts(admin, code, carrierIds)).filter((c) => c.email)
  if (!contacts.length) return NextResponse.json({ error: "None of the selected carriers has an email address." }, { status: 400 })

  const actor = s.session.username
  type Result = { carrier_id: number; carrier_name: string; email: string; status: "sent" | "failed" | "pending"; error?: string | null; rfq_reference?: string | null; subject?: string | null }
  let results: Result[] = []
  let n8nInfo: { ok: boolean; status: number | null; error?: string } | null = null

  if (method === "automatic") {
    const cfg = await loadSmtp(admin, code)
    if (!cfg || !cfg.enabled) {
      return NextResponse.json({ error: "smtp_not_configured", message: "Automatic sending needs your email server. Set it up in Settings → Email server, or choose Send manually." }, { status: 409 })
    }
    const url = process.env.N8N_RFQ_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_RFQ_WEBHOOK_URL
    if (!url) return NextResponse.json({ error: "n8n_not_configured", message: "The automatic sending workflow is not connected yet (N8N_RFQ_WEBHOOK_URL). Choose Send manually, or ask your administrator." }, { status: 409 })

    const startedAt = new Date(Date.now() - 2000).toISOString()
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(process.env.PORTAL_WEBHOOK_SECRET ? { "X-Portal-Secret": process.env.PORTAL_WEBHOOK_SECRET } : {}) },
        body: JSON.stringify({ client_code: code, freight_request_id: id, carrier_ids: carrierIds, requested_by: actor }),
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
    const refs = await registerRfqRows(admin, id, contacts)
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
      meta: { method, status: r.status, error: r.error ?? null, rfq_reference: r.rfq_reference ?? null, request_ref: row.request_ref ?? null, sent_by: actor, n8n_status: n8nInfo?.status ?? null },
    })))
  } catch { /* logging is best effort */ }

  const sent = results.filter((r) => r.status === "sent").length
  await logActivity({
    clientCode: code, eventType: "rfq_sent", actor, requestId: id,
    description: `Request ${row.request_ref ?? ""} sent to ${sent} of ${results.length} carrier(s) (${method})`.replace("  ", " "),
    meta: { method, results: results.map((r) => ({ carrier: r.carrier_name, status: r.status, error: r.error ?? null })) },
  })
  if (sent > 0) await admin.from("freight_requests").update({ status: "Sent to Carrier" }).eq("id", id).ilike("client_code", code)

  return NextResponse.json({ ok: sent > 0, method, sent, total: results.length, n8n: n8nInfo, results }, { status: sent > 0 || results.some((r) => r.status === "pending") ? 200 : 502 })
}
