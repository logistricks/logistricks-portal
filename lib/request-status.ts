/**
 * lib/request-status.ts
 *
 * Keeps a freight request's status in step with its carrier RFQs and quotes:
 *   RFQ sent to a carrier, no quote yet     → "Sent to Carrier"
 *   at least one active (not disregarded) quote → "Quoted"
 * Only moves requests that are in the carrier stage (Pending / Approved-Carrier / Sent to Carrier / Quoted).
 * Never touches Waiting for Approval, Rejected, Closed or the reply path.
 */
const AUTO = new Set([
  "Pending",
  "Approved - Carrier, Pending Send",
  "Approved - Carrier, Sent",
  "Sent to Carrier",
  "Quoted",
])

export async function syncRequestStatus(admin: any, freightRequestId: string | null | undefined): Promise<string | null> {
  if (!freightRequestId) return null
  const { data: fr } = await admin.from("freight_requests").select("status").eq("id", freightRequestId).maybeSingle()
  if (!fr || !AUTO.has(fr.status)) return null

  const { count: rfqs } = await admin
    .from("carrier_quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("freight_request_id", freightRequestId)
  if (!rfqs) return null

  // Only real quotes count — not declines, info requests or auto-replies.
  // Disregarded quotes (migration 059) do not count either: no active quote left → back to "Sent to Carrier".
  let q = await admin
    .from("carrier_quotes")
    .select("id", { count: "exact", head: true })
    .eq("freight_request_id", freightRequestId)
    .eq("disregarded", false)
    .or("response_type.is.null,response_type.in.(quote,update,counter_offer)")
  if (q.error) q = await admin
    .from("carrier_quotes")
    .select("id", { count: "exact", head: true })
    .eq("freight_request_id", freightRequestId)
    .or("response_type.is.null,response_type.in.(quote,update,counter_offer)")
  if (q.error) {
    // response_type column missing (migration 040 not run): count every linked quote.
    q = await admin.from("carrier_quotes").select("id", { count: "exact", head: true }).eq("freight_request_id", freightRequestId)
  }

  const next = (q.count ?? 0) > 0 ? "Quoted" : "Sent to Carrier"
  if (next === fr.status) return next
  const { error } = await admin.from("freight_requests").update({ status: next }).eq("id", freightRequestId)
  return error ? null : next
}

/** Number of active (not disregarded, real-quote) carrier quotes per freight request id. Missing columns degrade gracefully. */
export async function activeQuoteCounts(admin: any, ids: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (!ids.length) return out
  const run = async (cols: string, filtered: boolean) => {
    let q = admin.from("carrier_quotes").select(cols).in("freight_request_id", ids)
    if (filtered) q = q.eq("disregarded", false)
    return q
  }
  let r = await run("freight_request_id, response_type", true)
  if (r.error) r = await run("freight_request_id, response_type", false)
  if (r.error) r = await run("freight_request_id", false)
  if (r.error) return out
  for (const row of (r.data ?? []) as { freight_request_id: string; response_type?: string | null }[]) {
    const t = row.response_type
    if (t && !["quote", "update", "counter_offer"].includes(t)) continue
    out[row.freight_request_id] = (out[row.freight_request_id] ?? 0) + 1
  }
  return out
}
