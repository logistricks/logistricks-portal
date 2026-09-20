/**
 * app/api/settings/email-sources/route.ts
 *
 * GET    — list email sources for this client
 * POST   — create a new email source
 * PUT    — update an email source (body includes id)
 * DELETE — delete an email source (body: { id })
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"

const ALLOWED_FIELDS = [
  "name", "provider", "active",
  // IMAP
  "imap_host", "imap_port", "imap_username", "imap_password", "imap_tls",
  // Microsoft 365
  "ms_tenant_id", "ms_client_id", "ms_client_secret", "ms_email",
] as const

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = adminClient()
  const { data, error } = await admin
    .from("email_sources")
    .select("id, name, provider, imap_host, imap_port, imap_username, imap_tls, ms_email, ms_tenant_id, ms_client_id, active, created_at")
    .eq("client_code", session.clientCode)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const payload: Record<string, unknown> = { client_code: session.clientCode }
  for (const f of ALLOWED_FIELDS) {
    if (f in body) payload[f] = body[f]
  }

  if (!payload.name || !payload.provider) {
    return NextResponse.json({ error: "name and provider are required" }, { status: 400 })
  }

  const admin = adminClient()
  const { data, error } = await admin
    .from("email_sources")
    .insert(payload)
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}

export async function PUT(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { id, ...rest } = body
  if (!id || typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 })

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of ALLOWED_FIELDS) {
    if (f in rest) payload[f] = rest[f]
  }

  const admin = adminClient()
  const { error } = await admin
    .from("email_sources")
    .update(payload)
    .eq("id", id)
    .eq("client_code", session.clientCode)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const admin = adminClient()
  const { error } = await admin
    .from("email_sources")
    .delete()
    .eq("id", body.id)
    .eq("client_code", session.clientCode)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
