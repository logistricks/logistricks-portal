/**
 * lib/quote-extended.ts
 *
 * Whitelists the extended carrier-quote fields from an n8n payload and computes
 * everything numeric in code (weights, totals, validation flags, review status).
 * Kept out of the route file so it can be unit-tested without Next.js.
 */
import { exwNeedsAddress } from "@/lib/shipment-labels"
import { checkDates, computePricing, computeWeights, type Flag } from "@/lib/quote-math"

export const EXT_SCALAR = [
  "carrier_quote_ref","response_type","quote_status","version","mode","service_level",
  "quote_date","valid_from","is_all_in","tax_included","tax_amount","total_amount_stated","minimum_charge",
  "commodity_description","hs_code","pieces","packaging_type","gross_weight","weight_unit","volume_cbm",
  "volumetric_divisor","chargeable_weight_stated","stackable","declared_value","temperature_control",
  "special_handling","container_type","container_count",
  "pickup_address","intake_source","intake_filename",
  "origin_place","destination_place","origin_code","destination_code","incoterm","incoterm_place",
  "etd","eta","frequency","direct_or_connecting",
  "equipment_type","space_confirmed","free_days_demurrage","free_days_detention","per_diem_note",
  "payment_terms","insurance_offered","liability_limit","cancellation_terms","exclusions",
  "subject_to_conditions","required_documents",
  "source_type","model_version","prompt_version","rfq_match_score",
] as const
export const EXT_JSON = [
  "dimensions","hazmat","legs","cutoffs","weight_break_tiers","mode_details",
  "source_files","extraction","discrepancies",
] as const

const clean = (v: unknown) => (v === undefined || v === "" ? null : v)

/** Whitelists the extended fields, then computes weights / totals / flags in code. */
export function buildExtendedFields(
  body: Record<string, unknown>,
  reqCtx?: { incoterm?: string | null; pickup_address?: string | null },
) {
  const row: Record<string, unknown> = {}
  for (const k of EXT_SCALAR) if (k in body) row[k] = clean(body[k])
  for (const k of EXT_JSON)   if (k in body) row[k] = clean(body[k])
  // NOT NULL columns with a default: omit when the carrier gave nothing so the default (1) applies.
  if (row.version == null) delete row.version
  row.intake_source = row.intake_source === "manual" ? "manual" : "automatic"
  if (row.intake_filename == null) delete row.intake_filename

  const w = computeWeights({
    mode: row.mode as string | null,
    service_level: row.service_level as string | null,
    gross_weight: row.gross_weight, weight_unit: row.weight_unit,
    volume_cbm: row.volume_cbm, dimensions: row.dimensions,
    volumetric_divisor: row.volumetric_divisor,
    chargeable_weight_stated: row.chargeable_weight_stated,
  })
  const p = computePricing({
    charges: body.charges, total_amount_stated: row.total_amount_stated,
    chargeable_weight: w.chargeable_weight, chargeable_unit: w.chargeable_unit,
    volume_cbm: w.volume_cbm ?? (row.volume_cbm as number | null) ?? null,
    container_count: row.container_count as number | null, pieces: row.pieces as number | null,
  })
  const flags: Flag[] = [
    ...w.flags, ...p.flags,
    ...checkDates({ etd: row.etd, eta: row.eta, validity_date: body.validity_date, valid_from: row.valid_from }),
  ]

  const rt = row.response_type as string | null | undefined
  if (rt && rt !== "quote" && rt !== "update")
    flags.push({ code: "not_a_quote", field: "response_type", severity: "info", message: `Carrier reply classified as "${rt}".` })
  if (row.quote_status && row.quote_status !== "firm")
    flags.push({ code: "not_firm", field: "quote_status", severity: "info", message: `Quote is ${row.quote_status}.` })

  // EXW needs a pickup address from the requester or the carrier; otherwise a person must chase it.
  const incoterm = (row.incoterm as string | null) ?? reqCtx?.incoterm ?? null
  if (exwNeedsAddress(incoterm, row.pickup_address, reqCtx?.pickup_address))
    flags.push({ code: "exw_no_address", field: "pickup_address", severity: "warn", message: "EXW shipment: no pickup address from the requester or the carrier." })

  // AI self-report: low confidence or values it had to infer always go to a person.
  const conf = typeof body.ai_confidence === "number" ? body.ai_confidence : null
  if (conf !== null && conf < 0.8)
    flags.push({ code: "low_confidence", field: null, severity: "warn", message: `Extraction confidence ${Math.round(conf * 100)}%.` })
  if (Array.isArray(body.inferred_fields) && body.inferred_fields.length)
    flags.push({ code: "inferred_values", field: null, severity: "warn", message: `Values inferred, not stated: ${(body.inferred_fields as unknown[]).map(String).join(", ")}.` })

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
