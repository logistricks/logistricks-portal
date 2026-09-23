/**
 * app/api/approval-cycles/route.ts
 *
 * GET  — list all approval cycles for the client (with steps, members, initiators)
 * POST — create a complete cycle in one call
 *        body: {
 *          name: string
 *          applies_to_automated_emails?: boolean
 *          automated_trigger?: "carrier_email" | "reply_email" | "both" | null
 *          initiator_usernames?: string[]
 *          steps: Array<{
 *            sort_order: number
 *            committee_mode: "any_approves" | "notify_only"
 *            can_edit_template?: boolean
 *            member_usernames: string[]
 *          }>
 *        }
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"

function unauth()           { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
function badInput(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }) }

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  const admin = adminClient()

  const { data, error } = await admin
    .from("approval_cycles")
    .select(`
      id, name, is_default, applies_to_automated_emails, automated_trigger, created_at,
      approval_cycle_steps (
        id, sort_order, committee_mode, can_edit_template, can_edit_cc, required,
        approval_cycle_step_members ( id, username )
      ),
      approval_cycle_initiators ( id, username )
    `)
    .eq("client_code", session.clientCode)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cycles = (data ?? []).map((c: any) => ({
    ...c,
    approval_cycle_steps: (c.approval_cycle_steps ?? [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((s: any) => ({
        ...s,
        member_usernames: (s.approval_cycle_step_members ?? []).map((m: any) => m.username),
      })),
    initiator_usernames: (c.approval_cycle_initiators ?? []).map((i: any) => i.username),
  }))

  return NextResponse.json(cycles)
}

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

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

  const admin = adminClient()

  // Create the cycle
  const { data: cycle, error: cycleErr } = await admin
    .from("approval_cycles")
    .insert({
      client_code: session.clientCode,
      name,
      applies_to_automated_emails,
      automated_trigger: automated_trigger || null,
    })
    .select("id, name, is_default, applies_to_automated_emails, automated_trigger, created_at")
    .single()

  if (cycleErr) return NextResponse.json({ error: cycleErr.message }, { status: 500 })
  const cycleId = (cycle as any).id

  // Insert steps
  const stepRows = steps.map((s: any) => ({
    cycle_id:          cycleId,
    sort_order:        s.sort_order,
    committee_mode:    s.committee_mode ?? "any_approves",
    can_edit_template: s.can_edit_template ?? false,
    can_edit_cc:       s.can_edit_cc ?? false,
    required:          s.required ?? true,
    assigned_to:       (s.member_usernames ?? [])[0] ?? "",  // legacy compat
  }))

  const { data: insertedSteps, error: stepsErr } = await admin
    .from("approval_cycle_steps")
    .insert(stepRows)
    .select("id, sort_order, committee_mode, can_edit_template, can_edit_cc, required")

  if (stepsErr) return NextResponse.json({ error: stepsErr.message }, { status: 500 })

  // Insert step members
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

  // Insert initiators (upsert — replaces their previous cycle assignment)
  if (initiator_usernames.length > 0) {
    const initRows = initiator_usernames.map(username => ({
      cycle_id:    cycleId,
      client_code: session.clientCode,
      username,
    }))
    await admin
      .from("approval_cycle_initiators")
      .upsert(initRows, { onConflict: "client_code,username" })
  }

  return NextResponse.json({ ...(cycle as any), approval_cycle_steps: insertedSteps ?? [], initiator_usernames }, { status: 201 })
}
