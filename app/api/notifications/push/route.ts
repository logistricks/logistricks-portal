/**
 * app/api/notifications/push/route.ts
 *
 * POST — send a push notification to all subscribers of a client.
 *        Called by n8n after a new request is created.
 *        Auth: X-Portal-Secret header (same secret as auto-reply endpoint).
 *
 * Body: {
 *   client_code: string,
 *   title: string,
 *   body?: string,
 *   url?: string,
 *   notification_id?: string   -- optional: mark a DB notification as the source
 * }
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sendPushNotification } from "@/lib/web-push"

export async function POST(req: NextRequest) {
  // Auth: either portal session cookie or X-Portal-Secret header
  const secret = req.headers.get("x-portal-secret")
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    client_code?: string
    title?: string
    body?: string
    url?: string
    notification_id?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { client_code, title } = body
  if (!client_code || !title) {
    return NextResponse.json({ error: "client_code and title required" }, { status: 400 })
  }

  const admin = adminClient()
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("client_code", client_code)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  const payload = {
    title: body.title!,
    body: body.body,
    url: body.url || "/dashboard",
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
