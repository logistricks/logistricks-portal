/**
 * POST /api/carrier-quotes/disregard  { quote_id, disregard: boolean }
 * Greys out a carrier quote (it can no longer be used to build a quotation or be forwarded to the requester)
 * or reactivates it. The request's status follows: no active quote left → "Sent to Carrier", otherwise "Quoted".
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { logActivity } from "@/lib/log-activity"
import { syncRequestStatus } from "@/lib/request-status"

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Your role cannot change quotes." }, { status: 403 })
  const body = await req.json().catch(() => null)
  const quoteId = Number(body?.quote_id)
  if (!Number.isFinite(quoteId)) return NextResponse.json({ error: "quote_id required" }, { status: 400 })
  const disregard = body?.disregard !== false

  const admin = adminClient()
  const { data: q } = await admin.from("carrier_quotes").select("id, freight_request_id, carrier_id").eq("id", quoteId).maybeSingle()
  if (!q) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  const { data: fr } = await admin.from("freight_requests").select("client_code, request_ref, status").eq("id", q.freight_request_id).maybeSingle()
  if (!fr || String(fr.client_code).toLowerCase() !== s.session.clientCode.toLowerCase()) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  if (["Closed", "Rejected"].includes(fr.status)) return NextResponse.json({ error: "Closed requests can't be changed." }, { status: 409 })

  const { error } = await admin.from("carrier_quotes").update({
    disregarded: disregard, disregarded_at: disregard ? new Date().toISOString() : null, disregarded_by: disregard ? s.session.username : null,
  }).eq("id", quoteId)
  if (error) {
    const missing = error.code === "42703" || error.code === "PGRST204" || /disregard/i.test(error.message)
    return NextResponse.json({ error: missing ? "Run migration 059 (disregard columns) in Supabase first." : error.message }, { status: missing ? 409 : 500 })
  }

  const status = await syncRequestStatus(admin, q.freight_request_id)
  await logActivity({
    clientCode: s.session.clientCode, eventType: disregard ? "carrier_quote_disregarded" : "carrier_quote_reactivated", actor: s.session.username, requestId: q.freight_request_id,
    description: `${disregard ? "Disregarded" : "Reactivated"} a carrier quote on ${fr.request_ref ?? "a request"}`, meta: { quote_id: quoteId },
  })
  return NextResponse.json({ ok: true, status })
}
