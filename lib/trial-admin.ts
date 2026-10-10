/** Owner console for the trial: its own login, completely separate from the client portal and from lead logins.
 *  Credentials live in the database table trial_admins (migration 061), password stored as a SHA-256 hash.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"

export const ADMIN_COOKIE = "trial_admin"
const HOURS = 8
const key = () => "trial-admin:" + process.env.SUPABASE_SERVICE_ROLE_KEY!
const sign = (p: string) => createHmac("sha256", key()).update(p).digest("base64url")

export async function checkAdminLogin(user: string, password: string): Promise<boolean> {
  const { data } = await adminClient().from("trial_admins").select("password_hash").eq("username", user.trim().toLowerCase()).maybeSingle()
  const want = Buffer.from((data?.password_hash || "0".repeat(64)).toLowerCase()), got = Buffer.from(createHash("sha256").update(password).digest("hex"))
  return !!data && want.length === got.length && timingSafeEqual(want, got)
}
export function signAdmin(): string {
  const payload = Buffer.from(JSON.stringify({ a: 1, exp: Date.now() + HOURS * 3600_000 })).toString("base64url")
  return `${payload}.${sign(payload)}`
}
export function adminSession(req: NextRequest): boolean {
  try {
    const c = req.cookies.get(ADMIN_COOKIE)?.value
    if (!c) return false
    const i = c.lastIndexOf("."), payload = c.slice(0, i), sig = c.slice(i + 1), exp = sign(payload)
    if (exp.length !== sig.length || !timingSafeEqual(Buffer.from(exp), Buffer.from(sig))) return false
    return Date.now() < JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).exp
  } catch { return false }
}
