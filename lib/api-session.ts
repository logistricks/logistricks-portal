/**
 * lib/api-session.ts
 * Server-only helper — imported only by API route files (Node.js runtime).
 * Validates and decodes the HMAC-signed portal_session cookie.
 */
import { createHmac } from "crypto"

export interface SessionData {
  username:   string
  clientCode: string
  userId:     string   // portal_users.id (UUID)
}

export function getSession(cookie: string): SessionData | null {
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
    // userId may be absent in old sessions — treat as invalid so users re-login
    if (!data.userId) return null
    return { username: data.username, clientCode: data.clientCode, userId: data.userId }
  } catch {
    return null
  }
}

/** Shared admin Supabase client (service role, no auth session). */
export function adminClient() {
  const { createClient } = require("@supabase/supabase-js")
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
