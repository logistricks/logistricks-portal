/** Owner console for the trial: its own login, completely separate from the client portal and from lead logins.
 *  Credentials live in Vercel env vars, not in any database table:
 *    TRIAL_ADMIN_USER           e.g. azeez
 *    TRIAL_ADMIN_PASSWORD_HASH  SHA-256 hex of the password:  echo -n 'your-password' | shasum -a 256
 */
import { createHash, createHmac, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"

export const ADMIN_COOKIE = "trial_admin"
const HOURS = 8
const key = () => "trial-admin:" + process.env.SUPABASE_SERVICE_ROLE_KEY!
const sign = (p: string) => createHmac("sha256", key()).update(p).digest("base64url")

export function adminConfigured(): boolean { return !!process.env.TRIAL_ADMIN_USER && /^[0-9a-f]{64}$/i.test(process.env.TRIAL_ADMIN_PASSWORD_HASH || "") }
export function checkAdminLogin(user: string, password: string): boolean {
  if (!adminConfigured()) return false
  const u = Buffer.from(createHash("sha256").update(user.trim().toLowerCase()).digest("hex")), wu = Buffer.from(createHash("sha256").update(process.env.TRIAL_ADMIN_USER!.trim().toLowerCase()).digest("hex"))
  const p = Buffer.from(createHash("sha256").update(password).digest("hex")), wp = Buffer.from(process.env.TRIAL_ADMIN_PASSWORD_HASH!.toLowerCase())
  return timingSafeEqual(u, wu) && timingSafeEqual(p, wp)
}
export function signAdmin(): string {
  const payload = Buffer.from(JSON.stringify({ a: 1, exp: Date.now() + HOURS * 3600_000 })).toString("base64url")
  return `${payload}.${sign(payload)}`
}
export function adminSession(req: NextRequest): boolean {
  try {
    const c = req.cookies.get(ADMIN_COOKIE)?.value
    if (!c || !adminConfigured()) return false
    const i = c.lastIndexOf("."), payload = c.slice(0, i), sig = c.slice(i + 1), exp = sign(payload)
    if (exp.length !== sig.length || !timingSafeEqual(Buffer.from(exp), Buffer.from(sig))) return false
    return Date.now() < JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).exp
  } catch { return false }
}
