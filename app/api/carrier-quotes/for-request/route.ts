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
      status, sent_at, responded_at,
      carriers ( carrier_name, email ),
      carrier_quotes ( * )
    `)
    .eq("freight_request_id", id)
    .order("sent_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}
