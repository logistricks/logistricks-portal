/**
 * Saved markup per carrier quote (so it is still there when the request is reopened).
 *
 * GET   /api/carrier-quotes/markup?freight_request_id=<uuid>
 *         → { markups: { [carrier_quote_id]: { markup_type, markup_amount, show_markup_percent } } }
 * PATCH /api/carrier-quotes/markup  { carrier_quote_id, markup_type, markup_amount, show_markup_percent }
 *         → { ok: true }   (ok:false, saved:false if migration 043 has not been run)
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"

const missingColumn = (e: any) => !!e && (e.code === "42703" || e.code === "PGRST204")

function auth(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  return cookie ? getSession(cookie) : null
}

export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = new URL(req.url).searchParams.get("freight_request_id")
  if (!id) return NextResponse.json({ error: "freight_request_id required" }, { status: 400 })

  const { data, error } = await adminClient()
    .from("carrier_quotes")
    .select("id, markup_type, markup_amount, show_markup_percent")
    .eq("freight_request_id", id)
    .ilike("client_code", session.clientCode)
  if (error) return NextResponse.json({ markups: {}, migrated: !missingColumn(error) })

  const markups: Record<string, unknown> = {}
  for (const r of data ?? []) {
    if (r.markup_amount != null) markups[String(r.id)] = {
      markup_type: r.markup_type === "percent" ? "percent" : "flat",
      markup_amount: Number(r.markup_amount),
      show_markup_percent: !!r.show_markup_percent,
    }
  }
  return NextResponse.json({ markups, migrated: true })
}

export async function PATCH(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null)
  const qid = Number(body?.carrier_quote_id)
  if (!qid) return NextResponse.json({ error: "carrier_quote_id required" }, { status: 400 })

  const amount = Number(body.markup_amount)
  const { error, count } = await adminClient()
    .from("carrier_quotes")
    .update({
      markup_type: body.markup_type === "percent" ? "percent" : "flat",
      markup_amount: Number.isFinite(amount) ? amount : 0,
      show_markup_percent: body.show_markup_percent === true,
    }, { count: "exact" })
    .eq("id", qid)
    .ilike("client_code", session.clientCode)
  if (missingColumn(error)) return NextResponse.json({ ok: false, saved: false, reason: "migration_043_missing" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  return NextResponse.json({ ok: true, saved: true })
}
