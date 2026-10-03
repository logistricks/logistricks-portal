/** Server-only: builds the variables for the portal's own notification events and fires them. */
import { fmtDate } from "@/lib/quotation-render"
import { listBlock, money, notify, portalBaseUrl, requestValues, emailsForUsernames } from "@/lib/notify"

const REASONS: Record<string, [string, string]> = {
  carrier_not_recognised: ["Quote from an unknown sender", "The sender isn't one of your saved carriers, so the quote couldn't be linked to a request."],
  no_matching_rfq: ["Quote couldn't be linked", "The quote doesn't match any request-for-quotation that was sent to this carrier."],
  no_reference_found: ["Quote couldn't be linked", "No request reference was found in the carrier's email, so it couldn't be linked automatically."],
  decline: ["Carrier declined to quote", "The carrier replied that they can't or won't quote this shipment."],
  info_request: ["Carrier has a question", "The carrier asked for more information before they can quote."],
  needs_review: ["Quote needs review", "The quote failed one or more automatic checks, so a person should confirm it before using the price."],
}

export async function notifyCarrierQuote(admin: any, a: {
  clientCode: string; kind: "received" | "attention"; reason?: keyof typeof REASONS | string
  requestId?: string | null; carrierPk?: number | null; body: Record<string, any>; quote: Record<string, any>
  ext: Record<string, any>; flags: { message?: string }[]
}) {
  try {
    const [reqVals, carrier] = await Promise.all([
      requestValues(admin, a.clientCode, a.requestId),
      a.carrierPk ? admin.from("carriers").select("carrier_name").eq("id", a.carrierPk).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const b = a.body, cur = String(a.quote.rate_currency || "USD").toUpperCase()
    const amount = a.quote.rate_usd ?? a.ext.total_amount ?? a.quote.rate_original
    const [title, reason] = REASONS[a.reason ?? ""] ?? ["Quote needs attention", "A carrier reply needs a person to look at it."]
    const flagTexts = (a.flags ?? []).map((f) => String(f.message ?? "")).filter(Boolean)
    const values: Record<string, string> = {
      ...reqVals,
      carrier_name: carrier.data?.carrier_name ?? String(b.from_email ?? b.carrier_email ?? "Unknown carrier"),
      carrier_email: String(b.from_email ?? b.carrier_email ?? ""),
      quote_price: money(amount, cur), quote_mode: String(a.ext.mode ?? b.mode ?? "").replace(/^./, (c) => c.toUpperCase()),
      transit_days: a.quote.transit_days != null ? String(a.quote.transit_days) : "", validity_date: fmtDate(a.quote.validity_date),
      quote_status: String(a.ext.quote_status ?? "").replace(/_/g, " "), review_status: a.ext.review_status === "auto_accepted" ? "Accepted automatically" : "Needs review",
      rfq_reference: String(b.rfq_reference ?? ""), email_subject: String(b.email_subject ?? ""),
      quote_url: a.requestId ? `${portalBaseUrl()}/requests/${a.requestId}` : `${portalBaseUrl()}/unlinked-quotes`,
      attention_title: title, attention_reason: reason,
    }
    await notify(admin, a.clientCode, a.kind === "received" ? "carrier_quote_received" : "carrier_quote_attention", values, {
      blocks: { flags_list: listBlock(flagTexts) }, requestId: a.requestId ?? null,
    })
  } catch (e) { console.error("[notify] carrier quote:", (e as Error).message) }
}

export async function notifyApprovalRequested(admin: any, a: { clientCode: string; requestId: string; usernames: string[]; step: number; submittedBy: string; mode?: string }) {
  try {
    const to = await emailsForUsernames(admin, a.clientCode, a.usernames)
    const vals = await requestValues(admin, a.clientCode, a.requestId)
    await notify(admin, a.clientCode, "approval_requested", { ...vals, approval_step: String(a.step), submitted_by: a.submittedBy, approval_mode: a.mode === "notify_only" ? "For your information" : "Approval required" }, { to, requestId: a.requestId })
  } catch (e) { console.error("[notify] approval requested:", (e as Error).message) }
}

export async function notifyApprovalDecided(admin: any, a: { clientCode: string; requestId: string; submitter: string; decision: "approved" | "rejected"; decidedBy: string; notes?: string | null }) {
  try {
    const to = await emailsForUsernames(admin, a.clientCode, [a.submitter])
    const vals = await requestValues(admin, a.clientCode, a.requestId)
    await notify(admin, a.clientCode, "approval_decided", { ...vals, decision: a.decision, decided_by: a.decidedBy, decision_notes: a.notes ?? "", submitted_by: a.submitter }, { to, requestId: a.requestId })
  } catch (e) { console.error("[notify] approval decided:", (e as Error).message) }
}
