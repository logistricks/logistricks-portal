/**
 * app/api/quotations/route.ts
 *
 * Builds and tracks the outbound quotation sent to the original
 * requester: carrier's quote + markup -> final price -> rendered
 * document (from a quotation_templates row).
 *
 * GET    ?freight_request_id=...   -> list quotations for a request
 * POST                              -> create a new quotation (renders the doc)
 * PATCH  { id, status: "sent" }     -> mark a quotation as sent
 */
import { NextRequest, NextResponse } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"
import { mapDbToRequest, type DbFreightRequest } from "@/lib/supabase-queries"
import { logActivity } from "@/lib/log-activity"

function auth(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return null
  return getSession(cookie)
}

function substitute(text: string, map: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => map[key] ?? "")
}

export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const freightRequestId = url.searchParams.get("freight_request_id")
  if (!freightRequestId) return NextResponse.json({ error: "freight_request_id required" }, { status: 400 })

  const { data, error } = await adminClient()
    .from("quotations")
    .select("*")
    .eq("client_code", session.clientCode)
    .eq("freight_request_id", freightRequestId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const freightRequestId  = body.freight_request_id as string | undefined
  const carrierQuoteId    = body.carrier_quote_id as number | undefined
  const markupType        = (body.markup_type as string) === "percent" ? "percent" : "flat"
  const markupAmount      = Number(body.markup_amount) || 0
  let quotationTemplateId = body.quotation_template_id as number | undefined

  if (!freightRequestId) return NextResponse.json({ error: "freight_request_id required" }, { status: 400 })
  if (!carrierQuoteId)   return NextResponse.json({ error: "carrier_quote_id required" }, { status: 400 })

  const admin = adminClient()

  const { data: reqRow, error: reqErr } = await admin
    .from("freight_requests")
    .select("*")
    .eq("id", freightRequestId)
    .eq("client_code", session.clientCode)
    .single()
  if (reqErr || !reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  const request = mapDbToRequest(reqRow as DbFreightRequest)

  const { data: quoteRow, error: quoteErr } = await admin
    .from("carrier_quotes")
    .select("*, carriers:carrier_id ( carrier_name )")
    .eq("id", carrierQuoteId)
    .eq("freight_request_id", freightRequestId)
    .single()
  if (quoteErr || !quoteRow) return NextResponse.json({ error: "Carrier quote not found" }, { status: 404 })

  if (!quotationTemplateId) {
    const { data: defaultTpl } = await admin
      .from("quotation_templates")
      .select("template_id")
      .eq("client_code", session.clientCode)
      .eq("is_default", true)
      .eq("active", true)
      .maybeSingle()
    quotationTemplateId = defaultTpl?.template_id
  }
  if (!quotationTemplateId)
    return NextResponse.json({ error: "No quotation template selected and no default template is set" }, { status: 400 })

  const { data: template, error: tplErr } = await admin
    .from("quotation_templates")
    .select("*")
    .eq("client_code", session.clientCode)
    .eq("template_id", quotationTemplateId)
    .single()
  if (tplErr || !template) return NextResponse.json({ error: "Quotation template not found" }, { status: 404 })

  const baseRate = Number(quoteRow.rate_usd ?? 0)
  const finalPrice = markupType === "percent"
    ? Math.round(baseRate * (1 + markupAmount / 100) * 100) / 100
    : Math.round((baseRate + markupAmount) * 100) / 100

  const carrierName = (quoteRow as { carriers?: { carrier_name?: string } }).carriers?.carrier_name ?? ""

  const map: Record<string, string> = {
    origin_city: request.originCity, origin_country: request.originCountry,
    destination_city: request.destinationCity, destination_country: request.destinationCountry,
    cargo_type: request.cargoType, equipment: request.equipment, weight: request.weight,
    quantity: request.quantity, dimensions: request.dimensions, incoterm: request.incoterm,
    bl_type: request.blType, mode: request.modes.join(", "), urgency: request.urgency,
    sender_name: request.senderName, sender_email: request.senderEmail,
    received_date: request.receivedExact,
    carrier_name: carrierName,
    transit_days: quoteRow.transit_days != null ? String(quoteRow.transit_days) : "",
    validity_date: quoteRow.validity_date ?? "",
    free_days: quoteRow.free_days != null ? String(quoteRow.free_days) : "",
    base_rate: baseRate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    markup: markupType === "percent" ? `${markupAmount}%` : `$${markupAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    final_price: finalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    currency: "USD",
    quotation_date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  }

  const generatedSubject = substitute(template.subject ?? "", map)
  const generatedBody    = substitute(template.body ?? "", map)

  const { data: inserted, error: insertErr } = await admin
    .from("quotations")
    .insert({
      client_code:            session.clientCode,
      freight_request_id:     freightRequestId,
      carrier_quote_id:       carrierQuoteId,
      quotation_template_id:  quotationTemplateId,
      base_rate_usd:          baseRate,
      markup_type:            markupType,
      markup_amount:          markupAmount,
      final_price_usd:        finalPrice,
      generated_subject:      generatedSubject,
      generated_body:         generatedBody,
      status:                 "draft",
      created_by:             session.username,
    })
    .select("*")
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "quotation_created",
    actor:       session.username,
    description: `Built quotation for request (final price $${finalPrice.toLocaleString()})`,
    meta: { freight_request_id: freightRequestId, quotation_id: inserted.id, final_price_usd: finalPrice },
  })

  return NextResponse.json(inserted, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const admin = adminClient()
  const patch: Record<string, unknown> = {}
  if (body.status === "sent") {
    patch.status  = "sent"
    patch.sent_at = new Date().toISOString()
  }
  if (typeof body.generated_subject === "string") patch.generated_subject = body.generated_subject
  if (typeof body.generated_body === "string")    patch.generated_body    = body.generated_body

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { error } = await admin
    .from("quotations")
    .update(patch)
    .eq("id", body.id)
    .eq("client_code", session.clientCode)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.status === "sent") {
    await logActivity({
      clientCode:  session.clientCode,
      eventType:   "quotation_sent",
      actor:       session.username,
      description: `Sent quotation to requester`,
      meta: { quotation_id: body.id },
    })
  }

  return NextResponse.json({ ok: true })
}
