/**
 * app/api/carrier-quotes/route.ts
 *
 * POST — n8n calls this after it parses a carrier's reply email.
 *        Auth: X-Portal-Secret header (same pattern as /api/auto-reply).
 *
 *        If the reply can be matched to an RFQ we sent, the quote is linked to
 *        that freight request automatically (linked_by_ai = true) and the RFQ
 *        row is marked responded.
 *
 *        If it cannot be matched, the quote is still stored — as a NON-LINKED
 *        quote owned by the client — and appears on the Non-linked Quotes page
 *        where a user links it to a request or deletes it. Nothing is dropped.
 *
 * Body:
 *   client_code         string   (required — the client whose mailbox received the reply)
 *   rfq_reference       string   (preferred match key — token embedded in the RFQ email)
 *   freight_request_id  string   (fallback match key, together with the carrier)
 *   carrier_id          number   (logical per-client carrier_id — fallback match key)
 *   carrier_email       string   (used to resolve the carrier when carrier_id is absent)
 *   email_thread_id     string   (optional — Gmail threadId, last-resort match key)
 *   email_message_id    string   (optional)
 *   from_email          string   (optional — sender of the reply; defaults to carrier_email)
 *   email_subject       string   (optional)
 *   rate_usd            number|null
 *   rate_currency       string
 *   rate_original       number|null
 *   transit_days        number|null
 *   validity_date       string|null (YYYY-MM-DD)
 *   free_days           number|null
 *   notes               string|null
 *   raw_reply           string|null
 *
 *   Extended fields (migration 040) — all optional, send null when the carrier did not say:
 *     header:   carrier_quote_ref, response_type, quote_status, version, mode, service_level,
 *               quote_date, valid_from, is_all_in, tax_included, tax_amount,
 *               total_amount_stated, minimum_charge
 *     cargo:    commodity_description, hs_code, pieces, packaging_type, gross_weight, weight_unit,
 *               volume_cbm, dimensions[{length_cm,width_cm,height_cm,pieces}], volumetric_divisor,
 *               chargeable_weight_stated, stackable, declared_value, temperature_control,
 *               hazmat{}, special_handling, container_type, container_count
 *     route:    origin_place, destination_place, origin_code, destination_code, incoterm,
 *               incoterm_place, etd, eta, frequency, direct_or_connecting, legs[], cutoffs{}
 *     pricing:  charges[{canonical_code,carrier_label,category,basis,unit_rate,quantity,amount,
 *               currency,inclusion,applies_to_leg,payable_by,condition_note}], weight_break_tiers[]
 *     mode:     equipment_type, space_confirmed, free_days_demurrage, free_days_detention,
 *               per_diem_note, mode_details{}
 *     terms:    payment_terms, insurance_offered, liability_limit, cancellation_terms, exclusions,
 *               subject_to_conditions, required_documents
 *     meta:     source_type, source_files[], extraction{}, model_version, prompt_version,
 *               rfq_match_score, discrepancies{}
 *   The server COMPUTES gross_weight_kg, volumetric_weight_kg, chargeable_weight (+unit/basis),
 *   total_amount, validation_flags and review_status. Do not send those.
 *
 * Responses:
 *   200 { ok: true, linked: true,  link_method, carrier_quote_request_id, carrier_quote_id }
 *   200 { ok: true, linked: false, reason, carrier_quote_id }   — stored as non-linked
 *   400 { error }
 *   401 { error: "Unauthorized" }
 *   500 { error }
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { checkDates, computePricing, computeWeights, type Flag } from "@/lib/quote-math"

const EXT_SCALAR = [
  "carrier_quote_ref","response_type","quote_status","version","mode","service_level",
  "quote_date","valid_from","is_all_in","tax_included","tax_amount","total_amount_stated","minimum_charge",
  "commodity_description","hs_code","pieces","packaging_type","gross_weight","weight_unit","volume_cbm",
  "volumetric_divisor","chargeable_weight_stated","stackable","declared_value","temperature_control",
  "special_handling","container_type","container_count",
  "origin_place","destination_place","origin_code","destination_code","incoterm","incoterm_place",
  "etd","eta","frequency","direct_or_connecting",
  "equipment_type","space_confirmed","free_days_demurrage","free_days_detention","per_diem_note",
  "payment_terms","insurance_offered","liability_limit","cancellation_terms","exclusions",
  "subject_to_conditions","required_documents",
  "source_type","model_version","prompt_version","rfq_match_score",
] as const
const EXT_JSON = [
  "dimensions","hazmat","legs","cutoffs","weight_break_tiers","mode_details",
  "source_files","extraction","discrepancies",
] as const

const clean = (v: unknown) => (v === undefined || v === "" ? null : v)

/** Whitelists the extended fields, then computes weights / totals / flags in code. */
function buildExtendedFields(body: Record<string, unknown>) {
  const row: Record<string, unknown> = {}
  for (const k of EXT_SCALAR) if (k in body) row[k] = clean(body[k])
  for (const k of EXT_JSON)   if (k in body) row[k] = clean(body[k])

  const w = computeWeights({
    mode: row.mode as string | null,
    service_level: row.service_level as string | null,
    gross_weight: row.gross_weight, weight_unit: row.weight_unit,
    volume_cbm: row.volume_cbm, dimensions: row.dimensions,
    volumetric_divisor: row.volumetric_divisor,
    chargeable_weight_stated: row.chargeable_weight_stated,
  })
  const p = computePricing({ charges: body.charges, total_amount_stated: row.total_amount_stated })
  const flags: Flag[] = [
    ...w.flags, ...p.flags,
    ...checkDates({ etd: row.etd, eta: row.eta, validity_date: body.validity_date, valid_from: row.valid_from }),
  ]

  const rt = row.response_type as string | null | undefined
  if (rt && rt !== "quote" && rt !== "update")
    flags.push({ code: "not_a_quote", field: "response_type", severity: "info", message: `Carrier reply classified as "${rt}".` })
  if (row.quote_status && row.quote_status !== "firm")
    flags.push({ code: "not_firm", field: "quote_status", severity: "info", message: `Quote is ${row.quote_status}.` })

  row.gross_weight_kg       = w.gross_weight_kg
  row.volume_cbm            = w.volume_cbm ?? row.volume_cbm ?? null
  row.volumetric_divisor    = w.volumetric_divisor ?? row.volumetric_divisor ?? null
  row.volumetric_weight_kg  = w.volumetric_weight_kg
  row.chargeable_weight     = w.chargeable_weight
  row.chargeable_unit       = w.chargeable_unit
  row.chargeable_basis      = w.chargeable_basis
  if (p.charges)            row.charges = p.charges
  row.total_amount          = p.total_amount
  row.validation_flags      = flags
  // Auto-accept only a clean, firm, real quote; anything else is reviewed by a person.
  row.review_status = flags.length === 0 && (rt === "quote" || rt === "update") && row.quote_status === "firm"
    ? "auto_accepted" : "needs_review"
  return { row, flags }
}

