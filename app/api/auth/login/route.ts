/**
 * app/api/auth/login/route.ts
 *
 * Verifies username + clientCode + password against portal_users using the
 * service role key (bypasses RLS). On success sets a HMAC-signed HTTP-only
 * cookie — the browser never sees the raw payload, and JS cannot read it.
 *
 * Session payload includes userId (portal_users.id) and role so that
 * per-user features (push subscriptions, read state, admin gating) work.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"
import { burnVerify, hashPassword, verifyPassword } from "@/lib/password"
import { clearFailures, clientIp, failureCount, recordFailure } from "@/lib/rate-limit"
import { sessionSecret } from "@/lib/session-secret"

const MAX_ACCOUNT = 8          // failed attempts per account
const MAX_IP = 30              // failed attempts per IP
const WINDOW_MS = 15 * 60 * 1000

function signSession(data: object): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url")
  const sig = createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url")
  return `${payload}.${sig}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const username:   string = (body.username   ?? "").toLowerCase().trim()
    const clientCode: string = (body.clientCode ?? "").trim()
    const password:   string = body.password ?? ""

    if (!username || !clientCode || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Lockout: too many recent failures for this account or from this address.
    const accountKey = `login:${clientCode.toLowerCase()}:${username}`
    const ipKey = `login-ip:${clientIp(req)}`
    if ((await failureCount(admin, accountKey, WINDOW_MS)) >= MAX_ACCOUNT || (await failureCount(admin, ipKey, WINDOW_MS)) >= MAX_IP) {
      return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": "900" } })
    }

    const { data: user, error } = await admin
      .from("portal_users")
      .select("id, is_active, password_hash, role")
      .eq("username", username)
      .eq("client_code", clientCode)
      .maybeSingle()

    // Always do the same amount of work, so a wrong username cannot be told from a wrong password.
    let check = { ok: false, upgrade: false }
    if (user && !error) check = await verifyPassword(password, user.password_hash)
    else await burnVerify(password)
    if (error || !user || !user.is_active || !check.ok) {
      await recordFailure(admin, accountKey)
      await recordFailure(admin, ipKey)
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }
    await clearFailures(admin, accountKey)

    // Old accounts hold an unsalted SHA-256 hash: re-save it as a salted hash now that the password is known to be right.
    if (check.upgrade) {
      try { await admin.from("portal_users").update({ password_hash: await hashPassword(password) }).eq("id", user.id) } catch { /* keep the old hash */ }
    }

    // Update last_login_at (best-effort, don't fail login if it errors)
    try {
      await admin
        .from("portal_users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", user.id)
    } catch { /* ignore */ }

    const token = signSession({
      username,
      clientCode,
      userId: user.id,
      role:   user.role ?? "operator",
      exp:    Date.now() + 8 * 60 * 60 * 1000,
    })

    const res = NextResponse.json({ ok: true })
    res.cookies.set("portal_session", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      path:     "/",
      maxAge:   28800,
    })
    return res
  } catch (err) {
    console.error("[api/auth/login]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
