/**
 * app/api/users/route.ts
 * CRUD for portal_users — scoped to the caller's client_code.
 * Only admin-role users may modify other users.
 */

import { NextResponse, type NextRequest } from "next/server"
import { createClient }                    from "@supabase/supabase-js"
import { createHash, createHmac }          from "crypto"
import { logActivity }                     from "@/lib/log-activity"

// ── Auth helpers (same pattern as all other API routes) ──────────────────────

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

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex")
}

// ── GET — list all users for this client ────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await admin()
    .from("portal_users")
    .select("id, username, display_name, auth_email, role, is_active, created_at")
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

  // Only admins may create users
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

  const username: string     = (body.username ?? "").toLowerCase().trim()
  const password: string     = body.password ?? ""
  const display_name: string = body.display_name?.trim() ?? ""
  const auth_email: string   = body.auth_email?.trim() ?? ""
  const role: string         = body.role === "admin" ? "admin" : "operator"

  if (!username || username.length > 15)
    return NextResponse.json({ error: "username required (max 15 chars)" }, { status: 400 })
  if (!password || password.length < 6)
    return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 })

  const { error } = await db.from("portal_users").insert({
    client_code:   session.clientCode,
    username,
    display_name:  display_name || username,
    auth_email,
    role,
    is_active:     true,
    password_hash: hashPassword(password),
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

// ── PATCH — update display_name / role / is_active / password ───────────────

export async function PATCH(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = admin()

  // Fetch caller role
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

  // Non-admins can only update their own password
  if (!isAdmin && targetUsername !== session.username)
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })

  const patch: Record<string, unknown> = {}
  if (isAdmin && body.display_name !== undefined) patch.display_name = body.display_name
  if (isAdmin && body.role         !== undefined) patch.role         = body.role === "admin" ? "admin" : "operator"
  if (isAdmin && body.is_active    !== undefined) patch.is_active    = body.is_active

  if (body.password !== undefined) {
    if (body.password.length < 6)
      return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 })
    patch.password_hash = hashPassword(body.password)
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  // Guard: cannot demote or deactivate yourself
  if (targetUsername === session.username) {
    if (patch.role === "operator")
      return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 })
    if (patch.is_active === false)
      return NextResponse.json({ error: "Cannot deactivate your own account" }, { status: 400 })
  }

  // Guard: cannot remove the last active admin
  if (patch.is_active === false || patch.role === "operator") {
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

// ── DELETE — remove a user (cannot delete self or last admin) ───────────────

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
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })

  // Guard: last active admin
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
      return NextResponse.json({ error: "Cannot delete the last active admin" }, { status: 400 })
  }

  const { error } = await db
    .from("portal_users")
    .delete()
    .eq("client_code", session.clientCode)
    .eq("username", targetUsername)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "user_deleted",
    actor:       session.username,
    description: `Deleted user "${targetUsername}"`,
    meta: { username: targetUsername },
  })

  return NextResponse.json({ ok: true })
}
