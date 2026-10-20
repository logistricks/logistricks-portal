/**
 * app/api/requests/[id]/suggested-carriers/route.ts
 *
 * Compares a request (modes + origin/destination country) with the carrier setup (modes + countries covered)
 * and returns the carriers ranked best-first.
 *
 *   GET /api/requests/{id}/suggested-carriers
 *       auth: portal session cookie, OR X-Portal-Secret + ?client_code=XXX (for the automated RFQ send)
 *
 * Add ?drafts=1 to also get the ready-to-send RFQ email per auto-send carrier, rendered from the default Quote Request
 * template for the request's mode (so the automated workflow only has to send them).
 *
 * Response: { origin, destination, carriers: [{ carrier_id, carrier_name, email, fit, suggested, auto_send, reason }],
 *             suggested_ids: number[], auto_send_ids: number[] }
 *   suggested_ids  – carriers covering the origin and/or destination
 *   auto_send_ids  – the ones the automated send should use: "Include in Auto-Send RFQ" is on AND the carrier covers the
 *                    origin or destination country (a carrier with no countries set is never sent automatically; the
 *                    request having no recognisable country is the only case where the mode alone decides)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { rankCarriers } from "@/lib/carrier-match"
import { toCountryCode } from "@/lib/countries"
import { defaultTemplateFor } from "@/lib/template-defaults"
import { loadCarrierContacts, renderRfqDraft } from "@/lib/rfq-send"
import { extraLegs, isAltLeg } from "@/lib/shipment-types"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let clientCode: string | null = null
  const cookie = req.cookies.get("portal_session")?.value
  if (cookie) clientCode = getSession(cookie)?.clientCode ?? null
  if (!clientCode) {
    const secret = process.env.PORTAL_WEBHOOK_SECRET
    if (secret && req.headers.get("x-portal-secret") === secret) clientCode = req.nextUrl.searchParams.get("client_code")
  }
  if (!clientCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const admin = adminClient()
  const { data: fr } = await admin.from("freight_requests").select("*").eq("id", id).ilike("client_code", clientCode).maybeSingle()
  if (!fr) return NextResponse.json({ error: "Request not found" }, { status: 404 })

  const { data } = await admin.from("carriers").select("carrier_id, carrier_name, email, is_sea, is_air, is_land, countries, active, auto_send_rfq").ilike("client_code", clientCode).eq("is_cc", false)
  const modes = [fr.is_sea ? "Sea" : "", fr.is_air ? "Air" : "", fr.is_land ? "Land" : ""].filter(Boolean)
  const withEmail = ((data ?? []) as any[]).filter((c) => c.email)
  // alternative destinations: a carrier fits when it covers ANY of the destinations (the email asks it to quote each one it can)
  const destCountries: string[] = [fr.destination_country, ...extraLegs(fr).filter(isAltLeg).map((l) => (l as Record<string, unknown>).destination_country as string)].filter((x) => typeof x === "string" && x.trim())
  let ranked = rankCarriers(withEmail, { modes, originCountry: fr.origin_country, destinationCountry: fr.destination_country })
  if (destCountries.length > 1) {
    const lists = destCountries.map((d) => rankCarriers(withEmail, { modes, originCountry: fr.origin_country, destinationCountry: d }))
    const best = new Map<number, (typeof ranked)[number]>()
    for (const list of lists) for (const e of list) { const cur = best.get(e.carrier.carrier_id); if (!cur || (e.match.suggested && !cur.match.suggested)) best.set(e.carrier.carrier_id, e) }
    ranked = ranked.map((e) => best.get(e.carrier.carrier_id) ?? e).sort((a, b) => Number(b.match.suggested) - Number(a.match.suggested))
  }

  const carriers = ranked.map(({ carrier: c, match }) => ({
    carrier_id: c.carrier_id, carrier_name: c.carrier_name, email: c.email, fit: match.fit, suggested: match.suggested, reason: match.reason,
    auto_send: !!c.auto_send_rfq && (match.suggested || match.fit === "unknown"),
  }))
  const autoIds = carriers.filter((c) => c.auto_send).map((c) => c.carrier_id)

  // default Quote Request template for this request's mode
  const { data: tpls } = await admin.from("templates").select("*").ilike("client_code", clientCode).eq("type", "Email").order("template_id", { ascending: true })
  const usable = ((tpls ?? []) as any[]).filter((t) => t.active !== false && !t.is_reply_template && !t.is_missing_reply_template && !t.is_complete_reply_template)
  const tpl = defaultTemplateFor(usable, modes) ?? null

  let drafts: unknown[] | undefined
  if (req.nextUrl.searchParams.get("drafts") === "1" && tpl && autoIds.length) {
    const contacts = await loadCarrierContacts(admin, clientCode, autoIds)
    drafts = contacts.filter((c) => c.email).map((c) => ({ carrier_id: c.carrier_id, carrier_name: c.carrier_name, to: c.email, cc: c.cc, ...renderRfqDraft(tpl, fr, c) }))
  }

  return NextResponse.json({
    template_id: tpl?.template_id ?? null, template_name: tpl?.template_name ?? null,
    ...(drafts ? { drafts } : {}),
    origin: toCountryCode(fr.origin_country), destination: toCountryCode(fr.destination_country), carriers,
    suggested_ids: carriers.filter((c) => c.suggested).map((c) => c.carrier_id),
    auto_send_ids: autoIds,
  })
}
