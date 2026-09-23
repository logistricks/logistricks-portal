/**
 * app/api/approval-cycles/[id]/route.ts
 *
 * PUT    — replace a cycle's name, steps, members, initiators, and automation settings
 * DELETE — remove a cycle (cascades to steps, members, initiators)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"

function unauth()           { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
function badInput(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }) }
function notFound()         { return NextResponse.json({ error: "Not found" }, { status: 404 }) }

async function ownsCycle(admin: ReturnType<typeof adminClient>, id: string, clientCode: string) {
  const { data } = await admin
    .from("approval_cycles")
    .select("id")
    .eq("id", id)
    .eq("client_code", clientCode)
    .single()
  return !!data
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  const { id } = await params
  const admin = adminClient()

  if (!await ownsCycle(admin, id, session.clientCode)) return notFound()

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return badInput("Invalid JSON") }

  const name = (body.name as string | undefined)?.trim()
  if (!name) return badInput("name required")

  const steps = (body.steps as any[] | undefined) ?? []
  if (steps.length === 0) return badInput("at least one step required")

  for (const s of steps) {
    if (!Array.isArray(s.member_usernames) || s.member_usernames.length === 0) {
      return badInput(`step ${s.sort_order ?? "?"}: member_usernames required`)
    }
  }

  const applies_to_automated_emails = Boolean(body.applies_to_automated_emails)
  const automated_trigger = (body.automated_trigger as string | null | undefined) ?? null
  const initiator_usernames = (body.initiator_usernames as string[] | undefined) ?? []

  // Update cycle header
  await admin.from("approval_cycles").update({
    name,
    applies_to_automated_emails,
    automated_trigger: automated_trigger || null,
  }).eq("id", id)

  // Replace steps: delete all existing steps (cascades to members)
  await admin.from("approval_cycle_steps").delete().eq("cycle_id", id)

  // Re-insert steps
  const stepRows = steps.map((s: any) => ({
    cycle_id:          id,
    sort_order:        s.sort_order,
    committee_mode:    s.committee_mode ?? "any_approves",
    can_edit_template: s.can_edit_template ?? false,
    can_edit_cc:       s.can_edit_cc ?? false,
    required:          s.required ?? true,
    assigned_to:       (s.member_usernames ?? [])[0] ?? "",
  }))

  const { data: insertedSteps, error: stepsErr } = await admin
    .from("approval_cycle_steps")
    .insert(stepRows)
    .select("id, sort_order, committee_mode, can_edit_template, can_edit_cc, required")

  if (stepsErr) return NextResponse.json({ error: stepsErr.message }, { status: 500 })

  // Insert members
  const memberRows: any[] = []
  for (const step of (insertedSteps ?? [])) {
    const matchingInput = steps.find((s: any) => s.sort_order === (step as any).sort_order)
    for (const username of (matchingInput?.member_usernames ?? [])) {
      memberRows.push({ step_id: (step as any).id, username })
    }
  }
  if (memberRows.length > 0) {
    await admin.from("approval_cycle_step_members").insert(memberRows)
  }

  // Replace initiators for this cycle
  await admin.from("approval_cycle_initiators").delete().eq("cycle_id", id)
  if (initiator_usernames.length > 0) {
    const initRows = initiator_usernames.map(username => ({
      cycle_id:    id,
      client_code: session.clientCode,
      username,
    }))
    await admin.from("approval_cycle_initiators").upsert(initRows, { onConflict: "client_code,username" })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  const { id } = await params
  const admin = adminClient()

  if (!await ownsCycle(admin, id, session.clientCode)) return notFound()

  const { error } = await admin.from("approval_cycles").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
