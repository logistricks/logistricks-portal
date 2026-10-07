/**
 * GET /api/carrier-quotes/for-request?freight_request_id=<uuid>
 *   RFQ rows (with carrier and received quote) for one freight request of the caller's client.
 *   Read with the service role because the portal uses its own session cookie, not Supabase Auth,
 *   so the browser Supabase client is blocked by row-level security.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"

export async function GET(req: NextRequest) {
  const cookie  = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = new URL(req.url).searchParams.get("freight_request_id")
  if (!id) return NextResponse.json({ error: "freight_request_id required" }, { status: 400 })

  const admin = adminClient()

  const { data: fr } = await admin
    .from("freight_requests")
    .select("client_code")
    .eq("id", id)
    .maybeSingle()
  if (!fr || String(fr.client_code).toLowerCase() !== String(session.clientCode).toLowerCase())
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data, error } = await admin
    .from("carrier_quote_requests")
    .select(`
      id, freight_request_id, carrier_id, email_thread_id, email_message_id,
      status, sent_at, responded_at, rfq_reference,
      carriers ( carrier_name, email ),
      carrier_quotes ( * )
    `)
    .eq("freight_request_id", id)
    .order("sent_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // sent_at = the moment the email actually left our mail server (outbound log), so response times are exact.
  const rows: any[] = (data ?? []) as any[]
  try {
    const { data: outs } = await admin
      .from("outbound_emails").select("rfq_reference, to_emails, sent_at")
      .eq("freight_request_id", id).eq("purpose", "rfq").eq("status", "sent").not("sent_at", "is", null)
    for (const r of rows) {
      const mail = String(r.carriers?.email ?? "").toLowerCase()
      const hit = (outs ?? [])
        .filter((o: any) => (o.rfq_reference && o.rfq_reference === r.rfq_reference) || (mail && (o.to_emails ?? []).map((x: string) => x.toLowerCase()).includes(mail)))
        .sort((a: any, b: any) => Math.abs(Date.parse(a.sent_at) - Date.parse(r.sent_at)) - Math.abs(Date.parse(b.sent_at) - Date.parse(r.sent_at)))[0]
      if (hit && Math.abs(Date.parse(hit.sent_at) - Date.parse(r.sent_at)) < 30 * 60_000) r.sent_at = hit.sent_at
    }
  } catch { /* keep the recorded times */ }
  return NextResponse.json({ rows })
}
