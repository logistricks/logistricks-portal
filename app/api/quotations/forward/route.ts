/**
 * POST /api/quotations/forward   { quotation_id }
 *   Sends a built quotation to the ORIGINAL SENDER of the request through the client's own SMTP server (automatic send).
 *   POST { quotation_id, manual: true } logs a quotation the user sent themselves from their own mailbox.
 *   The work is in lib/quotation-send.ts (also used for the automatic send after a quotation approval).
 *   A quotation that needs approval (Settings → Approval Workflow) is refused until it is approved.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { sendQuotationToRequester } from "@/lib/quotation-send"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const sr = await sessionWithRole(req)
  if (!sr) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (sr.role === "viewer") return NextResponse.json({ error: "Viewers can't send quotations" }, { status: 403 })
  const body = await req.json().catch(() => null)
  const qid = Number(body?.quotation_id)
  if (!qid) return NextResponse.json({ error: "quotation_id required" }, { status: 400 })
  const r = await sendQuotationToRequester(adminClient(), sr.session.clientCode, sr.session.username, qid, {
    manual: body?.manual === true, confirmExpired: body?.confirm_expired === true, confirmChecks: body?.confirm_checks === true,
  })
  return NextResponse.json(r.json, { status: r.status })
}
