/**
 * app/api/approval-cycles/[id]/route.ts
 *
 * PATCH  — rename cycle or toggle is_default
 * DELETE — remove a cycle (and its steps via CASCADE)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"

function unauth() { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

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
  try { body = await req.json() } catch { body = {} }

  const admin = adminClient()
  const patch: Record<string, unknown> = {}
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim()
  if (typeof body.is_default === "boolean") {
    patch.is_default = body.is_default
    if (body.is_default) {
      await admin
        .from("approval_cycles")
        .update({ is_default: false })
        .eq("client_code", session.clientCode)
        .neq("id", id)
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const { data, error } = await admin
    .from("approval_cycles")
    .update(patch)
    .eq("id", id)
    .eq("client_code", session.clientCode)
    .select("id, name, is_default")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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

  const { error } = await admin
    .from("approval_cycles")
    .delete()
    .eq("id", id)
    .eq("client_code", session.clientCode)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
