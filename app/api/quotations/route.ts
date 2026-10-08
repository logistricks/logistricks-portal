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
import { buildContext, carrierBase, renderQuotation } from "@/lib/quotation-render"
import { normalizeOptions } from "@/lib/quotation-variables"

function auth(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return null
  return getSession(cookie)
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
  let markupType: "flat" | "percent" = (body.markup_type as string) === "percent" ? "percent" : "flat"
  let markupAmount        = Number(body.markup_amount) || 0
  let showMarkupPercent   = body.show_markup_percent === true
  const styleOverride     = body.charges_style === "marked_up" || body.charges_style === "detailed" || body.charges_style === "total_only" ? (body.charges_style as "marked_up" | "detailed" | "total_only") : null
  // Manually edited prices: [{label, basis, qty, rate, amount}] — the total is their sum.
  const lineOverrides = Array.isArray(body.line_overrides)
    ? (body.line_overrides as Record<string, unknown>[]).slice(0, 60).map((l) => {
        const amount = Math.round((Number(l.amount) || 0) * 100) / 100
        const qty = Number(l.qty) > 0 ? Number(l.qty) : null
        return { label: String(l.label ?? "").slice(0, 200) || "Charge", basis: String(l.basis ?? "").slice(0, 60), qty, rate: qty ? Math.round((amount / qty) * 100) / 100 : null, amount }
      })
    : null
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
  if ((quoteRow as { disregarded?: boolean }).disregarded === true)
    return NextResponse.json({ error: "This carrier quote was disregarded. Reactivate it before building a quotation." }, { status: 400 })

  if (!quotationTemplateId) {
    // Prefer an active template made for this mode, then the default.
    const mode = String(quoteRow.mode ?? "").toLowerCase()
    const { data: all } = await admin
      .from("quotation_templates")
      .select("*")
      .eq("client_code", session.clientCode)
      .eq("active", true)
    const list = (all ?? []) as { template_id: number; is_default: boolean; applies_to_mode?: string }[]
    quotationTemplateId =
      list.find((t) => mode && t.applies_to_mode === mode)?.template_id ??
      list.find((t) => t.is_default)?.template_id
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

  const baseRate = carrierBase(quoteRow as Record<string, any>)
  let finalPrice = markupType === "percent"
    ? Math.round(baseRate * (1 + markupAmount / 100) * 100) / 100
    : Math.round((baseRate + markupAmount) * 100) / 100
  if (lineOverrides && lineOverrides.length) {
    finalPrice = Math.round(lineOverrides.reduce((t, l) => t + l.amount, 0) * 100) / 100
    markupType = "flat"; markupAmount = Math.round((finalPrice - baseRate) * 100) / 100; showMarkupPercent = false
  }

  const carrierName = (quoteRow as { carriers?: { carrier_name?: string } }).carriers?.carrier_name ?? ""

  // Company details and the user's display name (best effort — the template falls back to blanks).
  const [{ data: company }, { data: userRow }, { count: existing }] = await Promise.all([
    admin.from("clients").select("company_name, contact_email, contact_phone").eq("client_code", session.clientCode).maybeSingle(),
    admin.from("portal_users").select("display_name").eq("client_code", session.clientCode).eq("username", session.username).maybeSingle(),
    admin.from("quotations").select("id", { count: "exact", head: true }).eq("freight_request_id", freightRequestId),
  ])
  const quotationNumber = `QT-${request.requestRef}-${String((existing ?? 0) + 1).padStart(2, "0")}`

  const baseOptions = normalizeOptions((template as { options?: unknown }).options)
  const options = styleOverride ? { ...baseOptions, charges_style: styleOverride } : baseOptions
  const { ctx, validUntil, currency, lines, mixed } = buildContext({
    request, quote: quoteRow, carrierName, markupType, markupAmount, baseRate, finalPrice, options, showMarkupPercent, lineOverrides: lineOverrides ?? undefined,
    preparedBy: (userRow as { display_name?: string } | null)?.display_name || session.username,
    company: company ? { name: company.company_name, email: company.contact_email, phone: company.contact_phone } : undefined,
    quotationNumber,
  })
  const rendered = renderQuotation(template, ctx, options)

  // Preview only: show what the chosen template produces, without saving anything.
  if (body.preview === true) {
    return NextResponse.json({
      preview: true,
      template_id: quotationTemplateId,
      template_name: (template as { template_name?: string }).template_name ?? "",
      generated_subject: rendered.subject,
      generated_body: rendered.text,
      generated_html: rendered.html,
      generated_format: rendered.format,
      quotation_number: quotationNumber,
      final_price_usd: finalPrice,
      base_rate_usd: baseRate,
      charges_style: options.charges_style,
      lines,
      mixed_currency: mixed,
    })
  }

  const baseRow = {
    client_code:            session.clientCode,
    freight_request_id:     freightRequestId,
    carrier_quote_id:       carrierQuoteId,
    quotation_template_id:  quotationTemplateId,
    base_rate_usd:          baseRate,
    markup_type:            markupType,
    markup_amount:          markupAmount,
    final_price_usd:        finalPrice,
    generated_subject:      rendered.subject,
    generated_body:         rendered.text,
    status:                 "draft",
    created_by:             session.username,
  }
  const { show_markup_percent: _unused, ...richNoPct } = {
    ...baseRow,
    generated_html:   rendered.html,
    generated_format: rendered.format,
    quotation_number: quotationNumber,
    valid_until:      validUntil || null,
    currency,
    show_markup_percent: showMarkupPercent,
  }
  const richRow = { ...richNoPct, show_markup_percent: showMarkupPercent }
  const isMissingCol = (e: { code?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204")
  let { data: inserted, error: insertErr } = await admin.from("quotations").insert(richRow).select("*").single()
  if (isMissingCol(insertErr)) {
    // Migration 043 not applied yet: keep the rich quotation, just without the percentage flag.
    ;({ data: inserted, error: insertErr } = await admin.from("quotations").insert(richNoPct).select("*").single())
  }
  if (isMissingCol(insertErr)) {
    // Migration 042 not applied yet: store the plain-text quotation.
    ;({ data: inserted, error: insertErr } = await admin.from("quotations").insert(baseRow).select("*").single())
  }

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "quotation_created",
    actor:       session.username,
    description: `Built quotation for request (final price $${finalPrice.toLocaleString()})`,
    meta: { freight_request_id: freightRequestId, quotation_id: inserted!.id, final_price_usd: finalPrice },
  })

  const richStored = !!inserted && ("generated_html" in (inserted as object))
  return NextResponse.json({ ...inserted, rich_saved: richStored }, { status: 201 })
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
