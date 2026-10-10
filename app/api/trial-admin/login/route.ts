import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { ADMIN_COOKIE, adminConfigured, checkAdminLogin, signAdmin } from "@/lib/trial-admin"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  if (!adminConfigured()) return NextResponse.json({ error: "The owner login is not set up yet (TRIAL_ADMIN_USER and TRIAL_ADMIN_PASSWORD_HASH)." }, { status: 503 })
  const b = await req.json().catch(() => ({}))
  const admin = adminClient()
  const since = new Date(Date.now() - 15 * 60_000).toISOString()
  const { count } = await admin.from("trial_events").select("id", { count: "exact", head: true }).eq("type", "admin_login_failed").gte("created_at", since)
  if ((count ?? 0) >= 8) return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes." }, { status: 429 })
  if (!checkAdminLogin(String(b.user ?? ""), String(b.password ?? ""))) {
    await admin.from("trial_events").insert({ type: "admin_login_failed", meta: {} })
    return NextResponse.json({ error: "That user or password is not right." }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, signAdmin(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 8 * 3600 })
  return res
}
