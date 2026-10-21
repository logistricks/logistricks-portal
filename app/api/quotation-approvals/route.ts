/**
 * GET  /api/quotation-approvals?quotation_id=N → { required, needed, status, stale, cycle:{name,after}, chain:[steps], approved_by }  (for the quotation's own panel)
 * GET  /api/quotation-approvals?view=mine       → quotation approval steps waiting for me, with the quotation and request
 * POST /api/quotation-approvals { quotation_id } → send the quotation for approval (through the sender's approval cycle)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { approvalRequirement, submitQuotationForApproval } from "@/lib/quotation-approval"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = adminClient(), code = s.session.clientCode, me = s.session.username
  const sp = new URL(req.url).searchParams

  if (sp.get("view") === "mine") {
    const { data, error } = await admin.from("quotation_approvals").select("*").ilike("client_code", code).eq("step_status", "active").contains("assigned_usernames", [me]).order("created_at", { ascending: true })
    if (error) return NextResponse.json([])     // migration 087 not run: nothing to approve
    const rows = (data ?? []) as any[]
    if (!rows.length) return NextResponse.json([])
    const [{ data: qs }, { data: frs }] = await Promise.all([
      admin.from("quotations").select("*").in("id", rows.map((r) => r.quotation_id)),
      admin.from("freight_requests").select("id, request_ref, sender_name, sender_email, origin_city, origin_country, destination_city, destination_country").in("id", rows.map((r) => r.freight_request_id)),
    ])
    return NextResponse.json(rows.map((r) => ({ step: r, quotation: (qs ?? []).find((q: any) => q.id === r.quotation_id) ?? null, request: (frs ?? []).find((f: any) => f.id === r.freight_request_id) ?? null })).filter((x) => x.quotation))
  }

  const id = Number(sp.get("quotation_id"))
  if (!id) return NextResponse.json({ error: "quotation_id required" }, { status: 400 })
  const { data: q } = await admin.from("quotations").select("*").eq("id", id).ilike("client_code", code).maybeSingle()
  if (!q) return NextResponse.json({ error: "Quotation not found" }, { status: 404 })
  const r = await approvalRequirement(admin, code, q, me)
  let chain: any[] = []
  try {
    const { data: last } = await admin.from("quotation_approvals").select("batch_id").eq("quotation_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (last) chain = ((await admin.from("quotation_approvals").select("sort_order, assigned_usernames, step_status, decided_by, notes, decided_at, committee_mode").eq("batch_id", last.batch_id).order("sort_order", { ascending: true })).data ?? [])
  } catch { /* none */ }
  return NextResponse.json({ required: r.required, needed: r.needed, status: r.status, stale: r.stale, cycle: r.cycle ? { name: r.cycle.name, mode: r.cycle.quotation_approval, after: r.cycle.quotation_after_approval } : null, chain, approved_by: q.approved_by ?? null })
}

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers can't send quotations for approval" }, { status: 403 })
  const b = await req.json().catch(() => null)
  const id = Number(b?.quotation_id)
  if (!id) return NextResponse.json({ error: "quotation_id required" }, { status: 400 })
  const admin = adminClient(), code = s.session.clientCode
  const { data: q } = await admin.from("quotations").select("*").eq("id", id).ilike("client_code", code).maybeSingle()
  if (!q) return NextResponse.json({ error: "Quotation not found" }, { status: 404 })
  const r = await submitQuotationForApproval(admin, code, s.session.username, q)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 })
  return NextResponse.json({ ok: true, status: r.status })
}
