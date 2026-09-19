/**
 * app/api/auth/login/route.ts
 *
 * Verifies username + clientCode + password against portal_users using the
 * service role key (bypasses RLS). On success sets a HMAC-signed HTTP-only
 * cookie — the browser never sees the raw payload, and JS cannot read it.
 */
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHash, createHmac } from "crypto"

function signSession(data: object): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url")
  const sig = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(payload)
    .digest("base64url")
  return `${payload}.${sig}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const username: string = (body.username ?? "").toLowerCase().trim()
    const clientCode: string = (body.clientCode ?? "").trim()
    const password: string = body.password ?? ""

    if (!username || !clientCode || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const hash = createHash("sha256").update(password).digest("hex")

    // Use service role — bypasses RLS, stays server-side only
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: user, error } = await admin
      .from("portal_users")
      .select("is_active, password_hash")
      .eq("username", username)
      .eq("client_code", clientCode)
      .maybeSingle()

    // Constant-time-ish: always check hash even on not-found
    const hashMatch = user?.password_hash === hash
    if (error || !user || !user.is_active || !hashMatch) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const token = signSession({
      username,
      clientCode,
      exp: Date.now() + 8 * 60 * 60 * 1000, // 8 h
    })

    const res = NextResponse.json({ ok: true })
    res.cookies.set("portal_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 28800, // 8 hours in seconds
    })
    return res
  } catch (err) {
    console.error("[api/auth/login]", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
