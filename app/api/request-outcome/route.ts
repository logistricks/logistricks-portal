/**
 * GET  /api/request-outcome?freight_request_id=…  → the saved outcome + the carrier quotes (with their quotations) to choose from
 * POST /api/request-outcome                       → save the outcome / booking / payment marks
 *
 * The won price is read from the quotation that was built for the chosen carrier quote:
 *   cost = the carrier's price, sell = the quotation's final price (after markup), margin = sell - cost.
 * A snapshot is stored, so later edits to quotations never change a closed deal.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { carrierBase } from "@/lib/quotation-render"
import { logActivity } from "@/lib/log-activity"

export const runtime = "nodejs"

const OUTCOMES = ["won", "lost", "expired", "cancelled"]
const REASONS = ["price", "transit_time", "service", "no_response", "cargo_cancelled", "other"]
const r2 = (n: number) => Math.round(n * 100) / 100
const txt = (v: unknown, max: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null }
const isoOrNull = (v: unknown) => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isNaN(t) ? null : new Date(t).toISOString() }

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = new URL(req.url).searchParams.get("freight_request_id")
  if (!id) return NextResponse.json({ error: "freight_request_id required" }, { status: 400 })
  const admin = adminClient()

  const { data: fr } = await admin.from("freight_requests").select("*").eq("id", id).ilike("client_code", s.session.clientCode).maybeSingle()
  if (!fr) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [qs, qts, rfqs] = await Promise.all([
    admin.from("carrier_quotes").select("*").eq("freight_request_id", id).order("received_at", { ascending: true }),
    admin.from("quotations").select("id, carrier_quote_id, quotation_number, base_rate_usd, final_price_usd, markup_type, markup_amount, status, sent_at, created_at").eq("freight_request_id", id).order("created_at", { ascending: false }),
    admin.from("carrier_quote_requests").select("id, carrier_id, carriers ( carrier_name )").eq("freight_request_id", id),
  ])
  const nameOf = (q: any) => (rfqs.data ?? []).find((r: any) => String(r.id) === String(q.carrier_quote_request_id) || r.carrier_id === q.carrier_id)?.carriers?.carrier_name ?? q.from_email ?? "Carrier"
  const options = (qs.data ?? [])
    .filter((q: any) => !q.response_type || ["quote", "update", "counter_offer", "counter"].includes(q.response_type))
    .map((q: any) => ({
      carrier_quote_id: q.id,
      carrier_name: nameOf(q),
      cost_usd: carrierBase(q) || null,
      currency: q.rate_currency ?? "USD",
      received_at: q.received_at,
      quotations: (qts.data ?? []).filter((x: any) => x.carrier_quote_id === q.id),
    }))

  const keys = ["outcome", "outcome_at", "outcome_by", "outcome_reason", "outcome_note", "won_carrier_quote_id", "won_quotation_id", "won_carrier_name",
    "won_cost_usd", "won_sell_usd", "won_margin_usd", "booking_reference", "booking_description", "booked_at", "invoiced_at", "paid_at"]
  const saved: Record<string, unknown> = {}
  for (const k of keys) saved[k] = (fr as any)[k] ?? null
  return NextResponse.json({ saved, options, can_edit: s.role !== "viewer" })
}

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers cannot change the outcome." }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b?.freight_request_id) return NextResponse.json({ error: "freight_request_id required" }, { status: 400 })
  const admin = adminClient()

  const { data: fr } = await admin.from("freight_requests").select("id, client_code, request_ref, outcome").eq("id", b.freight_request_id).ilike("client_code", s.session.clientCode).maybeSingle()
  if (!fr) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const outcome = b.outcome === null || b.outcome === "" ? null : String(b.outcome)
  if (outcome !== null && !OUTCOMES.includes(outcome)) return NextResponse.json({ error: "Invalid outcome" }, { status: 400 })

  const patch: Record<string, unknown> = {
    outcome,
    outcome_by: outcome ? s.session.username : null,
    outcome_at: outcome ? (fr.outcome === outcome ? undefined : new Date().toISOString()) : null,
    outcome_note: txt(b.outcome_note, 1000),
    outcome_reason: outcome === "lost" && REASONS.includes(String(b.outcome_reason)) ? String(b.outcome_reason) : null,
    won_carrier_quote_id: null, won_quotation_id: null, won_carrier_name: null, won_cost_usd: null, won_sell_usd: null, won_margin_usd: null,
    booking_reference: null, booking_description: null, booked_at: null, invoiced_at: null, paid_at: null,
  }
  if (patch.outcome_at === undefined) delete patch.outcome_at

  if (outcome === "won") {
    const cqId = Number(b.won_carrier_quote_id) || null
    if (cqId) {
      const { data: q } = await admin.from("carrier_quotes").select("*").eq("id", cqId).eq("freight_request_id", fr.id).maybeSingle()
      if (!q) return NextResponse.json({ error: "That carrier quote does not belong to this request." }, { status: 400 })
      const { data: rfq } = await admin.from("carrier_quote_requests").select("carriers ( carrier_name )").eq("freight_request_id", fr.id).or(`id.eq.${q.carrier_quote_request_id ?? 0},carrier_id.eq.${q.carrier_id ?? 0}`).limit(1).maybeSingle()
      const cost = carrierBase(q as Record<string, any>) || null
      let sell: number | null = null
      let qtId: number | null = null
      const qtWanted = Number(b.won_quotation_id) || null
      if (qtWanted) {
        const { data: qt } = await admin.from("quotations").select("id, final_price_usd, base_rate_usd, carrier_quote_id").eq("id", qtWanted).eq("freight_request_id", fr.id).maybeSingle()
        if (qt && qt.carrier_quote_id === cqId) { qtId = qt.id; sell = qt.final_price_usd != null ? Number(qt.final_price_usd) : null }
      }
      // The agreed price may differ from the quotation (the requester negotiated): a typed price wins.
      const typed = b.won_sell_usd === null || b.won_sell_usd === "" || b.won_sell_usd === undefined ? null : Number(b.won_sell_usd)
      if (typed != null && Number.isFinite(typed) && typed >= 0) sell = r2(typed)
      patch.won_carrier_quote_id = cqId
      patch.won_quotation_id = qtId
      patch.won_carrier_name = (rfq as any)?.carriers?.carrier_name ?? txt(b.won_carrier_name, 200)
      patch.won_cost_usd = cost
      patch.won_sell_usd = sell
      patch.won_margin_usd = sell != null && cost != null ? r2(sell - cost) : null
    }
    if (b.booked === true) {
      patch.booking_reference = txt(b.booking_reference, 120)
      patch.booking_description = txt(b.booking_description, 1000)
      patch.booked_at = isoOrNull(b.booked_at) ?? new Date().toISOString()
    }
    if (b.invoiced === true) patch.invoiced_at = isoOrNull(b.invoiced_at) ?? new Date().toISOString()
    if (b.paid === true) { patch.paid_at = isoOrNull(b.paid_at) ?? new Date().toISOString(); patch.invoiced_at = patch.invoiced_at ?? patch.paid_at }
  }

  const { error } = await admin.from("freight_requests").update(patch).eq("id", fr.id)
  if (error) {
    const missing = /outcome|won_|booking_|invoiced_at|paid_at/.test(error.message) && /column|schema/i.test(error.message)
    return NextResponse.json({ error: missing ? "Run migration 057 in Supabase first." : error.message }, { status: missing ? 409 : 500 })
  }
  await logActivity({
    clientCode: s.session.clientCode, eventType: "request_outcome", actor: s.session.username, requestId: fr.id,
    description: `${fr.request_ref ?? "Request"}: ${outcome ?? "outcome cleared"}${patch.booking_reference ? ` · booking ${patch.booking_reference}` : ""}`,
    meta: { outcome, sell: patch.won_sell_usd ?? null, margin: patch.won_margin_usd ?? null },
  })
  return NextResponse.json({ ok: true, saved: patch })
}
