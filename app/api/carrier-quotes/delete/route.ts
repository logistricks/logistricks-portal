/**
 * POST /api/carrier-quotes/delete   { quote_id }
 *
 * Permanently deletes a carrier quote — linked or not.
 * A linked quote can't be deleted once its request is closed/completed, or once
 * a quotation built from it has been sent to the requester.
 * A non-linked quote belongs to no request, so it can always be deleted.
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

  if (quote.freight_request_id) {
    const { data: fr } = await admin
      .from("freight_requests")
      .select("status, is_done")
      .eq("id", quote.freight_request_id)
      .maybeSingle()
    const locked = fr ? lockedReason(fr) : null
    if (locked) return NextResponse.json({ error: locked }, { status: 409 })

    const sentBlock = await sentQuotationBlock(admin, quoteId)
    if (sentBlock) return NextResponse.json({ error: sentBlock }, { status: 409 })
  }

  const { error } = await admin
    .from("carrier_quotes")
    .delete()
    .eq("id", quoteId)
    .eq("client_code", session.clientCode)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await releaseRfqRow(admin, quote.carrier_quote_request_id)

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "carrier_quote_deleted",
    actor:       session.username,
    description: quote.freight_request_id ? "Deleted a carrier quote from a request" : "Deleted a non-linked carrier quote",
    requestId:   quote.freight_request_id ?? undefined,
    meta: { quote_id: quoteId },
  })

  return NextResponse.json({ ok: true })
}
