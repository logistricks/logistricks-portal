/**
 * app/api/approval-requests/route.ts
 *
 * GET  — list approval requests visible to the current user
 *         ?view=mine   → steps where I am in assigned_usernames and step_status = active
 *         ?view=all    → all steps for my client (admin)
 *
 * POST — submit a freight request into the user's assigned cycle
 *        body: { request_id: string }
 *        The cycle is resolved automatically from approval_cycle_initiators.
 *        Creates one approval_request row per cycle step.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { logActivity } from "@/lib/log-activity"

function unauth()           { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
function badInput(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }) }

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  const view = req.nextUrl.searchParams.get("view") ?? "mine"
  const admin = adminClient()

  const { data, error } = await admin
    .from("approval_requests")
    .select(`
      id, sort_order, status, step_status, notes, decided_at, created_at,
      can_edit_template, can_edit_cc, submitted_by, assigned_to,
      assigned_usernames, cycle_id,
      freight_requests (
        id, sender_name, sender_email, origin_city, origin_country,
        destination_city, destination_country, cargo_type, weight,
        dimensions, equipment, incoterm, bl_type, urgency,
        received_at, status, aog, dgr, client_code
      ),
      approval_cycles ( id, name )
    `)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (data ?? []).filter((r: any) => r.freight_requests && r.freight_requests.client_code?.toLowerCase() === session.clientCode?.toLowerCase())

  if (view === "mine") {
    rows = rows.filter((r: any) =>
      r.step_status === "active" &&
      (r.assigned_usernames?.includes(session.username) || r.assigned_to === session.username)
    )
  }

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return badInput("Invalid JSON") }

  const { request_id, email_subject, email_body } = body as {
    request_id?: string
    email_subject?: string
    email_body?: string
  }
  if (!request_id) return badInput("request_id required")

  const admin = adminClient()

  // Verify freight request belongs to this client and isn't already in review
  const { data: fr } = await admin
    .from("freight_requests")
    .select("id, status, client_code")
    .eq("id", request_id)
    .eq("client_code", session.clientCode)
    .single()
  if (!fr) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  if ((fr as any).status === "In Review") {
    // Allow re-submission only if existing steps have no valid assignees
    // (happens when a previous submission was broken — no members configured)
    const { data: existingSteps } = await admin
      .from("approval_requests")
      .select("id, assigned_usernames, assigned_to")
      .eq("request_id", request_id)
    const isStuck = (existingSteps ?? []).every((s: any) =>
      (!s.assigned_usernames || (s.assigned_usernames as string[]).length === 0) &&
      !s.assigned_to
    )
    if (!isStuck) {
      return NextResponse.json({ error: "Already in review" }, { status: 409 })
    }
    // Stuck approval — fall through to delete + recreate below
  }

  // Resolve cycle from initiators table
  const { data: initiator } = await admin
    .from("approval_cycle_initiators")
    .select("cycle_id")
    .eq("client_code", session.clientCode)
    .eq("username", session.username)
    .single()

  if (!initiator) {
    return NextResponse.json(
      { error: "No approval cycle is assigned to your account. Ask an admin to configure one in Settings → Approval Workflow." },
      { status: 403 }
    )
  }

  // Load cycle with steps + members
  const { data: cycle } = await admin
    .from("approval_cycles")
    .select(`
      id, name,
      approval_cycle_steps (
        id, sort_order, committee_mode, can_edit_template, can_edit_cc, required, assigned_to,
        approval_cycle_step_members ( username )
      )
    `)
    .eq("id", (initiator as any).cycle_id)
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
  const rows = steps.map((step: any, idx: number) => {
    const memberUsernames = (step.approval_cycle_step_members ?? []).map((m: any) => m.username)
    // Fall back to legacy assigned_to when cycle was created before committee members existed
    const effectiveUsernames = memberUsernames.length > 0 ? memberUsernames : (step.assigned_to ? [step.assigned_to] : [])
    return {
      request_id,
      client_code:        session.clientCode,
      submitted_by:       session.username,
      assigned_to:        effectiveUsernames[0] ?? "",  // legacy compat
      assigned_usernames: effectiveUsernames,
      sort_order:         step.sort_order,
      can_edit_template:  step.can_edit_template,
      can_edit_cc:        step.can_edit_cc,
      status:             "pending",
      // First step active
      step_status:        idx === 0 ? "active" : "waiting",
      cycle_id:           (cycle as any).id,
    }
  })

  const { data: inserted, error: insertErr } = await admin
    .from("approval_requests")
    .insert(rows)
    .select("id, sort_order, assigned_to, assigned_usernames, step_status")

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Update freight request status to "In Review"
  await admin.from("freight_requests").update({ status: "In Review" }).eq("id", request_id)

  // Save the email the submitter composed as the initial draft for step 1
  const firstStepRow = inserted?.[0] as any
  if ((email_subject || email_body) && firstStepRow) {
    await admin.from("approval_drafts").insert({
      approval_id:   firstStepRow.id,
      edited_by:     session.username,
      email_subject: email_subject ?? null,
      email_body:    email_body    ?? null,
      email_cc:      null,
    })
  }

  // Notify all members of the first step
  const firstStepDef = steps[0] as any
  if (firstStepRow) {
    if (firstStepDef.committee_mode === "notify_only") {
      // Auto-approve the first step immediately, activate next
      await admin.from("approval_requests")
        .update({ status: "approved", step_status: "approved", decided_at: new Date().toISOString() })
        .eq("id", firstStepRow.id)

      if (inserted && inserted.length > 1) {
        const secondRow = inserted[1] as any
        await admin.from("approval_requests")
          .update({ step_status: "active" })
          .eq("id", secondRow.id)
      }
    }

    const firstStepMembers = (firstStepDef.approval_cycle_step_members ?? []).map((m: any) => m.username)
    const firstStepEffective = firstStepMembers.length > 0 ? firstStepMembers : (firstStepDef.assigned_to ? [firstStepDef.assigned_to] : [])
    const notifUsernames: string[] = firstStepEffective

    const notifRows = notifUsernames.map((username: string) => ({
      client_code: session.clientCode,
      username,
      type:        firstStepDef.committee_mode === "notify_only" ? "approval_notification" : "approval_required",
      title:       firstStepDef.committee_mode === "notify_only" ? "Request Notification" : "Approval Required",
      body:        `${session.username} submitted a request ${firstStepDef.committee_mode === "notify_only" ? "for your notification" : "for your approval"}`,
      request_id,
    }))
    if (notifRows.length > 0) {
      await admin.from("notifications").insert(notifRows)
    }
  }

  void logActivity({
    clientCode:  session.clientCode,
    eventType:   "approval_submitted",
    actor:       session.username,
    description: `Submitted request for approval via cycle "${(cycle as any).name}"`,
    requestId:   request_id,
    meta:        { cycle_id: (cycle as any).id, cycle_name: (cycle as any).name, step_count: steps.length },
  })

  return NextResponse.json({ ok: true, steps: inserted }, { status: 201 })
}
