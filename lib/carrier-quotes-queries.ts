/**
 * lib/carrier-quotes-queries.ts
 * Supabase helpers for carrier quote tracking.
 */

import { createClient } from "@/lib/supabase"

type SupabaseClient = ReturnType<typeof createClient>

// ─── Types ─────────────────────────────────────────────────────────────────

export type CarrierQuoteStatus = "sent" | "responded" | "expired" | "declined"

export interface CarrierQuoteRequest {
  id: number
  freightRequestId: string
  carrierId: number
  carrierName: string
  carrierEmail: string
  emailThreadId: string
  emailMessageId: string | null
  status: CarrierQuoteStatus
  sentAt: string
  respondedAt: string | null
  quote: CarrierQuote | null
}

export interface CarrierQuote {
  id: number
  carrierId: number
  carrierName: string
  rateUsd: number | null
  rateCurrency: string
  rateOriginal: number | null
  transitDays: number | null
  validityDate: string | null
  freeDays: number | null
  notes: string | null
  receivedAt: string
  /** true = linked automatically, false = linked by a user, null = unknown / older data */
  linkedByAi: boolean | null
  linkMethod: string | null
  linkedBy: string | null
  /** Extended extraction fields (migration 040). All optional / null when the carrier did not state them. */
  ext: CarrierQuoteExt
}

export interface QuoteFlag { code: string; field: string | null; severity: "info" | "warn" | "error"; message: string }
export interface ChargeLineView {
  carrier_label?: string | null; canonical_code?: string | null; category?: string | null
  basis?: string | null; unit_rate?: number | null; quantity?: number | null; amount?: number | null
  currency?: string | null; inclusion?: string | null; condition_note?: string | null
}

export interface CarrierQuoteExt {
  carrierQuoteRef?: string | null
  responseType?: string | null
  quoteStatus?: string | null
  version?: number | null
  mode?: string | null
  serviceLevel?: string | null
  quoteDate?: string | null
  validFrom?: string | null
  isAllIn?: boolean | null
  taxIncluded?: boolean | null
  taxAmount?: number | null
  totalAmount?: number | null
  totalAmountStated?: number | null
  minimumCharge?: number | null
  commodity?: string | null
  hsCode?: string | null
  pieces?: number | null
  packagingType?: string | null
  grossWeight?: number | null
  weightUnit?: string | null
  grossWeightKg?: number | null
  volumeCbm?: number | null
  volumetricWeightKg?: number | null
  chargeableWeight?: number | null
  chargeableWeightStated?: number | null
  chargeableUnit?: string | null
  chargeableBasis?: string | null
  stackable?: boolean | null
  declaredValue?: number | null
  temperatureControl?: string | null
  hazmat?: Record<string, unknown> | null
  specialHandling?: string | null
  containerType?: string | null
  containerCount?: number | null
  originPlace?: string | null
  destinationPlace?: string | null
  incoterm?: string | null
  incotermPlace?: string | null
  pickupAddress?: string | null
  intakeSource?: string | null
  etd?: string | null
  eta?: string | null
  frequency?: string | null
  directOrConnecting?: string | null
  equipmentType?: string | null
  spaceConfirmed?: boolean | null
  freeDaysDemurrage?: number | null
  freeDaysDetention?: number | null
  perDiemNote?: string | null
  charges?: ChargeLineView[] | null
  paymentTerms?: string | null
  insuranceOffered?: boolean | null
  liabilityLimit?: string | null
  cancellationTerms?: string | null
  exclusions?: string | null
  subjectToConditions?: string | null
  requiredDocuments?: string | null
  reviewStatus?: string | null
  validationFlags?: QuoteFlag[]
  modeDetails?: Record<string, unknown> | null
}

