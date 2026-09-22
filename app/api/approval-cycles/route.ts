/**
 * app/api/approval-cycles/route.ts
 *
 * GET  — list all approval cycles (with steps) for the client
 * POST — create a new named cycle
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"

function unauth() { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
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
      id, name, is_default, created_at,
      approval_cycle_steps (
        id, sort_order, assigned_to, can_edit_template, can_edit_cc, required
      )
    `)
    .eq("client_code", session.clientCode)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sort steps by sort_order
  const cycles = (data ?? []).map((c: any) => ({
    ...c,
    approval_cycle_steps: (c.approval_cycle_steps ?? []).sort(
      (a: any, b: any) => a.sort_order - b.sort_order
    ),
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

  const admin = adminClient()

  // If is_default is requested, clear existing default first
  const is_default = Boolean(body.is_default)
  if (is_default) {
    await admin
      .from("approval_cycles")
      .update({ is_default: false })
      .eq("client_code", session.clientCode)
      .eq("is_default", true)
  }

  const { data, error } = await admin
    .from("approval_cycles")
    .insert({ client_code: session.clientCode, name, is_default })
    .select("id, name, is_default, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, approval_cycle_steps: [] }, { status: 201 })
}
