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
import { encryptSecret } from "@/lib/secret-box"
import { ensureReceiverEmail } from "@/lib/imap"

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
  const cols = "id, name, provider, imap_host, imap_port, imap_username, imap_tls, ms_email, ms_tenant_id, ms_client_id, active, created_at"
  let res: any = await admin.from("email_sources").select(`${cols}, imap_password, imap_password_enc, imap_last_checked_at, imap_last_error`).eq("client_code", session.clientCode).order("created_at", { ascending: true })
  // migration 055 not run yet: fall back to the old columns
  if (res.error) res = await admin.from("email_sources").select(`${cols}, imap_password`).eq("client_code", session.clientCode).order("created_at", { ascending: true })
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
  // never send a password (or its encrypted form) to the browser
  return NextResponse.json((res.data ?? []).map(({ imap_password, imap_password_enc, ...r }: any) => ({ ...r, has_password: !!(imap_password || imap_password_enc) })))
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
  if (typeof payload.imap_password === "string" && payload.imap_password) { payload.imap_password_enc = encryptSecret(payload.imap_password); payload.imap_password = null }
  else delete payload.imap_password

  if (!payload.name || !payload.provider) {
    return NextResponse.json({ error: "name and provider are required" }, { status: 400 })
  }

  const admin = adminClient()
  const { data, error } = await admin
    .from("email_sources")
    .insert(payload)
    .select("id")
    .single()

  if (error) {
    if (/imap_password_enc/.test(error.message)) return NextResponse.json({ error: "Run migration 055 (secure IMAP) in Supabase first, then save again." }, { status: 500 })
    // 23505 = unique violation: the mailbox already belongs to a client (never say which one).
    if (error.code === "23505")
      return NextResponse.json({ error: "This email address is already registered and cannot be added." }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (payload.provider === "imap" && payload.active !== false) await ensureReceiverEmail(admin, session.clientCode, String(payload.imap_username ?? ""))
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
  if (typeof payload.imap_password === "string" && payload.imap_password) { payload.imap_password_enc = encryptSecret(payload.imap_password); payload.imap_password = null }
  else delete payload.imap_password
  // a changed mailbox/login starts reading from "now" again
  if ("imap_host" in rest || "imap_username" in rest) { payload.imap_last_uid = null; payload.imap_uidvalidity = null }

  const admin = adminClient()
  let { error } = await admin
    .from("email_sources")
    .update(payload)
    .eq("id", id)
    .eq("client_code", session.clientCode)
  if (error && /imap_password_enc|imap_last_uid|imap_uidvalidity/.test(error.message)) {
    return NextResponse.json({ error: "Run migration 055 (secure IMAP) in Supabase first, then save again." }, { status: 500 })
  }

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "This email address is already registered and cannot be added." }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (rest.provider === "imap" && rest.active !== false) await ensureReceiverEmail(admin, session.clientCode, String(rest.imap_username ?? ""))
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