/** Maps a raw carrier_quotes row (select *) to the extended view model. Missing columns just become undefined. */
export function mapQuoteExt(q: any): CarrierQuoteExt {
  const n = (v: any) => (v === null || v === undefined ? null : Number(v))
  return {
    carrierQuoteRef: q.carrier_quote_ref ?? null, responseType: q.response_type ?? null,
    quoteStatus: q.quote_status ?? null, version: n(q.version), mode: q.mode ?? null,
    serviceLevel: q.service_level ?? null, quoteDate: q.quote_date ?? null, validFrom: q.valid_from ?? null,
    isAllIn: q.is_all_in ?? null, taxIncluded: q.tax_included ?? null, taxAmount: n(q.tax_amount),
    totalAmount: n(q.total_amount), totalAmountStated: n(q.total_amount_stated), minimumCharge: n(q.minimum_charge),
    commodity: q.commodity_description ?? null, hsCode: q.hs_code ?? null, pieces: n(q.pieces),
    packagingType: q.packaging_type ?? null, grossWeight: n(q.gross_weight), weightUnit: q.weight_unit ?? null,
    grossWeightKg: n(q.gross_weight_kg), volumeCbm: n(q.volume_cbm), volumetricWeightKg: n(q.volumetric_weight_kg),
    chargeableWeight: n(q.chargeable_weight), chargeableWeightStated: n(q.chargeable_weight_stated),
    chargeableUnit: q.chargeable_unit ?? null, chargeableBasis: q.chargeable_basis ?? null,
    stackable: q.stackable ?? null, declaredValue: n(q.declared_value), temperatureControl: q.temperature_control ?? null,
    hazmat: q.hazmat ?? null, specialHandling: q.special_handling ?? null, containerType: q.container_type ?? null,
    containerCount: n(q.container_count), originPlace: q.origin_place ?? null, destinationPlace: q.destination_place ?? null,
    incoterm: q.incoterm ?? null, incotermPlace: q.incoterm_place ?? null, pickupAddress: q.pickup_address ?? null, intakeSource: q.intake_source ?? null, etd: q.etd ?? null, eta: q.eta ?? null,
    frequency: q.frequency ?? null, directOrConnecting: q.direct_or_connecting ?? null,
    equipmentType: q.equipment_type ?? null, spaceConfirmed: q.space_confirmed ?? null,
    freeDaysDemurrage: n(q.free_days_demurrage), freeDaysDetention: n(q.free_days_detention),
    perDiemNote: q.per_diem_note ?? null, charges: Array.isArray(q.charges) ? q.charges : null,
    paymentTerms: q.payment_terms ?? null, insuranceOffered: q.insurance_offered ?? null,
    liabilityLimit: q.liability_limit ?? null, cancellationTerms: q.cancellation_terms ?? null,
    exclusions: q.exclusions ?? null, subjectToConditions: q.subject_to_conditions ?? null,
    requiredDocuments: q.required_documents ?? null, reviewStatus: q.review_status ?? null,
    validationFlags: Array.isArray(q.validation_flags) ? q.validation_flags : [],
    modeDetails: q.mode_details ?? null,
  }
}

export interface SendRfqPayload {
  freightRequestId: string
  carrierIds: number[]
  n8nWebhookUrl: string
}

// ─── Fetch quotes for a specific freight request ────────────────────────────

export async function fetchQuotesForRequest(
  _supabase: SupabaseClient,
  freightRequestId: string,
): Promise<CarrierQuoteRequest[]> {
  // Loaded through the API (service role): the portal has its own session cookie, so the
  // browser Supabase client is blocked by row-level security and would return nothing.
  let data: any[] = []
  try {
    const res = await fetch(`/api/carrier-quotes/for-request?freight_request_id=${encodeURIComponent(freightRequestId)}`, { cache: "no-store" })
    if (!res.ok) {
      console.error("[carrier-quotes] fetchQuotesForRequest:", res.status)
      return []
    }
    data = (await res.json()).rows ?? []
  } catch (e) {
    console.error("[carrier-quotes] fetchQuotesForRequest:", e)
    return []
  }

  return data.map((row: any) => ({
    id: row.id,
    freightRequestId: row.freight_request_id,
    carrierId: row.carrier_id,
    carrierName: row.carriers?.carrier_name ?? "Unknown Carrier",
    carrierEmail: row.carriers?.email ?? "",
    emailThreadId: row.email_thread_id,
    emailMessageId: row.email_message_id,
    status: row.status as CarrierQuoteStatus,
    sentAt: row.sent_at,
    respondedAt: row.responded_at,
    quote: row.carrier_quotes?.[0]
      ? {
          id: row.carrier_quotes[0].id,
          carrierId: row.carrier_quotes[0].carrier_id,
          carrierName: row.carriers?.carrier_name ?? "Unknown",
          rateUsd: row.carrier_quotes[0].rate_usd,
          rateCurrency: row.carrier_quotes[0].rate_currency,
          rateOriginal: row.carrier_quotes[0].rate_original,
          transitDays: row.carrier_quotes[0].transit_days,
          validityDate: row.carrier_quotes[0].validity_date,
          freeDays: row.carrier_quotes[0].free_days,
          notes: row.carrier_quotes[0].notes,
          receivedAt: row.carrier_quotes[0].received_at,
          linkedByAi: row.carrier_quotes[0].linked_by_ai ?? null,
          linkMethod: row.carrier_quotes[0].link_method ?? null,
          linkedBy:   row.carrier_quotes[0].linked_by ?? null,
          ext:        mapQuoteExt(row.carrier_quotes[0]),
        }
      : null,
  }))
}

/** Fetch pending carrier response count for dashboard. */
export async function fetchPendingRfqCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("carrier_quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")

  if (error) return 0
  return count ?? 0
}

/** Send RFQ to selected carriers via the n8n webhook. */
export async function sendRfqToCarriers(payload: SendRfqPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(payload.n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        freight_request_id: payload.freightRequestId,
        carrier_ids: payload.carrierIds,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `The request could not be completed (${res.status}): ${text}` }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Network error" }
  }
}
