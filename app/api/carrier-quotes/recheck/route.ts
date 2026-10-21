/**
 * POST /api/carrier-quotes/recheck { id }  (operators and admins)
 * Runs today's quote checks (Settings → Rules) again on a quote that is already saved, and stores the result.
 * The reading problems the AI reported when the reply came in (low confidence, inferred values) are kept as they were.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { loadQuoteRules } from "@/lib/carrier-ask"
import { buildExtendedFields } from "@/lib/quote-extended"
import type { Flag } from "@/lib/quote-math"

export const dynamic = "force-dynamic"
const KEEP = new Set(["low_confidence", "inferred_values"])

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers can't re-check quotes." }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const admin = adminClient(), cc = s.session.clientCode

  const { data: q } = await admin.from("carrier_quotes").select("*").eq("id", b.id).ilike("client_code", cc).maybeSingle()
  if (!q) return NextResponse.json({ error: "Quote not found" }, { status: 404 })

  let ctx: any
  if (q.freight_request_id) {
    const { data: fr } = await admin.from("freight_requests").select("*").eq("id", q.freight_request_id).ilike("client_code", cc).maybeSingle()
    if (fr) ctx = { incoterm: fr.incoterm ?? null, pickup_address: fr.pickup_address ?? null, cargo_ready_date: fr.cargo_ready_date ?? null,
      equipment: fr.equipment ?? null, is_sea: fr.is_sea ?? null, is_air: fr.is_air ?? null, is_land: fr.is_land ?? null }
  }
  const rules = await loadQuoteRules(admin, cc)
  const ignored = new Set(Object.entries(rules.actions).filter(([, a]) => a === "ignore").map(([c]) => c))

  const { flags: fresh } = buildExtendedFields({ ...q, validity_date: q.validity_date ?? null }, ctx, ignored)
  const old: Flag[] = Array.isArray(q.validation_flags) ? q.validation_flags : []
  const flags = [...fresh.filter((f) => !KEEP.has(f.code)), ...old.filter((f) => KEEP.has(f.code) && !ignored.has(f.code))]

  const rt = String(q.response_type ?? "quote")
  const review = q.review_status === "human_verified" ? "human_verified"
    : flags.length === 0 && (rt === "quote" || rt === "update") && q.quote_status === "firm" ? "auto_accepted" : "needs_review"
  const { error } = await admin.from("carrier_quotes").update({ validation_flags: flags, review_status: review }).eq("id", q.id).ilike("client_code", cc)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, flags, review_status: review })
}
