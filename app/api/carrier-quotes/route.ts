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
 *   client_code         string   (the client whose mailbox received the reply — optional when to_email is sent)
 *   to_email            string   (the mailbox that received the reply; resolved to client_code via the client's
 *                                 receiver emails / connected mailboxes when client_code is absent)
 *   rfq_reference       string   (preferred match key — token embedded in the RFQ email)
 *   request_ref         string   (our request number, e.g. LT-0017 — resolved to the request, then matched by carrier)
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
 *     review:   ai_confidence (0-1), inferred_fields[] — low confidence / inferred values add flags
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
import { NextResponse, after, type NextRequest } from "next/server"
import { notifyCarrierQuote } from "@/lib/notify-hooks"
import { adminClient } from "@/lib/api-session"
import { buildExtendedFields } from "@/lib/quote-extended"
import { syncRequestStatus } from "@/lib/request-status"
import { normId } from "@/lib/inbound-match"

/** Insert with the extended columns; if migration 040 has not run yet, store the base fields only. */
async function insertQuote(admin: any, base: Record<string, unknown>, ext: Record<string, unknown>) {
  const first = await admin.from("carrier_quotes").insert({ ...base, ...ext }).select("id").single()
  const missingColumn = first.error && (first.error.code === "42703" || first.error.code === "PGRST204")
  if (!missingColumn) return first
  return admin.from("carrier_quotes").insert(base).select("id").single()
}

