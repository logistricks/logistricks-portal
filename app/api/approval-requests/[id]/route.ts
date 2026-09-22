/**
 * app/api/approval-requests/[id]/route.ts
 *
 * GET   — fetch one approval step with full request context + draft history
 *
 * PATCH — approve | reject | save-draft
 *   body: { action: "approve" | "reject" | "draft" }
 *         { notes }            (required on reject)
 *         { email_subject, email_body, email_cc }   (draft / approve with edits)
 *
 * Approve logic:
 *   1. Save a draft row if email fields changed
 *   2. Mark this step approved
 *   3. Activate the next step and notify its assignee
 *   4. If no next step → mark freight_request Approved
 *
 * Reject logic:
 *   1. Mark this step rejected
 *   2. Mark all other steps in the chain as skipped
 *   3. Return freight_request to Pending
 *   4. Notify submitter and prior approvers
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { logActivity } from "@/lib/log-activity"

function unauth() { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
function badInput(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }) }

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  const { id } = await params
  const admin = adminClient()

  const { data: ar, error } = await admin
    .from("approval_requests")
    .select(`
      id, sort_order, status, step_status, notes, decided_at,
      can_edit_template, can_edit_cc, submitted_by, assigned_to, cycle_id,
      freight_requests (
        id, sender_name, sender_email, origin_city, origin_country,
        destination_city, destination_country, cargo_type, weight,
        dimensions, equipment, mode, incoterm, bl_type, urgency,
        received_at, status, aog, dgr, client_code
      ),
      approval_cycles ( id, name ),
      approval_drafts ( id, edited_by, email_subject, email_body, email_cc, created_at )
    `)
    .eq("id", id)
    .single()

  if (error || !ar) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Verify this client owns the freight request
  const fr = (ar as any).freight_requests
  if (!fr || fr.client_code !== session.clientCode) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Sort drafts by created_at
  const drafts = ((ar as any).approval_drafts ?? [])
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  // Get sibling steps for the same request (to show the full chain)
  const { data: chain } = await admin
    .from("approval_requests")
    .select("id, sort_order, assigned_to, step_status, status, decided_at, notes")
    .eq("request_id", fr.id)
    .order("sort_order", { ascending: true })

  return NextResponse.json({ ...(ar as any), approval_drafts: drafts, chain: chain ?? [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return badInput("Invalid JSON") }

  const { action, notes, email_subject, email_body, email_cc } = body as {
    action?:       "approve" | "reject" | "draft"
    notes?:        string
    email_subject?: string
    email_body?:   string
    email_cc?:     string[]
  }
  if (!action) return badInput("action required: approve | reject | draft")

  const admin = adminClient()

  // Fetch the approval step
  const { data: ar } = await admin
    .from("approval_requests")
    .select(`
      id, sort_order, step_status, can_edit_template, can_edit_cc,
      submitted_by, assigned_to, cycle_id,
      freight_requests ( id, client_code, sender_name )
    `)
    .eq("id", id)
    .single()

  if (!ar) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const fr = (ar as any).freight_requests
  if (!fr || fr.client_code !== session.clientCode) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Only the assigned user can act (except admins — we'll allow client's portal_users admin role)
  // For now enforce strict: only assigned_to can approve/reject
  if (action !== "draft" && (ar as any).assigned_to !== session.username) {
    return NextResponse.json({ error: "Only the assigned approver can act" }, { status: 403 })
  }

  if ((ar as any).step_status !== "active") {
    return NextResponse.json({ error: "This step is not currently active" }, { status: 409 })
  }

  const requestId = fr.id

  // ── Save draft ─────────────────────────────────────────────────────────────
  if (action === "draft") {
    if (!email_subject && !email_body && !email_cc) {
      return badInput("At least one of email_subject, email_body, email_cc required")
    }
    const { data: draft, error: draftErr } = await admin
      .from("approval_drafts")
      .insert({
        approval_id:   id,
        edited_by:     session.username,
        email_subject: email_subject ?? null,
        email_body:    email_body    ?? null,
        email_cc:      email_cc      ?? null,
      })
      .select("id, edited_by, email_subject, email_body, email_cc, created_at")
      .single()
    if (draftErr) return NextResponse.json({ error: draftErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, draft })
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  if (action === "approve") {
    // Optionally save a draft if edits were provided
    if (email_subject || email_body || email_cc) {
      await admin.from("approval_drafts").insert({
        approval_id:   id,
        edited_by:     session.username,
        email_subject: email_subject ?? null,
        email_body:    email_body    ?? null,
        email_cc:      email_cc      ?? null,
      })
    }

    // Mark this step approved
    await admin.from("approval_requests").update({
      status:      "approved",
      step_status: "approved",
      notes:       notes ?? null,
      decided_at:  new Date().toISOString(),
    }).eq("id", id)

    // Find the next waiting step for this request
    const { data: nextStep } = await admin
      .from("approval_requests")
      .select("id, assigned_to, sort_order")
      .eq("request_id", requestId)
      .eq("step_status", "waiting")
      .order("sort_order", { ascending: true })
      .limit(1)
      .single()

    if (nextStep) {
      // Activate next step
      await admin.from("approval_requests")
        .update({ step_status: "active" })
        .eq("id", (nextStep as any).id)

      // Notify next approver
      await admin.from("notifications").insert({
        client_code: session.clientCode,
        username:    (nextStep as any).assigned_to,
        type:        "approval_required",
        title:       "Approval Required",
        body:        `Step ${(ar as any).sort_order} approved — your turn to review`,
        request_id:  requestId,
      })

      void logActivity({
        clientCode:  session.clientCode,
        eventType:   "request_status_changed",
        actor:       session.username,
        description: `Approved step ${(ar as any).sort_order} — forwarded to next approver`,
        requestId,
      })
    } else {
      // Last step approved — mark freight request as Approved
      await admin.from("freight_requests")
        .update({ status: "Approved" })
        .eq("id", requestId)

      // Notify submitter
      await admin.from("notifications").insert({
        client_code: session.clientCode,
        username:    (ar as any).submitted_by,
        type:        "approval_complete",
        title:       "Request Approved",
        body:        `All approval steps completed — request is ready to send to carrier`,
        request_id:  requestId,
      })

      void logActivity({
        clientCode:  session.clientCode,
        eventType:   "request_status_changed",
        actor:       session.username,
        description: "Final approval step approved — request marked Approved",
        requestId,
      })
    }

    return NextResponse.json({ ok: true, next: nextStep ? "next_step" : "fully_approved" })
  }

  // ── Reject ─────────────────────────────────────────────────────────────────
  if (action === "reject") {
    if (!notes?.trim()) return badInput("notes (rejection reason) required")

    // Mark this step rejected
    await admin.from("approval_requests").update({
      status:      "rejected",
      step_status: "rejected",
      notes,
      decided_at:  new Date().toISOString(),
    }).eq("id", id)

    // Skip all other pending/waiting/active steps
    await admin.from("approval_requests").update({
      status:      "skipped",
      step_status: "skipped",
    })
      .eq("request_id", requestId)
      .in("step_status", ["waiting", "active"])

    // Return freight request to Pending
    await admin.from("freight_requests")
      .update({ status: "Pending" })
      .eq("id", requestId)

    // Notify submitter
    await admin.from("notifications").insert({
      client_code: session.clientCode,
      username:    (ar as any).submitted_by,
      type:        "approval_rejected",
      title:       "Request Rejected",
      body:        `Step ${(ar as any).sort_order} rejected: ${notes}`,
      request_id:  requestId,
    })

    void logActivity({
      clientCode:  session.clientCode,
      eventType:   "request_status_changed",
      actor:       session.username,
      description: `Rejected at step ${(ar as any).sort_order}: ${notes}`,
      requestId,
      meta:        { rejection_note: notes },
    })

    return NextResponse.json({ ok: true })
  }

  return badInput("Unknown action")
}
