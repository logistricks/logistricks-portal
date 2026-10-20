import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { TRIAL_COOKIE, cleanCode, hashPassword, logEvent, purgeTrialData, signTrial } from "@/lib/trial-server"
import { timingSafeEqual } from "crypto"

export const runtime = "nodejs"

// Wrong guesses per visitor address (best effort: each server instance counts for itself). The code itself is long enough to be unguessable.
const misses = new Map<string, number[]>()
function tooMany(ip: string, add: boolean): boolean {
  const now = Date.now(), list = (misses.get(ip) ?? []).filter((t) => now - t < 15 * 60_000)
  if (add) list.push(now)
  misses.set(ip, list)
  if (misses.size > 5000) misses.clear()
  return list.length > 20
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const code = cleanCode(b.code)
  const password = String(b.password ?? "")
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?"
  if (!code) return NextResponse.json({ error: "Enter your access code." }, { status: 400 })
  if (tooMany(ip, false)) return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes." }, { status: 429 })
  const admin = adminClient()
  const { data: lead } = await admin.from("trial_leads").select("*").eq("code", code).maybeSingle()
  if (!lead) { tooMany(ip, true); return NextResponse.json({ error: "That access code is not right." }, { status: 401 }) }
  // Throttle: 8 wrong tries in 15 minutes locks that code for a while.
  const since = new Date(Date.now() - 15 * 60_000).toISOString()
  const { count } = await admin.from("trial_events").select("id", { count: "exact", head: true }).eq("lead_id", lead.id).eq("type", "login_failed").gte("created_at", since)
  if ((count ?? 0) >= 8) return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes." }, { status: 429 })
  // New logins are the code alone. An older login that was given its own password still asks for it.
  const legacy = lead.password_hash !== hashPassword(lead.code)
  if (legacy) {
    if (!password) return NextResponse.json({ error: "This older login also needs its password.", needPassword: true }, { status: 401 })
    const given = Buffer.from(hashPassword(password)), want = Buffer.from(lead.password_hash)
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      await logEvent(admin, lead.id, "login_failed")
      return NextResponse.json({ error: "That password is not right.", needPassword: true }, { status: 401 })
    }
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
