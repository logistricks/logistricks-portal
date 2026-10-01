/**
 * lib/carrier-quote-guards.ts
 * Server-only helpers shared by the carrier-quote link / unlink / delete routes.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient, type SessionData } from "@/lib/api-session"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Admin = any

/**
 * Session + role check for routes that change quotes.
 * Returns the session and an admin client, or a ready-made error response.
 */
export async function requireOperator(
  req: NextRequest,
): Promise<{ session: SessionData; admin: Admin } | NextResponse> {
  const cookie  = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = adminClient()
  const { data: user } = await admin
    .from("portal_users")
    .select("role")
    .eq("client_code", session.clientCode)
    .eq("username", session.username)
    .maybeSingle()
  if (user?.role === "viewer")
    return NextResponse.json({ error: "Viewers can't change quotes." }, { status: 403 })

  return { session, admin }
}

/** Closed or completed requests are frozen. Returns the reason, or null if editable. */
export function lockedReason(r: { status?: string | null; is_done?: boolean | null }): string | null {
  if (r.is_done)            return "This request is completed, so its quotes can no longer be changed."
  if (r.status === "Closed") return "This request is closed, so its quotes can no longer be changed."
  return null
}

/** A quotation already sent to the requester was built from this quote: leave it alone. */
export async function sentQuotationBlock(admin: Admin, quoteId: number): Promise<string | null> {
  const { count } = await admin
    .from("quotations")
    .select("id", { count: "exact", head: true })
    .eq("carrier_quote_id", quoteId)
    .eq("status", "sent")
  return (count ?? 0) > 0
    ? "A quotation built from this quote has already been sent to the requester, so it can't be changed."
    : null
}

/**
 * Call after a quote has left an RFQ row (unlinked or deleted).
 *  - RFQ rows the system created for a manual link (no rfq_reference) are removed.
 *  - Real RFQ rows go back to "sent" so the carrier shows as awaiting a reply.
 * Does nothing if another quote still uses the row.
 */
export async function releaseRfqRow(admin: Admin, rfqRowId: number | null): Promise<void> {
  if (!rfqRowId) return

  const { count } = await admin
    .from("carrier_quotes")
    .select("id", { count: "exact", head: true })
    .eq("carrier_quote_request_id", rfqRowId)
  if ((count ?? 0) > 0) return

  const { data: row } = await admin
    .from("carrier_quote_requests")
    .select("id, rfq_reference")
    .eq("id", rfqRowId)
    .maybeSingle()
  if (!row) return

  if (row.rfq_reference) {
    await admin
      .from("carrier_quote_requests")
      .update({ status: "sent", responded_at: null })
      .eq("id", rfqRowId)
      .eq("status", "responded")
  } else {
    await admin.from("carrier_quote_requests").delete().eq("id", rfqRowId)
  }
}
