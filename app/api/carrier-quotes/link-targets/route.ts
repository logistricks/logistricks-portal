/**
 * GET /api/carrier-quotes/link-targets?carrier_id=<carriers.id>
 *
 * Requests a non-linked quote can be attached to: the caller's client only, and
 * never closed or completed ones. Requests that already have an RFQ out to the
 * given carrier are flagged and listed first.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"

const BASE_COLS =
  "id, sender_name, origin_city, origin_country, destination_city, destination_country, cargo_type, status, received_at"

export async function GET(req: NextRequest) {
  const cookie  = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const carrierParam = new URL(req.url).searchParams.get("carrier_id")
  const carrierPk    = carrierParam ? Number(carrierParam) : null

  const admin = adminClient()

  const fetchRows = (cols: string) =>
    admin
      .from("freight_requests")
      .select(cols)
      .eq("client_code", session.clientCode)
      .eq("is_done", false)
      .neq("status", "Closed")
      .order("received_at", { ascending: false })
      .limit(200)

  // request_ref exists once migration 038 has run; fall back to the short id until then.
  let res = await fetchRows(`${BASE_COLS}, request_ref`)
  if (res.error) res = await fetchRows(BASE_COLS)
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = res.data ?? []

  const rfqSent = new Set<string>()
  if (carrierPk && rows.length > 0) {
    const { data: rfqRows } = await admin
      .from("carrier_quote_requests")
      .select("freight_request_id")
      .eq("carrier_id", carrierPk)
      .in("freight_request_id", rows.map((r) => r.id))
    for (const r of rfqRows ?? []) rfqSent.add(r.freight_request_id as string)
  }

  const targets = rows
    .map((r) => ({
      id:           r.id as string,
      ref:          (r.request_ref as string | undefined) ?? `LT-${String(r.id).slice(0, 8).toUpperCase()}`,
      senderName:   r.sender_name ?? "Unknown",
      origin:       [r.origin_city, r.origin_country].filter(Boolean).join(", "),
      destination:  [r.destination_city, r.destination_country].filter(Boolean).join(", "),
      cargoType:    r.cargo_type ?? "",
      status:       r.status as string,
      receivedAt:   r.received_at as string,
      rfqSentToCarrier: rfqSent.has(r.id as string),
    }))
    .sort((a, b) => Number(b.rfqSentToCarrier) - Number(a.rfqSentToCarrier))

  return NextResponse.json({ targets })
}
