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
import { ids, legParam, legRowOf, modesOf, loadRequest, emailTemplates, runJobs } from "@/lib/rfq-run"
import { defaultTemplateFor } from "@/lib/template-defaults"
import { loadCriticalConfig } from "@/lib/critical-config"
import { allLegs, destinationOf, optionMode, rowForLeg, typedMissing, TYPE_LABEL } from "@/lib/shipment-types"
import { loadCarrierContacts, loadOptionsMode, renderRfqDraft } from "@/lib/rfq-send"

export const dynamic = "force-dynamic"
export const maxDuration = 60


/** Carriers that already got this request (for the given legs), or whose send is held in an approval chain. */
async function blockedCarriers(admin: any, id: string, legs: (string | undefined)[], myCarrierIds: number[]) {
  const sentSet = new Set<number>(), held = new Map<number, "pending" | "approved">()
  const { data: sent } = await admin.from("carrier_quote_requests").select("carrier_id, leg_index").eq("freight_request_id", id)
  const pks = Array.from(new Set((sent ?? []).map((r: any) => r.carrier_id)))
  const { data: cs } = pks.length ? await admin.from("carriers").select("id, carrier_id").in("id", pks) : { data: [] as any[] }
  const logical = new Map((cs ?? []).map((c: any) => [c.id, c.carrier_id]))
  const legNums = legs.map((l) => (l === undefined || l === "all" || l === "" ? null : Number(l)))
  for (const r of (sent ?? []) as any[]) {
    const cid = logical.get(r.carrier_id) as number | undefined
    if (cid == null) continue
    if (r.leg_index == null || legNums.some((n) => n == null || n === Number(r.leg_index))) sentSet.add(cid)
  }
  const { data: chain } = await admin.from("approval_requests").select("step_status, status, send_job").eq("request_id", id)
  const list = (chain ?? []) as any[]
  const job = list.map((c) => c.send_job).find(Boolean)
  if (job && !list.some((c) => c.status === "rejected" || c.step_status === "rejected")) {
    const done = list.every((c) => c.step_status === "approved" || c.step_status === "skipped")
    for (const cid of ids(job.carrier_ids)) held.set(cid, done ? "approved" : "pending")
  }
  return { sent: sentSet, held, mine: myCarrierIds }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const admin = adminClient()
  const row = await loadRequest(admin, s.session.clientCode, id)
  if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })

  const [cfg, tpls, crit] = await Promise.all([loadSmtp(admin, s.session.clientCode), emailTemplates(admin, s.session.clientCode), loadCriticalConfig(admin, s.session.clientCode)])
  const legList = allLegs(row)
  const sel = legParam(req.nextUrl.searchParams.get("leg"), legList.length)
  const legRow = sel.all ? row : legRowOf(row, sel.index, legList.length)
  const opts = optionMode(row)
  // alternatives are ONE shipment: the normal template for its mode, not the multi-leg one
  const tplModes = sel.all && !opts ? ["Multi", ...modesOf(row)] : sel.all ? modesOf(row) : modesOf(legRow)
  const out: Record<string, unknown> = {
    // one entry per leg, so the dialog can offer "Leg 2 · Land" and rank carriers by that leg's mode and countries
    legs: legList.length > 1 ? legList.map((l, i) => { const r = rowForLeg(row, i); return { index: i, type: l.type, label: opts ? `Option ${i + 1} · ${destinationOf(r) || "no destination"}` : `Leg ${i + 1} · ${l.type ? TYPE_LABEL[l.type] : "No type"}`, modes: modesOf(r), origin_country: r.origin_country ?? "", destination_country: r.destination_country ?? "" } }) : [],
    options: opts, // true = the "legs" are alternative destinations of one shipment
    options_mode: opts ? await loadOptionsMode(admin, s.session.clientCode) : null, // 'separate' = one email per option, 'one' = one email for all
    smtp: { configured: !!cfg, enabled: !!cfg?.enabled },
    // typed requests only: the required fields still missing for the request's type (null = older, untyped request)
    missing_required: typedMissing(row, crit),
    n8n: !!(process.env.N8N_RFQ_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_RFQ_WEBHOOK_URL),
    templates: tpls.map((t) => ({ template_id: t.template_id, template_name: t.template_name, is_default: !!t.is_default, default_sea: !!t.default_sea, default_air: !!t.default_air, default_land: !!t.default_land, default_multi: !!t.default_multi })),
    default_template_id: defaultTemplateFor(tpls, tplModes)?.template_id ?? null,
  }
  // RFQs already sent for this request (any way: automatic, manual, or logged), so the dialog can flag carriers that already got one
  try {
    const { data: sent } = await admin.from("carrier_quote_requests").select("carrier_id, leg_index, sent_at, status").eq("freight_request_id", id)
    const pks = Array.from(new Set((sent ?? []).map((r: any) => r.carrier_id)))
    const { data: cs } = pks.length ? await admin.from("carriers").select("id, carrier_id").in("id", pks) : { data: [] as any[] }
    const logical = new Map((cs ?? []).map((c: any) => [c.id, c.carrier_id]))
    out.already_sent = (sent ?? []).filter((r: any) => logical.has(r.carrier_id)).map((r: any) => ({ carrier_id: logical.get(r.carrier_id), leg_index: r.leg_index ?? null, sent_at: r.sent_at ?? null }))
  } catch { out.already_sent = [] }
  try {
    const { data: ini } = await admin.from("approval_cycle_initiators").select("cycle_id").eq("client_code", s.session.clientCode).eq("username", s.session.username).maybeSingle()
    out.gated = !!ini
    const b = await blockedCarriers(admin, id, [], [])
    out.held = Array.from(b.held.entries()).map(([carrier_id, state]) => ({ carrier_id, state }))
  } catch { out.gated = false; out.held = [] }
  // an approver's edits to the email (subject / body / cc), once the whole chain approved it
  try {
    const { data: chain } = await admin.from("approval_requests").select("id, step_status, submitted_by, send_job").eq("request_id", id)
    if ((chain ?? []).length && (chain as any[]).every((c) => c.step_status === "approved" || c.step_status === "skipped") && (chain as any[]).some((c) => c.send_job)) {
      const { data: dr } = await admin.from("approval_drafts").select("edited_by, email_subject, email_body, email_cc, created_at").in("approval_id", (chain as any[]).map((c) => c.id)).order("created_at", { ascending: false }).limit(1)
      const d = (dr ?? [])[0] as any
      out.approved = true
      if (d && d.edited_by !== (chain as any[])[0].submitted_by) out.approved_edit = { subject: d.email_subject, body: d.email_body, cc: d.email_cc }
    }
  } catch { /* approvals not set up */ }
  const carrierIds = ids(req.nextUrl.searchParams.get("carrier_ids"))
  if (carrierIds.length) {
    const wanted = Number(req.nextUrl.searchParams.get("template_id"))
    const tpl = tpls.find((t) => t.template_id === wanted) ?? defaultTemplateFor(tpls, tplModes) ?? tpls[0]
    const contacts = await loadCarrierContacts(admin, s.session.clientCode, carrierIds)
    out.template_id = tpl?.template_id ?? null
    out.drafts = tpl ? contacts.map((c) => ({ carrier_id: c.carrier_id, carrier_name: c.carrier_name, to: c.email, cc: c.cc, ...renderRfqDraft(tpl, legRow, c) })) : []
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
  const actor = s.session.username
  const row = await loadRequest(admin, code, id)
  if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  const contacts = (await loadCarrierContacts(admin, code, carrierIds)).filter((c) => c.email)
  const jobs: { leg?: string; drafts?: any[] }[] = Array.isArray(body.jobs) && body.jobs.length ? body.jobs : [{ leg: body.leg, drafts: body.drafts }]
  const base: any = { method, carrier_ids: carrierIds, template_id: body.template_id }

  // Users who sit in an approval workflow cannot send on their own: the send is held, approvers review it, then it goes out.
  let approvedChain = false
  try {
    const { data: ini } = await admin.from("approval_cycle_initiators").select("cycle_id").eq("client_code", code).eq("username", actor).maybeSingle()
    if (ini) {
      const { data: chain } = await admin.from("approval_requests").select("id, step_status, send_job").eq("request_id", id)
      const list = (chain ?? []) as any[]
      approvedChain = list.length > 0 && list.every((c) => c.step_status === "approved" || c.step_status === "skipped") && list.some((c) => c.send_job)
      if (!approvedChain) {
        const b = await blockedCarriers(admin, id, jobs.map((j) => j.leg ?? (optionMode(row) ? "all" : undefined)), carrierIds)
        const bad = contacts.filter((c) => b.sent.has(c.carrier_id) || b.held.has(c.carrier_id))
        if (bad.length) {
          const why = (c: { carrier_id: number }) => (b.held.get(c.carrier_id) === "pending" ? "waiting for approval" : b.held.get(c.carrier_id) === "approved" ? "approved, ready to send" : "already sent")
          return NextResponse.json({ error: "already_requested", message: `Not sent for approval: ${bad.map((c) => `${c.carrier_name} (${why(c)})`).join(", ")}. Untick them and try again.` }, { status: 409 })
        }
        // the first email, so approvers see what would go out
        let first: { subject?: string; body?: string; to?: string; cc?: string[] } = {}
        const d0 = (jobs[0]?.drafts ?? [])[0]
        if (d0) first = { subject: d0.subject, body: d0.body, to: d0.to, cc: d0.cc }
        else {
          try {
            const tpls = await emailTemplates(admin, code)
            const tpl = tpls.find((t) => t.template_id === Number(body.template_id)) ?? defaultTemplateFor(tpls, modesOf(row)) ?? tpls[0]
            const legCount = allLegs(row).length
            const sel = legParam(jobs[0]?.leg ?? (optionMode(row) ? "all" : undefined), legCount)
            if (tpl && contacts[0]) first = { to: contacts[0].email, cc: contacts[0].cc, ...renderRfqDraft(tpl, sel.all ? row : legRowOf(row, sel.index, legCount), contacts[0]) }
          } catch { /* the approvers still see the request */ }
        }
        const res = await fetch(new URL("/api/approval-requests", req.url), {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
          body: JSON.stringify({ request_id: id, email_type: "carrier", email_subject: first.subject, email_body: first.body, email_to: first.to, email_cc: first.cc, send_job: { ...base, jobs, requested_by: actor } }),
        })
        const d = await res.json().catch(() => ({}))
        if (res.status === 409 && d.error === "Already in review") return NextResponse.json({ approval_required: true, already: true, message: "This request is already waiting for approval." }, { status: 202 })
        if (!res.ok) return NextResponse.json({ error: d.error ?? "Could not send this for approval." }, { status: res.status === 403 ? 403 : 502 })
        const steps = ((d.steps ?? []) as any[]).map((st) => ({ order: (st.sort_order ?? 0) + 1, approvers: st.assigned_usernames ?? [] }))
        return NextResponse.json({ approval_required: true, cycle_name: d.cycle_name ?? null, steps }, { status: 202 })
      }
    }
  } catch { /* approvals not set up: send normally */ }

  const r = await runJobs(admin, code, actor, id, base, jobs)
  if (approvedChain && r.json?.sent > 0) await admin.from("approval_requests").update({ send_job: null }).eq("request_id", id)
  return NextResponse.json(r.json, { status: r.status })
}
