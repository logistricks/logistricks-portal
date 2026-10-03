// n8n Code node "Build portal body" — turns the model's JSON + prepared input into the /api/carrier-quotes body.
const PROMPT_VERSION = "carrier-reply-v1"
const PASS = [
  "response_type","quote_status","carrier_quote_ref","version","mode","service_level","quote_date","valid_from",
  "total_amount_stated","minimum_charge","is_all_in","tax_included","tax_amount","transit_days","free_days",
  "commodity_description","hs_code","pieces","packaging_type","gross_weight","weight_unit","volume_cbm","dimensions",
  "volumetric_divisor","chargeable_weight_stated","stackable","declared_value","temperature_control","special_handling",
  "container_type","container_count","origin_place","destination_place","origin_code","destination_code","incoterm",
  "incoterm_place","pickup_address","etd","eta","frequency","direct_or_connecting","equipment_type","space_confirmed",
  "free_days_demurrage","free_days_detention","per_diem_note","payment_terms","insurance_offered","liability_limit",
  "cancellation_terms","exclusions","subject_to_conditions","required_documents","weight_break_tiers","notes",
  "ai_confidence","inferred_fields",
]
function addDays(iso, days) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t + days * 86400000).toISOString().slice(0, 10)
}
function buildBody(ai, prep, modelVersion) {
  // Reference: the regex hit wins; otherwise whatever the model found in subject / body / quoted text / attachments.
  const cands = [prep.rfq_reference, ...(ai.reference_candidates || [])].filter(Boolean).map((c) => String(c).trim())
  const rfq = cands.find((c) => /^RFQ-[0-9a-f]{8}-\d+-[0-9a-f]{6}$/i.test(c)) || null
  const lt = cands.map((c) => (c.match(/\bLT-\d+\b/i) || [])[0]).find(Boolean) || null
  const b = {
    client_code: prep.client_code || undefined,
    to_email: prep.to_email || undefined,
    intake_source: prep.intake_source || "automatic",
    intake_filename: prep.intake_filename || undefined,
    freight_request_id: prep.freight_request_id || undefined,
    carrier_email: prep.from_email,
    from_email: prep.from_email,
    rfq_reference: rfq,
    request_ref: lt ? lt.toUpperCase() : null,
    email_subject: prep.subject,
    email_thread_id: prep.thread_id,
    email_message_id: prep.message_id,
    raw_reply: prep.raw_text,
    rate_currency: (ai.currency || "USD").toUpperCase(),
    source_type: (prep.file_names || []).length ? "email+file" : "email",
    source_files: prep.file_names || [],
    model_version: modelVersion || null,
    prompt_version: PROMPT_VERSION,
    extraction: { key_evidence: ai.key_evidence || [] },
  }
  for (const k of PASS) if (ai[k] !== undefined) b[k] = ai[k]
  // validity: explicit date wins; otherwise count the days from the quote date (or the day we received it).
  b.validity_date = ai.validity_date || (ai.validity_days ? addDays(ai.quote_date || prep.received_at, ai.validity_days) : null)
  if (Array.isArray(ai.charges))
    b.charges = ai.charges.map((c) => ({ ...c, currency: c.currency || b.rate_currency }))
  if (ai.response_type === "quote" || ai.response_type === "update")
    b.rate_original = ai.total_amount_stated ?? null
  return b
}
module.exports = { buildBody, PROMPT_VERSION }
