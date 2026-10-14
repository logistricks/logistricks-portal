/**
 * GET  /api/requests/:id/field-confirmation → { state, at, by, via, editedAt, migrated }
 * POST /api/requests/:id/field-confirmation → the person confirms the fields (undo-able)
 *
 * A request's fields count as confirmed when a person confirmed them, or — automatically — when an acknowledgment
 * (or full reply) went to the requester, a carrier RFQ was sent, or a carrier quote came in. Editing a field after that
 * moves it to "changed" until it is confirmed again or another of those things happens.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { logActivity } from "@/lib/log-activity"
import { restoreRows, saveUndo, snapshot } from "@/lib/undo"

export const dynamic = "force-dynamic"

const t = (v: unknown) => { const n = v ? Date.parse(String(v)) : NaN; return isNaN(n) ? 0 : n }
const iso = (n: number) => new Date(n).toISOString()

export type FieldConfirmation = {
  state: "unconfirmed" | "confirmed" | "changed"
  at: string | null
  by: string | null
  via: "manual" | "acknowledgment" | "rfq" | "carrier_quote" | null
  editedAt: string | null
  migrated: boolean
}

export async function loadConfirmation(admin: any, clientCode: string, id: string): Promise<FieldConfirmation | null> {
  const { data: r } = await admin.from("freight_requests").select("*").eq("id", id).ilike("client_code", clientCode).maybeSingle()
  if (!r) return null
  const [rfq, quote] = await Promise.all([
    admin.from("carrier_quote_requests").select("sent_at").eq("freight_request_id", id).order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("carrier_quotes").select("received_at").eq("freight_request_id", id).order("received_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  const signals: { at: number; via: FieldConfirmation["via"]; by: string | null }[] = [
    { at: t(r.fields_confirmed_at), via: "manual", by: r.fields_confirmed_by ?? null },
    // a full reply or acknowledgment went out (a "missing information" email asks for more, so it does not count)
    { at: ["acknowledgement", "complete", "manual"].includes(String(r.reply_sent_type)) ? t(r.replied_at) : 0, via: "acknowledgment", by: null },
    { at: t(rfq.data?.sent_at), via: "rfq", by: null },
    { at: t(quote.data?.received_at), via: "carrier_quote", by: null },
  ]
  const best = signals.reduce((a, b) => (b.at > a.at ? b : a), { at: 0, via: null as FieldConfirmation["via"], by: null as string | null })
  const edited = t(r.fields_edited_at)
  const state = !best.at ? "unconfirmed" : edited > best.at ? "changed" : "confirmed"
  return {
    state, at: best.at ? iso(best.at) : null, by: best.via === "manual" ? best.by : null, via: best.at ? best.via : null,
    editedAt: edited ? iso(edited) : null, migrated: "fields_edited_at" in r,
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const c = await loadConfirmation(adminClient(), session.clientCode, id)
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(c)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const admin = adminClient()
  const before = await snapshot(admin, "freight_requests", { id, client_code: session.clientCode }, "id,client_code,fields_confirmed_at,fields_confirmed_by")
  const { data, error } = await admin.from("freight_requests")
    .update({ fields_confirmed_at: new Date().toISOString(), fields_confirmed_by: session.username })
    .eq("id", id).ilike("client_code", session.clientCode).select("id")
  if (error) {
    const missing = /fields_confirmed/.test(error.message) && /column|schema/i.test(error.message)
    return NextResponse.json({ error: missing ? "Run migration 071 in Supabase first." : error.message }, { status: missing ? 409 : 500 })
  }
  if (!data?.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  void logActivity({ clientCode: session.clientCode, eventType: "request_fields_confirmed", actor: session.username, requestId: id, description: "Request fields confirmed" })
  const undo = await saveUndo(admin, session, "Fields confirmed", restoreRows("freight_requests", before))
  return NextResponse.json(await loadConfirmation(admin, session.clientCode, id), { headers: undo })
}
