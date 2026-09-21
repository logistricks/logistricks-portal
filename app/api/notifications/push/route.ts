/**
 * app/api/notifications/push/route.ts
 *
 * POST — send a push notification to all subscribers of a client.
 *        Called by Supabase Database Hook (on notifications INSERT)
 *        or directly by n8n.
 *        Auth: X-Portal-Secret header.
 *
 * Supabase hook body:  { type: "INSERT", table: "notifications", record: { id, client_code, message, ... } }
 * Direct / n8n body:  { client_code, title, body?, url? }
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sendPushNotification } from "@/lib/web-push"

export async function POST(req: NextRequest) {
  // Auth: X-Portal-Secret header
  const secret = req.headers.get("x-portal-secret")
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let raw: Record<string, unknown>
  try { raw = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  // Detect Supabase webhook shape vs direct call
  let client_code: string | undefined
  let title: string
  let bodyText: string | undefined
  let url: string | undefined

  if (raw.type === "INSERT" && raw.record && typeof raw.record === "object") {
    // Supabase Database Hook payload
    const record = raw.record as Record<string, unknown>
    client_code = record.client_code as string | undefined
    title = "New Freight Request"
    bodyText = typeof record.message === "string" ? record.message : undefined
    url = "/requests"
  } else {
    // Direct / n8n call
    client_code = raw.client_code as string | undefined
    title = (raw.title as string | undefined) ?? "New Notification"
    bodyText = raw.body as string | undefined
    url = (raw.url as string | undefined) ?? "/requests"
  }

  if (!client_code) {
    return NextResponse.json({ error: "client_code required" }, { status: 400 })
  }

  const admin = adminClient()
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("client_code", client_code)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  const payload = {
    title,
    body: bodyText,
    url: url || "/requests",
    tag: `logistricks-${Date.now()}`,
  }

  const results = await Promise.allSettled(
    subs.map((sub: { endpoint: string; p256dh: string; auth: string }) =>
      sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      ),
    ),
  )

  // Remove expired/invalid subscriptions (410 Gone)
  const expiredEndpoints: string[] = []
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const err = r.reason as { statusCode?: number }
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        expiredEndpoints.push(subs[i].endpoint)
      }
    }
  })
  if (expiredEndpoints.length > 0) {
    await admin
      .from("push_subscriptions")
      .delete()
      .in("endpoint", expiredEndpoints)
  }

  const sent = results.filter((r) => r.status === "fulfilled").length
  return NextResponse.json({ sent, total: subs.length })
}
