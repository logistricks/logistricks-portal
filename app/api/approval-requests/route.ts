/**
 * app/api/approval-requests/route.ts
 *
 * GET  — list active approval requests visible to the current user
 *         ?view=mine   → steps assigned to me (default)
 *         ?view=all    → all steps for my client (admin)
 *         ?view=active → only active steps
 *
 * POST — submit a freight request into an approval cycle
 *         body: { request_id, cycle_id }
 *         Creates one approval_request row per cycle step.
 *         Also updates freight_request.status to "In Review".
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { logActivity } from "@/lib/log-activity"

function unauth() { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
function badInput(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }) }

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  const view = req.nextUrl.searchParams.get("view") ?? "mine"
  const admin = adminClient()

  let query = admin
    .from("approval_requests")
    .select(`
      id, sort_order, status, step_status, notes, decided_at, created_at,
      can_edit_template, can_edit_cc, submitted_by, assigned_to, cycle_id,
      freight_requests (
        id, sender_name, sender_email, origin_city, origin_country,
        destination_city, destination_country, cargo_type, weight,
        dimensions, equipment, mode, incoterm, bl_type, urgency,
        received_at, status, aog, dgr
      ),
      approval_cycles ( id, name )
    `)
    .eq("freight_requests.client_code", session.clientCode)
    .order("created_at", { ascending: false })

  if (view === "mine") {
    query = query.eq("assigned_to", session.username).eq("step_status", "active")
  } else if (view === "active") {
    query = query.eq("step_status", "active")
  }
  // "all" — no extra filter

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter out rows where freight_requests didn't match the client
  const filtered = (data ?? []).filter((row: any) => row.freight_requests)
  return NextResponse.json(filtered)
}

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return badInput("Invalid JSON") }

  const { request_id, cycle_id } = body as { request_id?: string; cycle_id?: string }
  if (!request_id) return badInput("request_id required")
  if (!cycle_id)   return badInput("cycle_id required")

  const admin = adminClient()

  // Verify freight request belongs to this client and isn't already in review
  const { data: fr } = await admin
    .from("freight_requests")
    .select("id, status, client_code")
    .eq("id", request_id)
    .eq("client_code", session.clientCode)
    .single()
  if (!fr) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  if (fr.status === "In Review") {
    return NextResponse.json({ error: "Already in review" }, { status: 409 })
  }

  // Verify cycle belongs to this client and get steps
  const { data: cycle } = await admin
    .from("approval_cycles")
    .select(`id, name, approval_cycle_steps (
      id, sort_order, assigned_to, can_edit_template, can_edit_cc, required
    )`)
    .eq("id", cycle_id)
    .eq("client_code", session.clientCode)
    .single()
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 })

  const steps = ((cycle as any).approval_cycle_steps ?? [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
  if (steps.length === 0) {
    return NextResponse.json({ error: "Cycle has no steps" }, { status: 400 })
  }

  // Delete any existing approval chain for this request (re-submit)
  await admin.from("approval_requests").delete().eq("request_id", request_id)

  // Create one approval_request row per step
  const rows = steps.map((step: any, idx: number) => ({
    request_id,
    client_code:       session.clientCode,
    submitted_by:      session.username,
    assigned_to:       step.assigned_to,
    sort_order:        step.sort_order,
    can_edit_template: step.can_edit_template,
    can_edit_cc:       step.can_edit_cc,
    status:            "pending",
    step_status:       idx === 0 ? "active" : "waiting", // first step goes active immediately
    cycle_id,
  }))

  const { data: inserted, error: insertErr } = await admin
    .from("approval_requests")
    .insert(rows)
    .select("id, sort_order, assigned_to, step_status")

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Update freight request status to "In Review"
  await admin
    .from("freight_requests")
    .update({ status: "In Review" })
    .eq("id", request_id)

  // Notify the first approver
  const firstStep = inserted?.[0]
  if (firstStep) {
    await admin.from("notifications").insert({
      client_code: session.clientCode,
      username:    firstStep.assigned_to,
      type:        "approval_required",
      title:       "Approval Required",
      body:        `${session.username} submitted a request for your approval`,
      request_id,
    })
  }

  void logActivity({
    clientCode:  session.clientCode,
    eventType:   "request_status_changed",
    actor:       session.username,
    description: `Submitted request for approval via cycle "${(cycle as any).name}"`,
    requestId:   request_id,
    meta:        { cycle_id, cycle_name: (cycle as any).name, step_count: steps.length },
  })

  return NextResponse.json({ ok: true, steps: inserted }, { status: 201 })
}
