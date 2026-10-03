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
