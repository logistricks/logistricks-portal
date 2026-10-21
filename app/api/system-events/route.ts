/**
 * GET   /api/system-events?status=open|resolved → { events, count_open, owner }   (the company's own; the owner company also sees every company's)
 * PATCH /api/system-events { id | ids, resolve: true }                               (admins)
 * POST  /api/system-events   X-Portal-Secret   { workflow_name, workflow_id?, execution_id?, node?, message, client_code?, kind?, severity?, title?, request_id? }
 *       what the shared n8n error workflow sends, and what an n8n check sends when a lookup quietly found nothing (kind "silent_noop")
 * OWNER_CLIENT_CODE (env): the company code that may see all companies' events.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { clientFromWorkflowName, logEvent } from "@/lib/system-events"

export const dynamic = "force-dynamic"

const isOwner = (code: string) => !!process.env.OWNER_CLIENT_CODE && process.env.OWNER_CLIENT_CODE.toLowerCase() === code.toLowerCase()

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = adminClient(), code = s.session.clientCode, owner = isOwner(code)
  const status = new URL(req.url).searchParams.get("status") === "resolved" ? "resolved" : "open"
  let q = admin.from("system_events").select("*").eq("status", status).order("last_seen", { ascending: false }).limit(200)
  if (!owner) q = q.eq("client_code", code.toLowerCase())
  const { data, error } = await q
  if (error) return NextResponse.json({ events: [], count_open: 0, owner, error: /system_events/.test(error.message) ? "Run migration 088 first." : error.message })
  let cq = admin.from("system_events").select("id", { count: "exact", head: true }).eq("status", "open")
  if (!owner) cq = cq.eq("client_code", code.toLowerCase())
  const { count } = await cq
  return NextResponse.json({ events: data ?? [], count_open: count ?? 0, owner })
}

export async function PATCH(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can resolve these." }, { status: 403 })
  const b = await req.json().catch(() => null)
  const ids: string[] = Array.isArray(b?.ids) ? b.ids.map(String) : b?.id ? [String(b.id)] : []
  if (!ids.length) return NextResponse.json({ error: "id required" }, { status: 400 })
  const admin = adminClient()
  let q = admin.from("system_events").update(b?.resolve === false ? { status: "open", resolved_by: null, resolved_at: null } : { status: "resolved", resolved_by: s.session.username, resolved_at: new Date().toISOString() }).in("id", ids)
  if (!isOwner(s.session.clientCode)) q = q.eq("client_code", s.session.clientCode.toLowerCase())
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const secret = process.env.PORTAL_WEBHOOK_SECRET
  if (!secret || req.headers.get("x-portal-secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const admin = adminClient()
  const workflow = String(b.workflow_name ?? b.workflow ?? "").slice(0, 200)
  const client = b.client_code ? String(b.client_code) : await clientFromWorkflowName(admin, workflow)
  const silent = b.kind === "silent_noop"
  await logEvent(admin, {
    clientCode: client, source: "n8n", kind: silent ? "silent_noop" : "workflow_error", severity: b.severity === "warning" || silent ? "warning" : "error",
    title: String(b.title ?? (silent ? `Nothing found: ${b.node ?? workflow}` : `Workflow failed: ${workflow || "unknown"}${b.node ? ` at ${b.node}` : ""}`)),
    message: b.message ?? null, workflow, node: b.node ? String(b.node) : null, executionId: b.execution_id ? String(b.execution_id) : null, requestId: b.request_id ?? null,
    context: { workflow_id: b.workflow_id ?? null, url: b.execution_url ?? null },
  })
  return NextResponse.json({ ok: true, client_code: client })
}
