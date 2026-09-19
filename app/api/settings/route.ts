/**
 * app/api/settings/route.ts
 * Read and update client-level settings (automation flags, critical fields).
 * Emails and WhatsApp numbers have their own tables handled separately.
 */

import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"
import { logActivity } from "@/lib/log-activity"

function getSession(cookie: string): { username: string; clientCode: string; role?: string } | null {
  try {
    const dotIndex = cookie.lastIndexOf(".")
    if (dotIndex === -1) return null
    const payload  = cookie.slice(0, dotIndex)
    const sig      = cookie.slice(dotIndex + 1)
    const expected = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .update(payload).digest("base64url")
    if (expected !== sig) return null
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!data.username || !data.clientCode || !data.exp) return null
    if (Date.now() > data.exp) return null
    return { username: data.username, clientCode: data.clientCode, role: data.role }
  } catch { return null }
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function auth(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return null
  return getSession(cookie)
}

// ── GET — fetch current automation flags ──────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data, error } = await admin()
    .from("clients")
    .select("allow_auto_send_to_carrier, require_critical_data, critical_fields, auto_reply_enabled, auto_reply_delay_min")
    .eq("client_code", session.clientCode)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── PATCH — update one or more automation flags ───────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  // Only admins and operators can change settings
  if (session.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot change settings" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const allowed = ["allow_auto_send_to_carrier", "require_critical_data", "critical_fields", "auto_reply_enabled", "auto_reply_delay_min"]
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 })
  }

  const { error } = await admin()
    .from("clients")
    .update(patch)
    .eq("client_code", session.clientCode)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void logActivity(session.clientCode, session.username, "settings_updated", {
    fields: Object.keys(patch),
  })

  return NextResponse.json({ ok: true })
}

// ── POST /api/settings/emails — add receiver email ────────────────────────────
// ── POST /api/settings/numbers — add WhatsApp number ─────────────────────────
// These are separate sub-routes; handled in /api/settings/emails and /api/settings/numbers
