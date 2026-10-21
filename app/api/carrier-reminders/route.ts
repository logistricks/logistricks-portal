/**
 * GET  /api/carrier-reminders?request_id=…  → { settings, waiting: [...] }   carriers still waiting on this request's rate request
 * POST /api/carrier-reminders { request_id, rfq_id? }                       → sends the reminder now (to one carrier, or to all waiting); operators and admins
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { findWaiting, loadReminderSettings, remindNow } from "@/lib/carrier-reminders"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const requestId = req.nextUrl.searchParams.get("request_id")
  if (!requestId) return NextResponse.json({ error: "request_id required" }, { status: 400 })
  const admin = adminClient(), cc = s.session.clientCode
  const settings = await loadReminderSettings(admin, cc)
  const waiting = await findWaiting(admin, cc, settings, { requestId }).catch(() => [])
  return NextResponse.json({
    settings,
    waiting: waiting.map(({ rfq_id, carrier_name, hours_waiting, sent_count, last_sent_at, next_due_at, due }) => ({ rfq_id, carrier_name, hours_waiting, sent_count, last_sent_at, next_due_at, due })),
  })
}

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers can't send reminders." }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b?.request_id) return NextResponse.json({ error: "request_id required" }, { status: 400 })
  const res = await remindNow(adminClient(), s.session.clientCode, s.session.username, { requestId: String(b.request_id), rfqId: b.rfq_id != null ? Number(b.rfq_id) : undefined })
  if (!res.sent && res.failed.length) return NextResponse.json({ ...res, error: res.failed[0] }, { status: 502 })
  return NextResponse.json({ ok: true, ...res })
}
