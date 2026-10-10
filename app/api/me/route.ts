/**
 * app/api/me/route.ts
 * Returns the current session's username and clientCode from the signed cookie.
 * Used by client components that need the clientCode without storing it in sessionStorage.
 */

import { NextResponse, type NextRequest } from "next/server"
import { createHmac } from "crypto"

function getSession(cookie: string): { username: string; clientCode: string; role: string } | null {
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
    return { username: data.username, clientCode: data.clientCode, role: data.role ?? "operator" }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 })
  return NextResponse.json(session)
}
