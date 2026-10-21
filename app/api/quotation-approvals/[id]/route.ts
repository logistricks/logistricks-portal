/** PATCH /api/quotation-approvals/[id] { action: "approve" | "reject", notes? } — an approver's decision on an active quotation approval step. */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { decideQuotationApproval } from "@/lib/quotation-approval"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => null)
  if (b?.action !== "approve" && b?.action !== "reject") return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 })
  const r = await decideQuotationApproval(adminClient(), s.session.clientCode, s.session.username, id, b.action, typeof b.notes === "string" ? b.notes.trim() || null : null)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, next: r.next })
}
