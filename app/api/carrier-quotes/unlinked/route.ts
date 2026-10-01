/**
 * GET /api/carrier-quotes/unlinked
 *   Quotes from carrier replies that could not be matched to a freight request,
 *   for the caller's client, plus the client's carriers (for the link dialog).
 *
 * GET /api/carrier-quotes/unlinked?count=1
 *   Just { count } — used for the sidebar badge.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"

export async function GET(req: NextRequest) {
  const cookie  = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = adminClient()

  if (new URL(req.url).searchParams.get("count")) {
    const { count, error } = await admin
      .from("carrier_quotes")
      .select("id", { count: "exact", head: true })
      .eq("client_code", session.clientCode)
      .is("freight_request_id", null)
    if (error) return NextResponse.json({ count: 0 })
    return NextResponse.json({ count: count ?? 0 })
  }

  const [quotesRes, carriersRes] = await Promise.all([
    admin
      .from("carrier_quotes")
      .select(`
        id, carrier_id, from_email, email_subject, email_thread_id,
        rate_usd, rate_currency, rate_original, transit_days, validity_date, free_days,
        notes, raw_reply, unlinked_reason, received_at,
        carriers:carrier_id ( carrier_name, email )
      `)
      .eq("client_code", session.clientCode)
      .is("freight_request_id", null)
      .order("received_at", { ascending: false })
      .limit(500),
    admin
      .from("carriers")
      .select("id, carrier_name, email")
      .eq("client_code", session.clientCode)
      .eq("is_cc", false)
      .eq("active", true)
      .order("carrier_name", { ascending: true }),
  ])

  if (quotesRes.error) return NextResponse.json({ error: quotesRes.error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quotes = (quotesRes.data ?? []).map((q: any) => ({
    id:              q.id,
    carrierId:       q.carrier_id ?? null,
    carrierName:     q.carriers?.carrier_name ?? null,
    fromEmail:       q.from_email ?? q.carriers?.email ?? null,
    subject:         q.email_subject ?? null,
    emailThreadId:   q.email_thread_id ?? null,
    rateUsd:         q.rate_usd,
    rateCurrency:    q.rate_currency,
    rateOriginal:    q.rate_original,
    transitDays:     q.transit_days,
    validityDate:    q.validity_date,
    freeDays:        q.free_days,
    notes:           q.notes,
    rawReply:        q.raw_reply,
    reason:          q.unlinked_reason ?? null,
    receivedAt:      q.received_at,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const carriers = (carriersRes.data ?? []).map((c: any) => ({
    id: c.id as number,
    name: (c.carrier_name as string) || (c.email as string) || `Carrier ${c.id}`,
    email: (c.email as string) ?? "",
  }))

  return NextResponse.json({ quotes, carriers })
}
