import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { purgeTrialData } from "@/lib/trial-server"

export const runtime = "nodejs"

/** Daily clean-up: deletes parsed trial content 5 days after a lead's last activity. Vercel Cron sends the CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await purgeTrialData(adminClient())
  return NextResponse.json({ ok: true })
}
