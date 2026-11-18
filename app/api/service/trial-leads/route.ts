import { createHash, timingSafeEqual } from "crypto"
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { hashPassword, newAccessCode } from "@/lib/trial-server"

export const runtime = "nodejs"

/**
 * Service endpoint for the Leads app (leads.logistricks.net). Creates a trial lead and reports its status.
 * Auth: Authorization: Bearer TRIAL_SERVICE_KEY (a long random secret shared with the Leads app). Not cookie based.
 */
const digest = (s: string) => createHash("sha256").update(s).digest()
function authorized(req: NextRequest) {
  const key = process.env.TRIAL_SERVICE_KEY
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  return !!key && key.length >= 24 && timingSafeEqual(digest(given), digest(key))
}
const deny = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 })

export async function POST(req: NextRequest) {
  if (!authorized(req)) return deny()
  const b = await req.json().catch(() => ({}))
  const company = String(b.company ?? "").trim().slice(0, 200)
  if (!company) return NextResponse.json({ error: "Company is required." }, { status: 400 })
  const contact = String(b.contact ?? "").trim().slice(0, 200) || null
  const tries = Math.min(Math.max(Math.floor(Number(b.tries)) || 2, 1), 10)
  const days = Math.min(Math.max(Math.floor(Number(b.days)) || 5, 1), 90)
  const reads = Math.min(Math.max(Math.floor(Number(b.reads_per_try)) || 3, 1), 50)
  const genLimit = Number.isFinite(Number(b.gen_limit)) ? Math.min(Math.max(Math.floor(Number(b.gen_limit)), 0), 500) : 12
  const createdBy = `leads:${String(b.created_by ?? "unknown").slice(0, 120)}`
  const admin = adminClient()
  for (let i = 0; i < 5; i++) {
    const code = newAccessCode()
    const row: Record<string, unknown> = { company, contact_name: contact, code, password_hash: hashPassword(code), tries_total: tries, gen_limit: genLimit, reads_per_try: reads, expires_at: new Date(Date.now() + days * 86400000).toISOString(), created_by: createdBy }
    let { data, error } = await admin.from("trial_leads").insert(row).select("id").single()
    if (error && /gen_limit|reads_per_try/.test(error.message)) { delete row.gen_limit; delete row.reads_per_try; ;({ data, error } = await admin.from("trial_leads").insert(row).select("id").single()) }
    if (error?.code === "23505") continue
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not create the trial." }, { status: 500 })
    return NextResponse.json({ id: data.id, code })
  }
  return NextResponse.json({ error: "Could not generate a unique code. Try again." }, { status: 500 })
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return deny()
  const id = req.nextUrl.searchParams.get("id") ?? ""
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })
  const admin = adminClient()
  const [{ data: l }, { data: runs }, { data: ev }] = await Promise.all([
    admin.from("trial_leads").select("*").eq("id", id).maybeSingle(),
    admin.from("trial_runs").select("finished_at").eq("lead_id", id),
    admin.from("trial_events").select("type").eq("lead_id", id).in("type", ["locked_click", "cta_click"]),
  ])
  if (!l) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const finished = (runs ?? []).filter((r: any) => r.finished_at).length
  const status = l.status === "disabled" ? "Disabled" : Date.now() > Date.parse(l.expires_at) ? "Expired" : !l.first_login_at ? "Not opened" : finished >= l.tries_total ? "Finished" : l.tries_used > 0 ? "In progress" : "Active"
  return NextResponse.json({ id: l.id, code: l.code, status, tries_total: l.tries_total, tries_used: l.tries_used, finished_tries: finished, expires_at: l.expires_at, last_active_at: l.last_active_at, hot: finished >= 1 && (ev ?? []).length >= 3 })
}
