/**
 * Saved markup per carrier quote (so it is still there when the request is reopened).
 *
 * GET   /api/carrier-quotes/markup?freight_request_id=<uuid>
 *         → { markups: { [carrier_quote_id]: { markup_type, markup_amount, show_markup_percent } } }
 * PATCH /api/carrier-quotes/markup  { carrier_quote_id, markup_type, markup_amount, show_markup_percent, charges_style?, price_lines? }
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

  const admin = adminClient()
  // Migration 045 adds charges_style / price_lines; fall back to the 043 columns if it has not been run.
  let res: { data: any[] | null; error: any } = await admin
    .from("carrier_quotes")
    .select("id, markup_type, markup_amount, show_markup_percent, charges_style, price_lines")
    .eq("freight_request_id", id)
    .ilike("client_code", session.clientCode)
  if (res.error && missingColumn(res.error)) {
    res = await admin
      .from("carrier_quotes")
      .select("id, markup_type, markup_amount, show_markup_percent")
      .eq("freight_request_id", id)
      .ilike("client_code", session.clientCode)
  }
  const { data, error } = res
  if (error) return NextResponse.json({ markups: {}, migrated: !missingColumn(error) })

  const markups: Record<string, unknown> = {}
  for (const r of data ?? []) {
    const lines = Array.isArray(r.price_lines) && r.price_lines.length ? r.price_lines : null
    if (r.markup_amount != null || lines || r.charges_style) markups[String(r.id)] = {
      markup_type: r.markup_type === "percent" ? "percent" : "flat",
      markup_amount: Number(r.markup_amount ?? 0),
      show_markup_percent: !!r.show_markup_percent,
      charges_style: r.charges_style === "marked_up" || r.charges_style === "detailed" || r.charges_style === "total_only" ? r.charges_style : null,
      price_lines: lines,
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
  const style = body.charges_style === "marked_up" || body.charges_style === "detailed" || body.charges_style === "total_only" ? body.charges_style : null
  const lines = Array.isArray(body.price_lines) && body.price_lines.length
    ? (body.price_lines as Record<string, unknown>[]).slice(0, 60).map((l) => {
        const a = Math.round((Number(l.amount) || 0) * 100) / 100
        const qty = Number(l.qty) > 0 ? Number(l.qty) : null
        return { label: String(l.label ?? "").slice(0, 200), basis: String(l.basis ?? "").slice(0, 60), qty, rate: qty ? Math.round((a / qty) * 100) / 100 : null, amount: a }
      })
    : null
  const base = {
    markup_type: body.markup_type === "percent" ? "percent" : "flat",
    markup_amount: Number.isFinite(amount) ? amount : 0,
    show_markup_percent: body.show_markup_percent === true,
  }
  const admin = adminClient()
  let { error, count } = await admin
    .from("carrier_quotes")
    .update({ ...base, charges_style: style, price_lines: lines }, { count: "exact" })
    .eq("id", qid)
    .ilike("client_code", session.clientCode)
  let extrasSaved = true
  if (missingColumn(error)) {
    // Migration 045 not run yet: the markup still saves, the prices / style do not.
    extrasSaved = false
    ;({ error, count } = await admin.from("carrier_quotes").update(base, { count: "exact" }).eq("id", qid).ilike("client_code", session.clientCode))
  }
  if (missingColumn(error)) return NextResponse.json({ ok: false, saved: false, reason: "migration_043_missing" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  return NextResponse.json({ ok: true, saved: true, extras_saved: extrasSaved })
}
