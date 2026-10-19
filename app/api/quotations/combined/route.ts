/**
 * POST /api/quotations/combined
 *   { freight_request_id, quotation_template_id?, preview?: boolean,
 *     parts: [{ carrier_quote_id, markup_type, markup_amount }] }   one entry per destination option
 * Builds ONE quotation for a request with destination options: shared shipment details, then each option with its own
 * charges, total and terms. Each part is priced from its carrier quote plus its own markup.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"
import { mapDbToRequest, type DbFreightRequest } from "@/lib/supabase-queries"
import { buildContext, carrierBaseDetail, renderCombined } from "@/lib/quotation-render"
import { normalizeOptions } from "@/lib/quotation-variables"
import { optionDestinations, optionMode, rowForLeg } from "@/lib/shipment-types"
import { cleanFx } from "@/lib/fx"
import { logActivity } from "@/lib/log-activity"

export const runtime = "nodejs"
const r2 = (n: number) => Math.round(n * 100) / 100

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null)
  const freightRequestId = body?.freight_request_id as string | undefined
  const partsIn = Array.isArray(body?.parts) ? (body.parts as Record<string, unknown>[]).slice(0, 12) : []
  if (!freightRequestId || partsIn.length < 2) return NextResponse.json({ error: "Choose a carrier quote for at least two options." }, { status: 400 })

  const admin = adminClient()
  const { data: reqRow } = await admin.from("freight_requests").select("*").eq("id", freightRequestId).eq("client_code", session.clientCode).single()
  if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  if (!optionMode(reqRow as Record<string, unknown>)) return NextResponse.json({ error: "This request has no destination options." }, { status: 400 })
  const dests = optionDestinations(reqRow as Record<string, any>)

  let templateId = body.quotation_template_id as number | undefined
  const { data: tpls } = await admin.from("quotation_templates").select("*").eq("client_code", session.clientCode).eq("active", true)
  const list = (tpls ?? []) as { template_id: number; is_default: boolean }[]
  if (!templateId) templateId = list.find((t) => t.is_default)?.template_id ?? list[0]?.template_id
  const template = (tpls ?? []).find((t: any) => t.template_id === templateId) as Record<string, any> | undefined
  if (!template) return NextResponse.json({ error: "No quotation template selected and no default template is set" }, { status: 400 })
  const options = normalizeOptions(template.options)

  const [{ data: company }, { data: userRow }, { count: existing }] = await Promise.all([
    admin.from("clients").select("company_name, contact_email, contact_phone").eq("client_code", session.clientCode).maybeSingle(),
    admin.from("portal_users").select("display_name").eq("client_code", session.clientCode).eq("username", session.username).maybeSingle(),
    admin.from("quotations").select("id", { count: "exact", head: true }).eq("freight_request_id", freightRequestId),
  ])
  const base = mapDbToRequest(reqRow as DbFreightRequest)
  const quotationNumber = `QT-${base.requestRef}-${String((existing ?? 0) + 1).padStart(2, "0")}`
  const fx = cleanFx(body.fx_rates)

  const parts = []
  const ids: number[] = []
  let total = 0, baseTotal = 0
  let currency = "USD"
  let validUntil = ""
  for (const p of partsIn) {
    const quoteId = Number(p.carrier_quote_id)
    const { data: quoteRow } = await admin.from("carrier_quotes").select("*, carriers:carrier_id ( carrier_name )").eq("id", quoteId).eq("freight_request_id", freightRequestId).single()
    if (!quoteRow) return NextResponse.json({ error: "Carrier quote not found" }, { status: 404 })
    if ((quoteRow as any).disregarded === true) return NextResponse.json({ error: "A chosen carrier quote was disregarded. Reactivate it first." }, { status: 400 })
    const info = carrierBaseDetail(quoteRow as Record<string, any>, fx)
    if (info.missingRate.length) return NextResponse.json({ error: `No exchange rate for ${info.missingRate.join(", ")}.` }, { status: 400 })
    const markupType: "flat" | "percent" = p.markup_type === "percent" ? "percent" : "flat"
    const markupAmount = Number(p.markup_amount) || 0
    const finalPrice = markupType === "percent" ? r2(info.base * (1 + markupAmount / 100)) : r2(info.base + markupAmount)
    const leg = (quoteRow as any).leg_index == null ? null : Number((quoteRow as any).leg_index)
    const reqForLeg = leg && leg > 0 ? mapDbToRequest(rowForLeg(reqRow as Record<string, any>, leg) as DbFreightRequest) : base
    const label: string = leg == null ? `Option ${parts.length + 1}` : `Option ${leg + 1}`
    const { ctx, currency: cur, validUntil: vu } = buildContext({
      request: reqForLeg, quote: quoteRow, carrierName: (quoteRow as any).carriers?.carrier_name ?? "", markupType, markupAmount, baseRate: info.base, finalPrice, options,
      preparedBy: (userRow as { display_name?: string } | null)?.display_name || session.username,
      company: company ? { name: company.company_name, email: company.contact_email, phone: company.contact_phone } : undefined,
      quotationNumber, fx, optionLabel: label,
    })
    currency = cur
    if (vu && (!validUntil || vu < validUntil)) validUntil = vu
    parts.push({ label, destination: leg != null ? dests[leg] ?? "" : dests[parts.length] ?? "", ctx, leg })
    ids.push(quoteId); total += finalPrice; baseTotal += info.base
  }
  parts.sort((a, b) => (a.leg ?? 99) - (b.leg ?? 99))

  const rendered = renderCombined(parts, { number: quotationNumber }, options)
  if (body.preview === true) {
    return NextResponse.json({ preview: true, template_name: template.template_name ?? "", generated_subject: rendered.subject, generated_body: rendered.text, generated_html: rendered.html, generated_format: rendered.format, quotation_number: quotationNumber })
  }

  const baseRow = {
    client_code: session.clientCode, freight_request_id: freightRequestId, carrier_quote_id: ids[0], quotation_template_id: templateId,
    base_rate_usd: r2(baseTotal), markup_type: "flat", markup_amount: r2(total - baseTotal), final_price_usd: r2(total),
    generated_subject: rendered.subject, generated_body: rendered.text, status: "draft", created_by: session.username,
    generated_html: rendered.html, generated_format: rendered.format, quotation_number: quotationNumber,
    valid_until: validUntil || null, currency, show_markup_percent: false,
  }
  let { data: inserted, error } = await admin.from("quotations").insert({ ...baseRow, carrier_quote_ids: ids }).select("*").single()
  if (error && /carrier_quote_ids/.test(error.message)) return NextResponse.json({ error: "Run migration 081 (combined quotations) in Supabase first." }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logActivity({ clientCode: session.clientCode, eventType: "quotation_created", actor: session.username, description: `Built a combined quotation for ${parts.length} options`, meta: { freight_request_id: freightRequestId, quotation_id: inserted!.id } })
  return NextResponse.json({ ...inserted, rich_saved: true }, { status: 201 })
}
