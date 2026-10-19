/**
 * GET  /api/approval-requests/[id]/templates → { available, templates: [{template_id, template_name}], default_template_id }
 * POST { template_id }                       → { subject, body, cc }  the carrier email for the held send, rendered from a system template
 *
 * Only for approvers who may edit the email, and only for a carrier send that is being held for approval.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { defaultTemplateFor } from "@/lib/template-defaults"
import { allLegs, optionMode } from "@/lib/shipment-types"
import { loadCarrierContacts, renderRfqDraft } from "@/lib/rfq-send"
import { emailTemplates, legParam, legRowOf, loadRequest, modesOf } from "@/lib/rfq-run"

export const dynamic = "force-dynamic"

async function load(req: NextRequest, id: string) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const admin = adminClient()
  const { data: ar } = await admin.from("approval_requests").select("id, request_id, can_edit_template, assigned_usernames, assigned_to, send_job").eq("id", id).maybeSingle()
  const a = ar as any
  if (!a || !(a.assigned_usernames?.includes(session.username) || a.assigned_to === session.username)) return { err: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  if (!a.can_edit_template) return { err: NextResponse.json({ error: "You cannot change the email template at this step." }, { status: 403 }) }
  let job = a.send_job
  if (!job) {
    const { data: chain } = await admin.from("approval_requests").select("send_job").eq("request_id", a.request_id)
    job = ((chain ?? []) as any[]).map((c) => c.send_job).find(Boolean)
  }
  return { session, admin, a, job }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await load(req, id)
  if (r.err) return r.err
  const { session, admin, a, job } = r as any
  if (!job) return NextResponse.json({ available: false, templates: [] })
  const row = await loadRequest(admin, session.clientCode, a.request_id)
  const tpls = await emailTemplates(admin, session.clientCode)
  return NextResponse.json({ available: true, templates: tpls.map((t) => ({ template_id: t.template_id, template_name: t.template_name })), default_template_id: row ? defaultTemplateFor(tpls, modesOf(row))?.template_id ?? null : null })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await load(req, id)
  if (r.err) return r.err
  const { session, admin, a, job } = r as any
  if (!job) return NextResponse.json({ error: "No carrier send is held for this request." }, { status: 409 })
  const body = await req.json().catch(() => ({}))
  const row = await loadRequest(admin, session.clientCode, a.request_id)
  if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  const tpls = await emailTemplates(admin, session.clientCode)
  const tpl = tpls.find((t) => t.template_id === Number(body.template_id))
  if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 })
  const carrierIds = (job.carrier_ids ?? []).map(Number)
  const contacts = (await loadCarrierContacts(admin, session.clientCode, carrierIds)).filter((c) => c.email)
  if (!contacts[0]) return NextResponse.json({ error: "No carrier with an email address." }, { status: 409 })
  const legCount = allLegs(row).length
  const leg = (job.jobs ?? [])[0]?.leg
  const sel = legParam(leg ?? (optionMode(row) ? "all" : undefined), legCount)
  const d = renderRfqDraft(tpl, sel.all ? row : legRowOf(row, sel.index, legCount), contacts[0])
  return NextResponse.json({ subject: d.subject, body: d.body, cc: contacts[0].cc, carrier: contacts[0].carrier_name, others: contacts.length - 1 })
}
