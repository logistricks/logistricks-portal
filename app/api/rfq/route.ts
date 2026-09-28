/**
 * app/api/rfq/route.ts
 *
 * Registers an outgoing RFQ (request-for-quotation) to one or more
 * carriers in carrier_quote_requests, so the send is tracked and
 * QuoteComparisonPanel has something to show. Generates a short
 * `rfq_reference` token per carrier that gets embedded in the RFQ
 * email so a later carrier reply can be correlated back to this row
 * (see /api/carrier-quotes).
 *
 * Two callers, two auth modes:
 *   - The portal UI (manual "Send to Carrier"): portal_session cookie.
 *   - n8n (automated RFQ send, see auto_send_rfq carriers): X-Portal-Secret
 *     header + client_code in the body.
 *
 * POST body:
 *   freight_request_id  string        (required)
 *   carrier_ids           number[]      (required, non-empty)
 *   client_code             string        (required only for the secret-auth path)
 *
 * POST response: { ok: true, items: [{ carrier_id, rfq_reference, row_id }] }
 *
 * PATCH — n8n calls this right after it actually sends the Gmail
 *         message, to attach the real threadId/messageId to the row
 *         it registered via POST.
 * PATCH body: { rfq_reference, email_thread_id, email_message_id? }
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"
import { randomBytes } from "crypto"

function resolveClientCode(req: NextRequest, body: Record<string, unknown>): string | null {
  const cookie = req.cookies.get("portal_session")?.value
  if (cookie) {
    const session = getSession(cookie)
    if (session) return session.clientCode
  }
  const secret    = req.headers.get("x-portal-secret")
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (envSecret && secret === envSecret && typeof body.client_code === "string") {
    return body.client_code
  }
  return null
}

function genReference(freightRequestId: string, carrierId: number): string {
  const short = freightRequestId.replace(/-/g, "").slice(0, 8)
  const rand  = randomBytes(3).toString("hex")
  return `RFQ-${short}-${carrierId}-${rand}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const clientCode = resolveClientCode(req, body)
  if (!clientCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const freightRequestId = body.freight_request_id as string | undefined
  const carrierIds       = body.carrier_ids as number[] | undefined
  if (!freightRequestId) return NextResponse.json({ error: "freight_request_id required" }, { status: 400 })
  if (!Array.isArray(carrierIds) || carrierIds.length === 0)
    return NextResponse.json({ error: "carrier_ids required" }, { status: 400 })

  const admin = adminClient()

  // Resolve carrier_ids (logical, per-client) -> carriers.id (PK, used by carrier_quote_requests FK)
  const { data: carrierRows, error: carrierErr } = await admin
    .from("carriers")
    .select("id, carrier_id, carrier_name, email")
    .eq("client_code", clientCode)
    .in("carrier_id", carrierIds)
    .eq("is_cc", false)

  if (carrierErr) return NextResponse.json({ error: carrierErr.message }, { status: 500 })

  const items: { carrier_id: number; rfq_reference: string; row_id: number }[] = []

  for (const c of carrierRows ?? []) {
    const reference = genReference(freightRequestId, c.carrier_id)
    const { data: row, error } = await admin
      .from("carrier_quote_requests")
      .insert({
        freight_request_id: freightRequestId,
        carrier_id:         c.id,
        email_thread_id:    reference, // placeholder until PATCHed with the real Gmail threadId
        rfq_reference:      reference,
        status:              "sent",
      })
      .select("id")
      .single()

    if (error) continue // skip carriers whose row failed to insert rather than aborting the whole send
    items.push({ carrier_id: c.carrier_id, rfq_reference: reference, row_id: row.id })
  }

  return NextResponse.json({ ok: true, items })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const secret    = req.headers.get("x-portal-secret")
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const reference = body.rfq_reference as string | undefined
  if (!reference) return NextResponse.json({ error: "rfq_reference required" }, { status: 400 })

  const admin = adminClient()
  const patch: Record<string, unknown> = {}
  if (body.email_thread_id)  patch.email_thread_id  = body.email_thread_id
  if (body.email_message_id) patch.email_message_id = body.email_message_id

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { error } = await admin
    .from("carrier_quote_requests")
    .update(patch)
    .eq("rfq_reference", reference)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
