/**
 * app/api/notifications/route.ts
 *
 * GET  — list recent notifications for this client (up to 30, newest first)
 * PATCH — mark one or all as read
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = adminClient()
  const { data, error } = await admin
    .from("notifications")
    .select("id, type, title, body, request_id, read_at, created_at")
    .eq("client_code", session.clientCode)
    .order("created_at", { ascending: false })
    .limit(30)

  if (error) {
    console.error("[api/notifications GET]", error.message)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function PATCH(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { id?: string; read_all?: boolean }
  try { body = await req.json() } catch { body = {} }

  const admin = adminClient()
  const now = new Date().toISOString()

  if (body.read_all) {
    const { error } = await admin
      .from("notifications")
      .update({ read_at: now })
      .eq("client_code", session.clientCode)
      .is("read_at", null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (body.id) {
    const { error } = await admin
      .from("notifications")
      .update({ read_at: now })
      .eq("id", body.id)
      .eq("client_code", session.clientCode)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: "Provide id or read_all" }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
