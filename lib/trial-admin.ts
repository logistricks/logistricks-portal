/** Owner console for the trial: its own login, completely separate from the client portal and from lead logins.
 *  Credentials live in the database table trial_admins (migration 061), password stored as a salted scrypt hash (older SHA-256 hashes are upgraded on the next login).
 */
import { createHmac, timingSafeEqual } from "crypto"
import { burnVerify, hashPassword, verifyPassword } from "@/lib/password"
import { sessionSecret } from "@/lib/session-secret"
import type { NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"

export const ADMIN_COOKIE = "trial_admin"
const HOURS = 8
const key = () => "trial-admin:" + sessionSecret()
const sign = (p: string) => createHmac("sha256", key()).update(p).digest("base64url")

export async function checkAdminLogin(user: string, password: string): Promise<boolean> {
  const name = user.trim().toLowerCase()
  const { data } = await adminClient().from("trial_admins").select("password_hash").eq("username", name).maybeSingle()
  if (!data) { await burnVerify(password); return false }
  const r = await verifyPassword(password, data.password_hash)
  // An old SHA-256 hash is re-saved as a salted hash after a correct login.
  if (r.ok && r.upgrade) { try { await adminClient().from("trial_admins").update({ password_hash: await hashPassword(password) }).eq("username", name) } catch { /* keep the old hash */ } }
  return r.ok
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
