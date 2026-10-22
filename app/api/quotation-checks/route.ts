/**
 * GET  /api/quotation-checks?quotation_id=N  → { check|null, stale, usage:{used,cap}, settings }
 * POST /api/quotation-checks { quotation_id, force? } → runs the check (counts toward the monthly cap) and returns the same shape
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { checkAndStore, contentHash, loadCheckSettings, usageThisMonth } from "@/lib/quotation-check"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function shape(admin: any, code: string, quotationId: number) {
  const [set, used, { data: q }, { data: last }] = await Promise.all([
    loadCheckSettings(admin, code), usageThisMonth(admin, code),
    admin.from("quotations").select("generated_subject, generated_body, generated_html, final_price_usd, created_at").eq("id", quotationId).ilike("client_code", code).maybeSingle(),
    admin.from("quotation_checks").select("*").eq("quotation_id", quotationId).ilike("client_code", code).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  return { check: last ?? null, quotation_created_at: q?.created_at ?? null, stale: !!(last && q && last.content_hash !== contentHash(q)), usage: { used, cap: set.monthly_cap }, settings: set }
}

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = Number(new URL(req.url).searchParams.get("quotation_id"))
  if (!id) return NextResponse.json({ error: "quotation_id required" }, { status: 400 })
  return NextResponse.json(await shape(adminClient(), s.session.clientCode, id))
}

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers can't run checks" }, { status: 403 })
  const b = await req.json().catch(() => null)
  const id = Number(b?.quotation_id)
  if (!id) return NextResponse.json({ error: "quotation_id required" }, { status: 400 })
  const admin = adminClient(), code = s.session.clientCode
  const r = await checkAndStore(admin, code, id, "manual", s.session.username, b?.force === true)
  if ("error" in r) {
    const msg = r.error === "off" ? "The quotation check is switched off (Settings → Rules)." : r.error === "cap" ? "This month's check limit has been reached." : "Quotation not found"
    return NextResponse.json({ error: msg, reason: r.error }, { status: r.error === "not_found" ? 404 : 409 })
  }
  return NextResponse.json(await shape(admin, code, id))
}
