/**
 * app/api/users/route.ts
 * CRUD for portal_users — scoped to the caller's client_code.
 * Roles: admin | operator | viewer
 * DELETE soft-deletes (is_active = false) — never hard-deletes.
 */

import { NextResponse, type NextRequest } from "next/server"
import { createClient }                    from "@supabase/supabase-js"
import { createHash, createHmac }          from "crypto"
import { logActivity }                     from "@/lib/log-activity"

// ── Auth helpers ─────────────────────────────────────────────────────────────

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

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function auth(req: NextRequest): { username: string; clientCode: string } | null {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return null
  return getSession(cookie)
}

function hashPassword(p: string): string {
  return createHash("sha256").update(p).digest("hex")
}

function validRole(r: unknown): r is "admin" | "operator" | "viewer" {
  return r === "admin" || r === "operator" || r === "viewer"
}

// ── GET — list all users for this client (admin only) ────────────────────────

export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = admin()
  const { data: caller } = await db
    .from("portal_users")
    .select("role")
    .eq("client_code", session.clientCode)
    .eq("username", session.username)
    .maybeSingle()
  if (caller?.role !== "admin")
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })

  const { data, error } = await db
    .from("portal_users")
    .select("id, username, display_name, auth_email, role, is_active, allowed_carriers, allowed_modes, created_at")
    .eq("client_code", session.clientCode)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST — create a new user ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = admin()
  const { data: caller } = await db
    .from("portal_users")
    .select("role")
    .eq("client_code", session.clientCode)
    .eq("username", session.username)
    .maybeSingle()
  if (caller?.role !== "admin")
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const username: string          = (body.username ?? "").toLowerCase().trim()
  const password: string          = body.password ?? ""
  const display_name: string      = body.display_name?.trim() ?? ""
  const auth_email: string        = body.auth_email?.trim() ?? ""
  const role                      = validRole(body.role) ? body.role : "operator"
  const allowed_carriers: string[] = Array.isArray(body.allowed_carriers) ? body.allowed_carriers : []
  const allowed_modes: string[]    = Array.isArray(body.allowed_modes)    ? body.allowed_modes    : []

  if (!username || username.length > 15)
    return NextResponse.json({ error: "username required (max 15 chars)" }, { status: 400 })
  if (!password || password.length < 6)
    return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 })

  const { error } = await db.from("portal_users").insert({
    client_code:      session.clientCode,
    username,
    display_name:     display_name || username,
    auth_email,
    role,
    is_active:        true,
    allowed_carriers,
    allowed_modes,
    password_hash:    hashPassword(password),
  })

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "Username already exists for this client" }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "user_created",
    actor:       session.username,
    description: `Created user "${username}" (${role})`,
    meta: { username, role },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}

// ── PATCH — update user fields ───────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = admin()
  const { data: caller } = await db
    .from("portal_users")
    .select("role")
    .eq("client_code", session.clientCode)
    .eq("username", session.username)
    .maybeSingle()
  const isAdmin = caller?.role === "admin"

  const body = await req.json().catch(() => null)
  if (!body?.username)
    return NextResponse.json({ error: "username required" }, { status: 400 })

  const targetUsername: string = body.username

  if (!isAdmin && targetUsername !== session.username)
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })

  const patch: Record<string, unknown> = {}
  if (isAdmin && body.display_name      !== undefined) patch.display_name      = body.display_name
  if (isAdmin && body.auth_email        !== undefined) patch.auth_email        = body.auth_email
  if (isAdmin && validRole(body.role))                 patch.role              = body.role
  if (isAdmin && body.is_active         !== undefined) patch.is_active         = body.is_active
  if (isAdmin && Array.isArray(body.allowed_carriers)) patch.allowed_carriers  = body.allowed_carriers
  if (isAdmin && Array.isArray(body.allowed_modes))    patch.allowed_modes     = body.allowed_modes

  if (body.password !== undefined) {
    if ((body.password as string).length < 6)
      return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 })
    patch.password_hash = hashPassword(body.password as string)
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  // Self-protection guards
  if (targetUsername === session.username) {
    if (patch.role === "operator" || patch.role === "viewer")
      return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 })
    if (patch.is_active === false)
      return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 })
  }

  // Last-admin guard
  if (patch.is_active === false || patch.role === "operator" || patch.role === "viewer") {
    const { count } = await db
      .from("portal_users")
      .select("id", { count: "exact", head: true })
      .eq("client_code", session.clientCode)
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("username", targetUsername)
    if ((count ?? 0) === 0)
      return NextResponse.json({ error: "Cannot remove the last active admin" }, { status: 400 })
  }

  const { error } = await db
    .from("portal_users")
    .update(patch)
    .eq("client_code", session.clientCode)
    .eq("username", targetUsername)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "user_updated",
    actor:       session.username,
    description: `Updated user "${targetUsername}"`,
    meta: { username: targetUsername, changes: Object.keys(patch).filter(k => k !== "password_hash") },
  })

  return NextResponse.json({ ok: true })
}

// ── DELETE — soft-delete (deactivate); never hard-deletes ────────────────────

export async function DELETE(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = admin()
  const { data: caller } = await db
    .from("portal_users")
    .select("role")
    .eq("client_code", session.clientCode)
    .eq("username", session.username)
    .maybeSingle()
  if (caller?.role !== "admin")
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })

  const url            = new URL(req.url)
  const targetUsername = url.searchParams.get("username") ?? ""
  if (!targetUsername)
    return NextResponse.json({ error: "username required" }, { status: 400 })

  if (targetUsername === session.username)
    return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 })

  // Last-admin guard
  const { data: targetUser } = await db
    .from("portal_users")
    .select("role, is_active, display_name")
    .eq("client_code", session.clientCode)
    .eq("username", targetUsername)
    .maybeSingle()

  if (targetUser?.role === "admin" && targetUser?.is_active) {
    const { count } = await db
      .from("portal_users")
      .select("id", { count: "exact", head: true })
      .eq("client_code", session.clientCode)
      .eq("role", "admin")
      .eq("is_active", true)
    if ((count ?? 0) <= 1)
      return NextResponse.json({ error: "Cannot deactivate the last active admin" }, { status: 400 })
  }

  // Soft-delete: deactivate only, never hard-delete
  const { error } = await db
    .from("portal_users")
    .update({ is_active: false })
    .eq("client_code", session.clientCode)
    .eq("username", targetUsername)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "user_deactivated",
    actor:       session.username,
    description: `Deactivated user "${targetUsername}"`,
    meta: { username: targetUsername },
  })

  return NextResponse.json({ ok: true })
}
