import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { TRIAL_COOKIE, hashPassword, logEvent, purgeTrialData, signTrial } from "@/lib/trial-server"
import { timingSafeEqual } from "crypto"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const code = String(b.code ?? "").trim().toUpperCase()
  const password = String(b.password ?? "")
  if (!code || !password) return NextResponse.json({ error: "Enter your code and password." }, { status: 400 })
  const admin = adminClient()
  const { data: lead } = await admin.from("trial_leads").select("*").eq("code", code).maybeSingle()
  // Throttle: 8 wrong tries in 15 minutes locks that code for a while.
  if (lead) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString()
    const { count } = await admin.from("trial_events").select("id", { count: "exact", head: true }).eq("lead_id", lead.id).eq("type", "login_failed").gte("created_at", since)
    if ((count ?? 0) >= 8) return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes." }, { status: 429 })
  }
  const given = Buffer.from(hashPassword(password)), want = Buffer.from(lead?.password_hash ?? "0".repeat(64))
  const ok = lead && given.length === want.length && timingSafeEqual(given, want)
  if (!lead || !ok) {
    if (lead) await logEvent(admin, lead.id, "login_failed")
    return NextResponse.json({ error: "That code or password is not right." }, { status: 401 })
  }
  if (lead.status !== "active") return NextResponse.json({ error: "This trial login is switched off." }, { status: 403 })
  if (Date.now() > Date.parse(lead.expires_at)) {
    await logEvent(admin, lead.id, "expired_login")
    return NextResponse.json({ error: "This trial login has expired." }, { status: 403 })
  }
  if (!lead.first_login_at) await admin.from("trial_leads").update({ first_login_at: new Date().toISOString() }).eq("id", lead.id)
  await logEvent(admin, lead.id, "login")
  void purgeTrialData(admin)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(TRIAL_COOKIE, signTrial(lead.id), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600 })
  return res
}
