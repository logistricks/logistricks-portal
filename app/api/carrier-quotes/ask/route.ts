/**
 * GET  /api/carrier-quotes/ask?id=<carrier_quote_id> → the ready-made email asking the carrier to fix the quote
 * POST /api/carrier-quotes/ask { id, subject?, body? } → sends it (operators and admins), through the company's email server
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { draftAsk, sendAsk } from "@/lib/carrier-ask"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const d = await draftAsk(adminClient(), s.session.clientCode, id, { sender: s.session.username })
  if ("error" in d) return NextResponse.json({ error: d.error }, { status: 400 })
  return NextResponse.json(d)
}

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers can't send emails to carriers." }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b?.id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const admin = adminClient(), cc = s.session.clientCode
  const d = await draftAsk(admin, cc, b.id, { sender: s.session.username })
  if ("error" in d) return NextResponse.json({ error: d.error }, { status: 400 })
  const out = await sendAsk(admin, cc, b.id, d, "manual", s.session.username, { subject: typeof b.subject === "string" ? b.subject : undefined, body: typeof b.body === "string" ? b.body : undefined })
  if (!out.ok) return NextResponse.json({ sent: false, error: out.error }, { status: 502 })
  return NextResponse.json({ sent: true, to: d.to })
}
