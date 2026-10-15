/**
 * GET|POST /api/cron/reminders — sends the reminder emails that are due. Safe to call as often as you like (every 15 minutes
 * is plenty): nothing is ever sent twice. Auth: X-Portal-Secret, or Vercel Cron's  Authorization: Bearer CRON_SECRET.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { runReminders } from "@/lib/task-emails"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

async function handle(req: NextRequest) {
  const portal = process.env.PORTAL_WEBHOOK_SECRET, cron = process.env.CRON_SECRET
  const ok = (portal && req.headers.get("x-portal-secret") === portal) || (cron && req.headers.get("authorization") === `Bearer ${cron}`)
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json({ ok: true, report: await runReminders(adminClient()) }) }
  catch (e: any) { return NextResponse.json({ ok: false, error: e?.message ?? "failed" }, { status: 500 }) }
}
export const GET = handle
export const POST = handle
