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
}

export interface SendRfqPayload {
  freightRequestId: string
  carrierIds: number[]
  n8nWebhookUrl: string
}

// ─── Fetch quotes for a specific freight request ────────────────────────────

export async function fetchQuotesForRequest(
  supabase: SupabaseClient,
  freightRequestId: string,
): Promise<CarrierQuoteRequest[]> {
  const { data, error } = await supabase
    .from("carrier_quote_requests")
    .select(`
      id,
      freight_request_id,
      carrier_id,
      email_thread_id,
      email_message_id,
      status,
      sent_at,
      responded_at,
      carriers ( name, email ),
      carrier_quotes (
        id,
        carrier_id,
        rate_usd,
        rate_currency,
        rate_original,
        transit_days,
        validity_date,
        free_days,
        notes,
        received_at
      )
    `)
    .eq("freight_request_id", freightRequestId)
    .order("sent_at", { ascending: true })

  if (error) {
    console.error("[carrier-quotes] fetchQuotesForRequest:", error.message)
    return []
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    freightRequestId: row.freight_request_id,
    carrierId: row.carrier_id,
    carrierName: row.carriers?.name ?? "Unknown Carrier",
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
          carrierName: row.carriers?.name ?? "Unknown",
          rateUsd: row.carrier_quotes[0].rate_usd,
          rateCurrency: row.carrier_quotes[0].rate_currency,
          rateOriginal: row.carrier_quotes[0].rate_original,
          transitDays: row.carrier_quotes[0].transit_days,
          validityDate: row.carrier_quotes[0].validity_date,
          freeDays: row.carrier_quotes[0].free_days,
          notes: row.carrier_quotes[0].notes,
          receivedAt: row.carrier_quotes[0].received_at,
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
      return { ok: false, error: `n8n returned ${res.status}: ${text}` }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Network error" }
  }
}
