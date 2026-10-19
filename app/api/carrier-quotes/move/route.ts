/**
 * POST /api/carrier-quotes/move  { quote_id, leg_index: number | null }
 * Moves a linked carrier quote to another destination option of its request (null = covers all options).
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { logActivity } from "@/lib/log-activity"
import { allLegs, optionMode } from "@/lib/shipment-types"

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Your role cannot change quotes." }, { status: 403 })
  const body = await req.json().catch(() => null)
  const quoteId = Number(body?.quote_id)
  if (!Number.isFinite(quoteId)) return NextResponse.json({ error: "quote_id required" }, { status: 400 })
  const leg = body?.leg_index === null || body?.leg_index === "" || body?.leg_index === undefined ? null : Number(body.leg_index)
  if (leg !== null && (!Number.isInteger(leg) || leg < 0)) return NextResponse.json({ error: "Invalid option" }, { status: 400 })

  const admin = adminClient()
  const { data: q } = await admin.from("carrier_quotes").select("id, freight_request_id").eq("id", quoteId).maybeSingle()
  if (!q) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  const { data: fr } = await admin.from("freight_requests").select("*").eq("id", q.freight_request_id).maybeSingle()
  if (!fr || String(fr.client_code).toLowerCase() !== s.session.clientCode.toLowerCase()) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  if (["Closed", "Rejected"].includes(fr.status)) return NextResponse.json({ error: "Closed requests can't be changed." }, { status: 409 })
  if (!optionMode(fr as Record<string, unknown>)) return NextResponse.json({ error: "This request has no destination options." }, { status: 400 })
  if (leg !== null && leg >= allLegs(fr as Record<string, unknown>).length) return NextResponse.json({ error: "That option does not exist." }, { status: 400 })

  const { error } = await admin.from("carrier_quotes").update({ leg_index: leg }).eq("id", quoteId)
  if (error) return NextResponse.json({ error: /leg_index/.test(error.message) ? "Run migration 078 (carrier_quotes.leg_index) in Supabase first." : error.message }, { status: 500 })

  await logActivity({
    clientCode: s.session.clientCode, eventType: "carrier_quote_linked", actor: s.session.username, requestId: q.freight_request_id,
    description: `Moved a carrier quote on ${fr.request_ref ?? "a request"} to ${leg === null ? "all options" : `Option ${leg + 1}`}`, meta: { quote_id: quoteId, leg_index: leg },
  })
  return NextResponse.json({ ok: true })
}
