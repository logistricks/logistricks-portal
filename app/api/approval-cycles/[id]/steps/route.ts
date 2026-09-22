/**
 * app/api/approval-cycles/[id]/steps/route.ts
 *
 * POST   — add a step to a cycle
 * PUT    — replace all steps (full reorder / rebuild)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"

function unauth() { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
function badInput(msg: string) { return NextResponse.json({ error: msg }, { status: 400 }) }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  const { id: cycle_id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return badInput("Invalid JSON") }

  const assigned_to = (body.assigned_to as string | undefined)?.trim()
  if (!assigned_to) return badInput("assigned_to required")

  const admin = adminClient()

  // Verify cycle belongs to this client
  const { data: cycle } = await admin
    .from("approval_cycles")
    .select("id")
    .eq("id", cycle_id)
    .eq("client_code", session.clientCode)
    .single()
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 })

  // Determine next sort_order
  const { data: existing } = await admin
    .from("approval_cycle_steps")
    .select("sort_order")
    .eq("cycle_id", cycle_id)
    .order("sort_order", { ascending: false })
    .limit(1)
  const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1

  const { data, error } = await admin
    .from("approval_cycle_steps")
    .insert({
      cycle_id,
      sort_order:        body.sort_order ?? nextOrder,
      assigned_to,
      can_edit_template: Boolean(body.can_edit_template),
      can_edit_cc:       Boolean(body.can_edit_cc),
      required:          body.required !== false,
    })
    .select("id, sort_order, assigned_to, can_edit_template, can_edit_cc, required")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return unauth()
  const session = getSession(sessionCookie)
  if (!session) return unauth()

  const { id: cycle_id } = await params
  let body: unknown
  try { body = await req.json() } catch { return badInput("Invalid JSON") }
  if (!Array.isArray(body)) return badInput("Expected array of steps")

  const admin = adminClient()

  // Verify cycle belongs to this client
  const { data: cycle } = await admin
    .from("approval_cycles")
    .select("id")
    .eq("id", cycle_id)
    .eq("client_code", session.clientCode)
    .single()
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 })

  // Delete all existing steps and reinsert
  await admin.from("approval_cycle_steps").delete().eq("cycle_id", cycle_id)

  const steps = body.map((s: any, idx: number) => ({
    cycle_id,
    sort_order:        idx + 1,
    assigned_to:       String(s.assigned_to ?? "").trim(),
    can_edit_template: Boolean(s.can_edit_template),
    can_edit_cc:       Boolean(s.can_edit_cc),
    required:          s.required !== false,
  })).filter((s: any) => s.assigned_to)

  if (steps.length === 0) return NextResponse.json({ steps: [] })

  const { data, error } = await admin
    .from("approval_cycle_steps")
    .insert(steps)
    .select("id, sort_order, assigned_to, can_edit_template, can_edit_cc, required")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ steps: data ?? [] })
}
