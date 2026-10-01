/**
 * POST /api/carrier-quotes/unlink   { quote_id }
 *
 * Detaches a linked quote from its request; it goes back to the Non-linked
 * Quotes page. Blocked when the request is closed/completed, or when a
 * quotation built from this quote has already been sent to the requester.
 */
import { NextResponse, type NextRequest } from "next/server"
import { requireOperator, lockedReason, sentQuotationBlock, releaseRfqRow } from "@/lib/carrier-quote-guards"
import { logActivity } from "@/lib/log-activity"

export async function POST(req: NextRequest) {
  const guard = await requireOperator(req)
  if (guard instanceof NextResponse) return guard
  const { session, admin } = guard

  const body = await req.json().catch(() => null)
  const quoteId = Number(body?.quote_id)
  if (!quoteId) return NextResponse.json({ error: "quote_id required" }, { status: 400 })

  const { data: quote } = await admin
    .from("carrier_quotes")
    .select("id, freight_request_id, carrier_quote_request_id")
    .eq("id", quoteId)
    .eq("client_code", session.clientCode)
    .maybeSingle()
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  if (!quote.freight_request_id)
    return NextResponse.json({ error: "This quote is not linked to a request." }, { status: 409 })

  const { data: fr } = await admin
    .from("freight_requests")
    .select("status, is_done")
    .eq("id", quote.freight_request_id)
    .maybeSingle()
  const locked = fr ? lockedReason(fr) : null
  if (locked) return NextResponse.json({ error: locked }, { status: 409 })

  const sentBlock = await sentQuotationBlock(admin, quoteId)
  if (sentBlock) return NextResponse.json({ error: sentBlock }, { status: 409 })

  // Detach the quote FIRST — deleting the RFQ row while it is still attached would cascade-delete the quote.
  const { error } = await admin
    .from("carrier_quotes")
    .update({
      carrier_quote_request_id: null,
      freight_request_id:       null,
      linked_by_ai:             null,
      link_method:              null,
      linked_at:                null,
      linked_by:                null,
      unlinked_reason:          "unlinked_manually",
    })
    .eq("id", quoteId)
    .eq("client_code", session.clientCode)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await releaseRfqRow(admin, quote.carrier_quote_request_id)

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "carrier_quote_unlinked",
    actor:       session.username,
    description: "Unlinked a carrier quote from a request",
    requestId:   quote.freight_request_id,
    meta: { quote_id: quoteId },
  })

  return NextResponse.json({ ok: true })
}
