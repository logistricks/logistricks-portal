/**
 * GET|POST /api/cron/reminders — sends the reminder emails that are due. Safe to call as often as you like (every 15 minutes
 * is plenty): nothing is ever sent twice. Auth: X-Portal-Secret, or Vercel Cron's  Authorization: Bearer CRON_SECRET.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { runReminders } from "@/lib/task-emails"
import { runApprovalReminders } from "@/lib/approval-reminders"
import { logEvent } from "@/lib/system-events"
import { runCarrierReminders } from "@/lib/carrier-reminders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

async function handle(req: NextRequest) {
  const portal = process.env.PORTAL_WEBHOOK_SECRET, cron = process.env.CRON_SECRET
  const ok = (portal && req.headers.get("x-portal-secret") === portal) || (cron && req.headers.get("authorization") === `Bearer ${cron}`)
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { const admin = adminClient(); const report = await runReminders(admin); const approvals = await runApprovalReminders(admin).catch(() => []); const carriers = await runCarrierReminders(admin).catch(async (e: any) => { await logEvent(admin, { kind: "cron_failed", title: "Carrier reminders failed to run", message: String(e?.message ?? e) }); return [{ error: String(e?.message ?? e) }] }); return NextResponse.json({ ok: true, report, approvals, carriers }) }
  catch (e: any) { await logEvent(adminClient(), { kind: "cron_failed", title: "The scheduled reminder run failed", message: String(e?.message ?? e) }); return NextResponse.json({ ok: false, error: e?.message ?? "failed" }, { status: 500 }) }
}
export const GET = handle
export const POST = handle