/** Insert with the extended columns; if migration 040 has not run yet, store the base fields only. */
async function insertQuote(admin: any, base: Record<string, unknown>, ext: Record<string, unknown>) {
  const first = await admin.from("carrier_quotes").insert({ ...base, ...ext }).select("id").single()
  const missingColumn = first.error && (first.error.code === "42703" || first.error.code === "PGRST204")
  if (!missingColumn) return first
  return admin.from("carrier_quotes").insert(base).select("id").single()
}

type LinkMethod = "rfq_reference" | "request_and_carrier" | "email_thread"
type Match = { id: number; freight_request_id: string; carrier_id: number }

export async function POST(req: NextRequest) {
  const secret    = req.headers.get("x-portal-secret")
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const client_code = body.client_code as string | undefined
  if (!client_code) return NextResponse.json({ error: "client_code required" }, { status: 400 })

  const admin = adminClient()

  // ── Resolve the carrier's primary key (carriers.id) ───────────────────────
  // carrier_quote_requests.carrier_id and carrier_quotes.carrier_id both point at
  // carriers.id, NOT at the per-client logical carrier_id the caller sends.
  let carrierPk: number | null = null

  if (body.carrier_id != null) {
    const { data } = await admin
      .from("carriers")
      .select("id")
      .eq("client_code", client_code)
      .eq("carrier_id", body.carrier_id)
      .eq("is_cc", false)
      .maybeSingle()
    carrierPk = data?.id ?? null
  }

  if (!carrierPk && typeof body.carrier_email === "string" && body.carrier_email.trim()) {
    const wanted = body.carrier_email.trim().toLowerCase()
    const { data: carrierList } = await admin
      .from("carriers")
      .select("id, email")
      .eq("client_code", client_code)
      .eq("is_cc", false)
    const hit = (carrierList ?? []).find(
      (c: { id: number; email: string | null }) => (c.email ?? "").trim().toLowerCase() === wanted,
    )
    carrierPk = hit?.id ?? null
  }

  // ── Try to match the reply to an RFQ we sent ──────────────────────────────
  let match: Match | null = null
  let method: LinkMethod | null = null
  const cols = "id, freight_request_id, carrier_id"

  if (body.rfq_reference) {
    const { data } = await admin
      .from("carrier_quote_requests")
      .select(cols)
      .eq("rfq_reference", body.rfq_reference as string)
      .maybeSingle()
    if (data) { match = data; method = "rfq_reference" }
  }

  if (!match && body.freight_request_id && carrierPk) {
    const { data } = await admin
      .from("carrier_quote_requests")
      .select(cols)
      .eq("freight_request_id", body.freight_request_id as string)
      .eq("carrier_id", carrierPk)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) { match = data; method = "request_and_carrier" }
  }

  if (!match && body.email_thread_id) {
    const { data } = await admin
      .from("carrier_quote_requests")
      .select(cols)
      .eq("email_thread_id", body.email_thread_id as string)
      .maybeSingle()
    if (data) { match = data; method = "email_thread" }
  }

  // A reply may only link to a request of the client whose mailbox received it.
  if (match) {
    const { data: fr } = await admin
      .from("freight_requests")
      .select("client_code")
      .eq("id", match.freight_request_id)
      .maybeSingle()
    if (!fr || String(fr.client_code).toLowerCase() !== client_code.toLowerCase()) {
      match = null
      method = null
    }
  }

  const quoteFields = {
    client_code,
    rate_usd:         body.rate_usd ?? null,
    rate_currency:    body.rate_currency ?? "USD",
    rate_original:    body.rate_original ?? null,
    transit_days:     body.transit_days ?? null,
    validity_date:    body.validity_date ?? null,
    free_days:        body.free_days ?? null,
    notes:            body.notes ?? null,
    raw_reply:        body.raw_reply ?? null,
    from_email:       (body.from_email as string | undefined) ?? (body.carrier_email as string | undefined) ?? null,
    email_subject:    body.email_subject ?? null,
    email_thread_id:  body.email_thread_id ?? null,
    email_message_id: body.email_message_id ?? null,
  }

  const { row: ext, flags: validationFlags } = buildExtendedFields(body)

  // ── No match: keep it as a non-linked quote for a user to sort out ────────
  if (!match) {
    const reason = !carrierPk
      ? "carrier_not_recognised"
      : (body.rfq_reference || body.freight_request_id)
        ? "no_matching_rfq"
        : "no_reference_found"

    const { data: orphan, error: orphanErr } = await insertQuote(admin, {
      ...quoteFields,
      carrier_id:      carrierPk,
      unlinked_reason: reason,
    }, ext)

    if (orphanErr) return NextResponse.json({ error: orphanErr.message }, { status: 500 })
    return NextResponse.json({
      ok: true, linked: false, reason, carrier_quote_id: orphan?.id,
      review_status: ext.review_status, validation_flags: validationFlags,
    })
  }

  // ── Matched: mark the RFQ responded and store the linked quote ────────────
  const updatePatch: Record<string, unknown> = {
    status:       "responded",
    responded_at: new Date().toISOString(),
  }
  if (body.email_message_id) updatePatch.email_message_id = body.email_message_id
  if (body.email_thread_id)  updatePatch.email_thread_id  = body.email_thread_id

  const { error: updateErr } = await admin
    .from("carrier_quote_requests")
    .update(updatePatch)
    .eq("id", match.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const { data: quoteRow, error: insertErr } = await insertQuote(admin, {
    ...quoteFields,
    carrier_quote_request_id: match.id,
    freight_request_id:       match.freight_request_id,
    carrier_id:               match.carrier_id,
    linked_by_ai:             true,
    link_method:              method,
    linked_at:                new Date().toISOString(),
  }, ext)

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    linked: true,
    link_method: method,
    carrier_quote_request_id: match.id,
    carrier_quote_id: quoteRow?.id,
    review_status: ext.review_status,
    validation_flags: validationFlags,
  })
}
