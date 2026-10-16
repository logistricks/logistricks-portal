/**
 * app/api/settings/route.ts
 *
 * GET  — returns the client's automation settings
 * PATCH — updates one or more automation flags on the clients table
 *         Uses the service-role admin client, so RLS is bypassed correctly.
 *
 * Accepted PATCH fields:
 *   allow_auto_send_to_carrier  boolean
 *   require_critical_data       boolean
 *   critical_fields             string[]
 *   auto_reply_enabled          boolean
 *   auto_reply_missing_enabled   boolean
 *   auto_reply_complete_enabled   boolean
 */
import { restoreRows, saveUndo, snapshot, type UndoOp } from "@/lib/undo"
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sanitizeCriticalConfig } from "@/lib/critical-config"
import { createHmac } from "crypto"

// ── Auth helper ───────────────────────────────────────────────────────────────

function getSession(cookie: string): { username: string; clientCode: string } | null {
  try {
    const dotIndex = cookie.lastIndexOf(".")
    if (dotIndex === -1) return null
    const payload  = cookie.slice(0, dotIndex)
    const sig      = cookie.slice(dotIndex + 1)
    const expected = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .update(payload)
      .digest("base64url")
    if (expected !== sig) return null
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!data.username || !data.clientCode || !data.exp) return null
    if (Date.now() > data.exp) return null
    return { username: data.username, clientCode: data.clientCode }
  } catch {
    return null
  }
}

function auth(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return null
  return getSession(cookie)
}

// ── Allowed fields (whitelist) ────────────────────────────────────────────────

const ALLOWED_FIELDS = new Set([
  "allow_auto_send_to_carrier",
  "require_critical_data",
  "critical_fields",
  "critical_fields_by_type",
  "auto_reply_enabled",
  "auto_reply_missing_enabled",
  "auto_reply_complete_enabled",
])

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cols = "allow_auto_send_to_carrier, require_critical_data, critical_fields, auto_reply_enabled, auto_reply_missing_enabled, auto_reply_complete_enabled"
  let { data, error } = await adminClient().from("clients").select(`${cols}, critical_fields_by_type`).eq("client_code", session.clientCode).single()
  // migration 077 not run yet: fall back to the older columns
  if (error && /critical_fields_by_type/.test(error.message)) {
    ;({ data, error } = await adminClient().from("clients").select(cols).eq("client_code", session.clientCode).single() as any)
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Only allow whitelisted fields
  const update: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (key === "critical_fields_by_type") update[key] = sanitizeCriticalConfig(value)
    else if (ALLOWED_FIELDS.has(key)) update[key] = value
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const beforeRows = await snapshot(adminClient(), "clients", { client_code: session.clientCode }, ["client_code", ...Object.keys(update)].join(","))
  const { error } = await adminClient()
    .from("clients")
    .update(update)
    .eq("client_code", session.clientCode)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const undo = await saveUndo(adminClient(), session, "Settings updated", restoreRows("clients", beforeRows, ["client_code"]))
  return NextResponse.json({ ok: true }, { headers: undo })
}
