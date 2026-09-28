/**
 * app/api/carrier-quotes/route.ts
 *
 * POST — n8n calls this after it parses a carrier's reply email, to
 *        record the quote and mark the matching carrier_quote_requests
 *        row as responded. Auth: X-Portal-Secret header (same pattern
 *        as /api/auto-reply and /api/auto-reply-logs).
 *
 * Body:
 *   client_code       string   (required)
 *   rfq_reference      string   (preferred — the token embedded in the
 *                                original RFQ email; see carrier_quote_requests.rfq_reference)
 *   freight_request_id string   (fallback match key if no rfq_reference)
 *   carrier_id          number  (fallback match key — or resolve via carrier_email)
 *   carrier_email       string  (used to resolve carrier_id when carrier_id is absent)
 *   email_thread_id     string  (optional — Gmail threadId, used as a third fallback)
 *   email_message_id    string  (optional)
 *   rate_usd            number|null
 *   rate_currency        string
 *   rate_original         number|null
 *   transit_days          number|null
 *   validity_date          string|null (YYYY-MM-DD)
 *   free_days               number|null
 *   notes                    string|null
 *   raw_reply                 string|null
 *
 * Responses:
 *   200 { ok: true, carrier_quote_request_id, carrier_quote_id }
 *   400 { error }
 *   401 { error: "Unauthorized" }
 *   404 { error: "no_matching_rfq" }   — nothing to correlate this reply to
 *   500 { error }
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"

export async function POST(req: NextRequest) {
  const secret    = req.headers.get("x-portal-secret")
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const client_code = body.client_code as string | undefined
  if (!client_code) return NextResponse.json({ error: "client_code required" }, { status: 400 })

  const admin = adminClient()

  // ── Resolve carrier_id from carrier_email if not given directly ──────────
  let carrierId = body.carrier_id as number | undefined
  if (!carrierId && body.carrier_email) {
    const { data: carrierRow } = await admin
      .from("carriers")
      .select("carrier_id")
      .eq("client_code", client_code)
      .eq("email", (body.carrier_email as string).trim())
      .eq("is_cc", false)
      .maybeSingle()
    carrierId = carrierRow?.carrier_id
  }

  // ── Find the matching carrier_quote_requests row ──────────────────────────
  let match: { id: number } | null = null

  if (body.rfq_reference) {
    const { data } = await admin
      .from("carrier_quote_requests")
      .select("id")
      .eq("rfq_reference", body.rfq_reference as string)
      .maybeSingle()
    if (data) match = data
  }

  if (!match && body.freight_request_id && carrierId) {
    const { data } = await admin
      .from("carrier_quote_requests")
      .select("id")
      .eq("freight_request_id", body.freight_request_id as string)
      .eq("carrier_id", carrierId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) match = data
  }

  if (!match && body.email_thread_id) {
    const { data } = await admin
      .from("carrier_quote_requests")
      .select("id")
      .eq("email_thread_id", body.email_thread_id as string)
      .maybeSingle()
    if (data) match = data
  }

  if (!match) {
    return NextResponse.json({ error: "no_matching_rfq" }, { status: 404 })
  }

  const updatePatch: Record<string, unknown> = {
    status:       "responded",
    responded_at: new Date().toISOString(),
  }
  if (body.email_message_id) updatePatch.email_message_id = body.email_message_id
  if (body.email_thread_id)  updatePatch.email_thread_id  = body.email_thread_id

  const { error: updateErr } = await admin
    .from("carrier_quote_requests")
    .update(updatePatch)
    .eq("id", match.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const { data: fullRow } = await admin
    .from("carrier_quote_requests")
    .select("freight_request_id, carrier_id")
    .eq("id", match.id)
    .single()

  const { data: quoteRow, error: insertErr } = await admin
    .from("carrier_quotes")
    .insert({
      carrier_quote_request_id: match.id,
      freight_request_id:       fullRow?.freight_request_id,
      carrier_id:                fullRow?.carrier_id,
      rate_usd:                   body.rate_usd ?? null,
      rate_currency:               body.rate_currency ?? "USD",
      rate_original:                body.rate_original ?? null,
      transit_days:                  body.transit_days ?? null,
      validity_date:                  body.validity_date ?? null,
      free_days:                       body.free_days ?? null,
      notes:                            body.notes ?? null,
      raw_reply:                         body.raw_reply ?? null,
    })
    .select("id")
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    carrier_quote_request_id: match.id,
    carrier_quote_id: quoteRow?.id,
  })
}
