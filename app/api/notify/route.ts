/**
 * app/api/notify/route.ts — lets n8n (or any workflow) trigger a notification email.
 * Auth: X-Portal-Secret header.
 *
 * Body: { client_code, event, freight_request_id?, values?: {variable: text}, to?: string[] }
 *   event: new_request | sender_reply   (the portal itself sends the carrier and approval ones)
 * The request's own details are loaded from freight_request_id; `values` can add or override any variable.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { notify, requestValues } from "@/lib/notify"

const ALLOWED = new Set(["new_request", "sender_reply"])

export async function POST(req: NextRequest) {
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || req.headers.get("x-portal-secret") !== envSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b || typeof b.client_code !== "string" || !ALLOWED.has(String(b.event))) {
    return NextResponse.json({ error: "client_code and event (new_request | sender_reply) are required" }, { status: 400 })
  }
  const admin = adminClient()
  const reqVals = await requestValues(admin, b.client_code, b.freight_request_id)
  const extra: Record<string, string> = {}
  if (b.values && typeof b.values === "object") for (const [k, v] of Object.entries(b.values)) if (/^\w+$/.test(k) && v != null) extra[k] = String(v).slice(0, 2000)
  const to = Array.isArray(b.to) ? (b.to as unknown[]).map(String) : []
  const r = await notify(admin, b.client_code, b.event, { ...reqVals, ...extra }, { to, requestId: b.freight_request_id ?? null })
  return NextResponse.json({ ok: r.status !== "failed", ...r })
}
