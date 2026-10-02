/**
 * POST /api/carrier-quotes/link
 *   { quote_id, freight_request_id, carrier_id? }   (carrier_id = carriers.id)
 *
 * A user links a non-linked quote to a freight request. The request must
 * belong to the same client and must not be closed or completed.
 * The quote is flagged linked_by_ai = false (linked manually).
 */
import { NextResponse, type NextRequest } from "next/server"
import { requireOperator, lockedReason } from "@/lib/carrier-quote-guards"
import { logActivity } from "@/lib/log-activity"
import { syncRequestStatus } from "@/lib/request-status"

export async function POST(req: NextRequest) {
  const guard = await requireOperator(req)
  if (guard instanceof NextResponse) return guard
  const { session, admin } = guard

  const body = await req.json().catch(() => null)
  const quoteId   = Number(body?.quote_id)
  const requestId = body?.freight_request_id as string | undefined
  if (!quoteId || !requestId)
    return NextResponse.json({ error: "quote_id and freight_request_id are required" }, { status: 400 })

  const { data: quote } = await admin
    .from("carrier_quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("client_code", session.clientCode)
    .maybeSingle()
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  if (quote.freight_request_id)
    return NextResponse.json({ error: "This quote is already linked to a request." }, { status: 409 })

  const { data: fr } = await admin
    .from("freight_requests")
    .select("id, status, is_done")
    .eq("id", requestId)
    .eq("client_code", session.clientCode)
    .maybeSingle()
  if (!fr) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  const locked = lockedReason(fr)
  if (locked) return NextResponse.json({ error: locked }, { status: 409 })

  const carrierPk: number | null = body?.carrier_id != null ? Number(body.carrier_id) : (quote.carrier_id ?? null)
  if (!carrierPk) return NextResponse.json({ error: "Choose which carrier sent this quote." }, { status: 400 })

  const { data: carrier } = await admin
    .from("carriers")
    .select("id")
    .eq("id", carrierPk)
    .eq("client_code", session.clientCode)
    .maybeSingle()
  if (!carrier) return NextResponse.json({ error: "Carrier not found" }, { status: 404 })

  // ── Find (or create) the RFQ row this quote will hang off ─────────────────
  // Prefer an RFQ we really sent to this carrier that has no quote yet.
  const { data: rfqRows } = await admin
    .from("carrier_quote_requests")
    .select("id, status, carrier_quotes ( id )")
    .eq("freight_request_id", requestId)
    .eq("carrier_id", carrierPk)
    .order("sent_at", { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const free = (rfqRows ?? []).find((r: any) => (r.carrier_quotes ?? []).length === 0)
  const respondedAt: string = quote.received_at ?? new Date().toISOString()

  let rowId: number
  let createdRow = false
  const previousStatus: string | null = free?.status ?? null

  if (free) {
    rowId = free.id
    const { error } = await admin
      .from("carrier_quote_requests")
      .update({ status: "responded", responded_at: respondedAt })
      .eq("id", rowId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { data: created, error } = await admin
      .from("carrier_quote_requests")
      .insert({
        freight_request_id: requestId,
        carrier_id:         carrierPk,
        email_thread_id:    quote.email_thread_id ?? `manual-quote-${quote.id}`,
        email_message_id:   quote.email_message_id ?? null,
        status:             "responded",
        responded_at:       respondedAt,
      })
      .select("id")
      .single()
    if (error || !created) return NextResponse.json({ error: error?.message ?? "Could not create RFQ row" }, { status: 500 })
    rowId = created.id
    createdRow = true
  }

  // ── Link the quote (the .is() guard stops two people linking it at once) ──
  const { data: updated, error: linkErr } = await admin
    .from("carrier_quotes")
    .update({
      carrier_quote_request_id: rowId,
      freight_request_id:       requestId,
      carrier_id:               carrierPk,
      linked_by_ai:             false,
      link_method:              "manual",
      linked_at:                new Date().toISOString(),
      linked_by:                session.username,
      unlinked_reason:          null,
    })
    .eq("id", quoteId)
    .eq("client_code", session.clientCode)
    .is("freight_request_id", null)
    .select("id")

  if (linkErr || !updated || updated.length === 0) {
    // Undo the RFQ row change so nothing is left half-done.
    if (createdRow) await admin.from("carrier_quote_requests").delete().eq("id", rowId)
    else if (previousStatus) await admin.from("carrier_quote_requests").update({ status: previousStatus }).eq("id", rowId)
    return NextResponse.json(
      { error: linkErr?.message ?? "This quote was just linked by someone else." },
      { status: linkErr ? 500 : 409 },
    )
  }

  await syncRequestStatus(admin, requestId)

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "carrier_quote_linked",
    actor:       session.username,
    description: "Linked a carrier quote to a request manually",
    requestId,
    meta: { quote_id: quoteId, carrier_id: carrierPk },
  })

  return NextResponse.json({ ok: true })
}
