/**
 * app/api/approval-requests/[id]/route.ts
 *
 * GET   — fetch one approval step with full context, draft history, sibling chain,
 *          committee responses
 *
 * PATCH — action: "approve" | "reject" | "draft"
 *
 * Approve logic (committee-aware):
 *   1. Insert a row into approval_step_responses for this user
 *   2. For "any_approves" steps: first approval advances the chain immediately
 *   3. For "notify_only" steps: auto-resolved at submission time; shouldn't reach here
 *   4. If no next step → mark freight_request Approved
 *
 * Reject logic:
 *   1. Insert rejection response
 *   2. Mark step rejected, skip remaining steps
 *   3. Return freight_request to Pending, notify submitter
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { logActivity } from "@/lib/log-activity"

function unauth()           { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
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
      id, sort_order, status, step_status, notes, decided_at, created_at,
      can_edit_template, can_edit_cc, submitted_by, assigned_to,
      assigned_usernames, cycle_id,
      freight_requests (
        id, sender_name, sender_email, origin_city, origin_country,
        destination_city, destination_country, cargo_type, weight,
        dimensions, equipment, incoterm, bl_type, urgency,
        received_at, status, aog, dgr, client_code,
        is_sea, is_air, is_land, special_requirements, suggested_reply
      ),
      approval_cycles ( id, name ),
      approval_drafts ( id, edited_by, email_subject, email_body, email_cc, created_at ),
      approval_step_responses ( id, username, response, notes, created_at )
    `)
    .eq("id", id)
    .single()

  if (error || !ar) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const fr = (ar as any).freight_requests
  if (!fr || fr.client_code?.toLowerCase() !== session.clientCode?.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const drafts = ((ar as any).approval_drafts ?? [])
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  // Sibling chain with committee members for display
  const [{ data: chain }, { data: templates }] = await Promise.all([
    admin
      .from("approval_requests")
      .select(`
        id, sort_order, assigned_to, assigned_usernames, step_status, status, decided_at, notes,
        approval_step_responses ( username, response, created_at )
      `)
      .eq("request_id", fr.id)
      .order("sort_order", { ascending: true }),
    admin
      .from("templates")
      .select("subject, body")
      .eq("client_code", session.clientCode)
      .eq("is_reply_template", true)
      .order("template_id", { ascending: true })
      .limit(1),
  ])

  const replyTemplate = templates?.[0] ?? null

  // Map PostgREST table names + DB columns to what the frontend expects
  const { freight_requests: _fr, approval_cycles, approval_drafts: _drafts, approval_step_responses, ...rest } = ar as any

  const modes = [
    ...(_fr.is_sea  ? ["Sea"]  : []),
    ...(_fr.is_air  ? ["Air"]  : []),
    ...(_fr.is_land ? ["Land"] : []),
  ]

  const freight_request = {
    id:                   _fr.id,
    reference_number:     `REQ-${_fr.id.slice(0, 8).toUpperCase()}`,
    status:               _fr.status,
    commodity:            _fr.cargo_type ?? null,
    weight_kg:            _fr.weight ? parseFloat(_fr.weight) || null : null,
    dimensions:           _fr.dimensions ?? null,
    origin_port:          [_fr.origin_city, _fr.origin_country].filter(Boolean).join(", ") || null,
    destination_port:     [_fr.destination_city, _fr.destination_country].filter(Boolean).join(", ") || null,
    transport_mode:       modes.length > 0 ? modes.join(" / ") : null,
    incoterms:            _fr.incoterm ?? null,
    is_aog:               !!_fr.aog,
    is_dgr:               !!_fr.dgr,
    special_instructions: Array.isArray(_fr.special_requirements) && _fr.special_requirements.length > 0
                            ? _fr.special_requirements.join("; ")
                            : null,
    submitted_by:         (ar as any).submitted_by ?? null,
    submitted_at:         (ar as any).created_at ?? null,
    // Base email template from the active reply template (drafts override this)
    email_subject:        replyTemplate?.subject ?? null,
    email_body:           replyTemplate?.body ?? _fr.suggested_reply ?? null,
    email_cc:             null,
  }

  return NextResponse.json({
    ...rest,
    freight_request,
    cycle: approval_cycles ?? null,
    drafts,
    chain: chain ?? [],
  })
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

  const { data: ar } = await admin
    .from("approval_requests")
    .select(`
      id, sort_order, step_status, can_edit_template, can_edit_cc,
      submitted_by, assigned_to, assigned_usernames, cycle_id,
      freight_requests ( id, client_code, sender_name )
    `)
    .eq("id", id)
    .single()

  if (!ar) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const fr = (ar as any).freight_requests
  if (!fr || fr.client_code?.toLowerCase() !== session.clientCode?.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Verify this user is a committee member of this step
  const assignedUsernames: string[] = (ar as any).assigned_usernames ?? []
  const legacyAssigned: string = (ar as any).assigned_to ?? ""
  const isAssigned = assignedUsernames.includes(session.username) || legacyAssigned === session.username

  if (action !== "draft" && !isAssigned) {
    return NextResponse.json({ error: "You are not assigned to this step" }, { status: 403 })
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

  // ── Check for duplicate response ───────────────────────────────────────────
  const { data: existing } = await admin
    .from("approval_step_responses")
    .select("id, response")
    .eq("approval_request_id", id)
    .eq("username", session.username)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: `You already ${(existing as any).response} this step` },
      { status: 409 }
    )
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  if (action === "approve") {
    if (email_subject || email_body || email_cc) {
      await admin.from("approval_drafts").insert({
        approval_id:   id,
        edited_by:     session.username,
        email_subject: email_subject ?? null,
        email_body:    email_body    ?? null,
        email_cc:      email_cc      ?? null,
      })
    }

    // Record this user's approval
    await admin.from("approval_step_responses").insert({
      approval_request_id: id,
      username:            session.username,
      response:            "approved",
      notes:               notes ?? null,
    })

    // For "any_approves" mode: first approval advances the chain
    // (committee_mode is on the step template, not the request; we treat default as any_approves)
    // Advance the chain
    await admin.from("approval_requests").update({
      status:      "approved",
      step_status: "approved",
      notes:       notes ?? null,
      decided_at:  new Date().toISOString(),
    }).eq("id", id)

    // Find next waiting step
    const { data: nextStep } = await admin
      .from("approval_requests")
      .select("id, assigned_to, assigned_usernames, sort_order")
      .eq("request_id", requestId)
      .eq("step_status", "waiting")
      .order("sort_order", { ascending: true })
      .limit(1)
      .single()

    if (nextStep) {
      await admin.from("approval_requests")
        .update({ step_status: "active" })
        .eq("id", (nextStep as any).id)

      // Notify all members of next step
      const nextUsernames: string[] = (nextStep as any).assigned_usernames?.length
        ? (nextStep as any).assigned_usernames
        : [(nextStep as any).assigned_to].filter(Boolean)

      const notifRows = nextUsernames.map((username: string) => ({
        client_code: session.clientCode,
        username,
        type:        "approval_required",
        title:       "Approval Required",
        body:        `Step ${(ar as any).sort_order} approved — your turn to review`,
        request_id:  requestId,
      }))
      if (notifRows.length > 0) await admin.from("notifications").insert(notifRows)

      void logActivity({
        clientCode:  session.clientCode,
        eventType:   "approval_step_approved",
        actor:       session.username,
        description: `Approved step ${(ar as any).sort_order} — forwarded to next approver`,
        requestId,
      })
    } else {
      // Last step — mark request Approved
      await admin.from("freight_requests")
        .update({ status: "Approved" })
        .eq("id", requestId)

      await admin.from("notifications").insert({
        client_code: session.clientCode,
        username:    (ar as any).submitted_by,
        type:        "approval_complete",
        title:       "Request Approved",
        body:        "All approval steps completed — request is ready to send",
        request_id:  requestId,
      })

      void logActivity({
        clientCode:  session.clientCode,
        eventType:   "approval_cycle_completed",
        actor:       session.username,
        description: "Final approval step approved — request marked Approved",
        requestId,
      })
    }

    return NextResponse.json({ ok: true, next: nextStep ? "next_step" : "fully_approved" })
  }

  // ── Reject ─────────────────────────────────────────────────────────────────
  if (action === "reject") {
    if (!notes?.trim()) return badInput("Rejection reason required")

    await admin.from("approval_step_responses").insert({
      approval_request_id: id,
      username:            session.username,
      response:            "rejected",
      notes,
    })

    await admin.from("approval_requests").update({
      status:      "rejected",
      step_status: "rejected",
      notes,
      decided_at:  new Date().toISOString(),
    }).eq("id", id)

    await admin.from("approval_requests").update({
      status:      "skipped",
      step_status: "skipped",
    })
      .eq("request_id", requestId)
      .in("step_status", ["waiting", "active"])

    await admin.from("freight_requests")
      .update({ status: "Rejected" })
      .eq("id", requestId)

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
      eventType:   "approval_step_rejected",
      actor:       session.username,
      description: `Rejected at step ${(ar as any).sort_order}: ${notes}`,
      requestId,
      meta:        { rejection_note: notes },
    })

    return NextResponse.json({ ok: true })
  }

  return badInput("Unknown action")
}
