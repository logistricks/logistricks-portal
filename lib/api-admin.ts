/** Server-only: the signed-in portal user and whether they are an admin. */
import type { NextRequest } from "next/server"
import { adminClient, getSession, type SessionData } from "@/lib/api-session"

export async function sessionWithRole(req: NextRequest): Promise<{ session: SessionData; role: string; email: string | null } | null> {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return null
  const { data } = await adminClient().from("portal_users").select("role, auth_email").eq("id", session.userId).maybeSingle()
  return { session, role: String(data?.role ?? "viewer"), email: data?.auth_email ?? null }
}

/** Setup and configuration are for admins only: null when allowed, otherwise the 403 (or 401) response to return. */
export async function adminOnly(req: NextRequest): Promise<import("next/server").NextResponse | null> {
  const { NextResponse } = await import("next/server")
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can change this setting." }, { status: 403 })
  return null
}