type LinkMethod = "rfq_reference" | "request_and_carrier" | "email_thread" | "manual"
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

  const admin = adminClient()

  // ── Resolve the client: explicit client_code wins, otherwise the receiving ("to") mailbox ──
  let client_code = typeof body.client_code === "string" ? body.client_code.trim() : ""
  if (!client_code) {
    const toRaw = typeof body.to_email === "string" ? body.to_email : ""
    const addrs = Array.from(new Set((toRaw.match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []).map((a) => a.toLowerCase().replace(/[%_,()]/g, ""))))
    if (!addrs.length) return NextResponse.json({ error: "client_code or to_email required" }, { status: 400 })
    const found = new Set<string>()
    for (const a of addrs) {
      const [r, m] = await Promise.all([
        admin.from("client_receiver_emails").select("client_code").ilike("r_mail", a).eq("active", true).limit(5),
        admin.from("email_sources").select("client_code").or(`ms_email.ilike.${a},imap_username.ilike.${a}`).limit(5),
      ])
      for (const row of [...(r.data || []), ...(m.data || [])]) if (row.client_code) found.add(String(row.client_code))
    }
    if (found.size === 0) return NextResponse.json({ ok: false, reason: "client_not_resolved", error: `no client uses the mailbox ${addrs.join(", ")}` }, { status: 404 })
    if (found.size > 1) return NextResponse.json({ ok: false, reason: "client_ambiguous", error: `mailbox belongs to several clients: ${Array.from(found).join(", ")}` }, { status: 409 })
    client_code = Array.from(found)[0]
  }

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

  // Our human request number (e.g. LT-0017) found by the AI in subject/body/attachments.
  let freightRequestId = (body.freight_request_id as string | undefined) ?? null
  let requestFound = false
  if (!match && !freightRequestId && typeof body.request_ref === "string" && body.request_ref.trim()) {
    const { data: fr } = await admin
      .from("freight_requests")
      .select("id")
      .ilike("client_code", client_code)
      .eq("request_ref", body.request_ref.trim().toUpperCase())
      .maybeSingle()
    if (fr) { freightRequestId = fr.id; requestFound = true }
  }

  if (!match && freightRequestId && carrierPk) {
    const { data } = await admin
      .from("carrier_quote_requests")
      .select(cols)
      .eq("freight_request_id", freightRequestId)
      .eq("carrier_id", carrierPk)
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

  // Dropped by hand inside a request: the person chose the request, so link it there even when no RFQ was sent from the
  // portal for this carrier (the RFQ row is created, as the manual "link" action does).
  if (!match && body.intake_source === "manual" && freightRequestId && carrierPk) {
    const { data: own } = await admin.from("freight_requests").select("id").eq("id", freightRequestId).eq("client_code", client_code).maybeSingle()
    if (own) {
      const { data: created } = await admin
        .from("carrier_quote_requests")
        .insert({
          freight_request_id: freightRequestId,
          carrier_id:         carrierPk,
          email_thread_id:    (body.email_thread_id as string | undefined) ?? `manual-drop-${Date.now()}`,
          email_message_id:   (body.email_message_id as string | undefined) ?? null,
          status:             "sent",
        })
        .select(cols)
        .single()
      if (created) { match = created; method = "manual" }
    }
  }

  // A reply may only link to a request of the client whose mailbox received it.
  let reqCtx: { incoterm?: string | null; pickup_address?: string | null } | undefined
  if (match) {
    const { data: fr } = await admin
      .from("freight_requests")
      .select("*")
      .eq("id", match.freight_request_id)
      .maybeSingle()
    if (!fr || String(fr.client_code).toLowerCase() !== client_code.toLowerCase()) {
      match = null
      method = null
    } else {
      reqCtx = { incoterm: (fr as any).incoterm ?? null, pickup_address: (fr as any).pickup_address ?? null }
    }
  }

  // When the carrier's email was actually sent/received (not when we finished reading it), to the second.
  // Order: the date n8n passes → the date stored for this message when it was first seen → now.
  const okDate = (v: unknown): string | null => {
    const t = typeof v === "string" ? Date.parse(v) : NaN
    return Number.isNaN(t) || t > Date.now() + 5 * 60_000 ? null : new Date(t).toISOString()
  }
  let emailAt = okDate(body.received_at)
  if (!emailAt && body.email_message_id) {
    const { data: ib } = await admin.from("inbound_emails").select("received_at").ilike("client_code", client_code)
      .eq("message_id", normId(body.email_message_id)).order("received_at", { ascending: true }).limit(1).maybeSingle()
    emailAt = okDate(ib?.received_at)
  }

  const quoteFields: Record<string, any> = {
    ...(emailAt ? { received_at: emailAt } : {}),
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

  const { row: ext, flags: validationFlags } = buildExtendedFields(body, reqCtx)

  // Headline rate = the computed total when the AI gave none and the quote is in USD.
  if (quoteFields.rate_usd == null && ext.total_amount != null && String(quoteFields.rate_currency).toUpperCase() === "USD") {
    quoteFields.rate_usd = ext.total_amount as number
    quoteFields.rate_original = quoteFields.rate_original ?? (ext.total_amount as number)
  }

  // ── No match: keep it as a non-linked quote for a user to sort out ────────
  if (!match) {
    const reason = !carrierPk
      ? "carrier_not_recognised"
      : (body.rfq_reference || freightRequestId || body.request_ref)
        ? "no_matching_rfq"
        : "no_reference_found"

    const { data: orphan, error: orphanErr } = await insertQuote(admin, {
      ...quoteFields,
      carrier_id:      carrierPk,
      unlinked_reason: reason,
    }, ext)

    if (orphanErr) return NextResponse.json({ error: orphanErr.message }, { status: 500 })
    const detail = body.request_ref && !requestFound && !body.freight_request_id
      ? `request ${body.request_ref} not found for client ${client_code}`
      : freightRequestId && carrierPk ? "request found but no RFQ was sent to this carrier for it" : null
    after(() => notifyCarrierQuote(admin, {
      clientCode: client_code, kind: "attention", reason, requestId: freightRequestId ?? null, carrierPk: carrierPk ?? null,
      body, quote: quoteFields, ext, flags: validationFlags,
    }))
    return NextResponse.json({
      ok: true, linked: false, reason, detail, carrier_quote_id: orphan?.id,
      review_status: ext.review_status, validation_flags: validationFlags,
    })
  }

  // ── Matched: mark the RFQ responded and store the linked quote ────────────
  const isDecline = body.response_type === "decline"
  const updatePatch: Record<string, unknown> = {
    status:       isDecline ? "declined" : "responded",
    responded_at: emailAt ?? new Date().toISOString(),
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

  const requestStatus = await syncRequestStatus(admin, match.freight_request_id)

  // Email the team: a clean quote is good news; a decline, a question or a failed check needs a person.
  const rt = String(body.response_type ?? "quote")
  const attention = isDecline ? "decline" : rt === "info_request" ? "info_request" : ext.review_status === "needs_review" ? "needs_review" : null
  after(() => notifyCarrierQuote(admin, {
    clientCode: client_code, kind: attention ? "attention" : "received", reason: attention ?? undefined,
    requestId: match.freight_request_id, carrierPk: match.carrier_id, body, quote: quoteFields, ext, flags: validationFlags,
  }))

  return NextResponse.json({
    ok: true,
    linked: true,
    request_status: requestStatus,
    link_method: method,
    carrier_quote_request_id: match.id,
    carrier_quote_id: quoteRow?.id,
    review_status: ext.review_status,
    validation_flags: validationFlags,
  })
}
