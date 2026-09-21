/**
 * app/api/notifications/subscribe/route.ts
 *
 * POST   — upsert a push subscription for this user's device.
 * DELETE — remove this device's push subscription.
 *
 * Subscriptions are keyed by endpoint (globally unique per browser/device),
 * and also tied to user_id so each person's devices are tracked separately.
 */
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSession, adminClient } from "@/lib/api-session"

export async function POST(req: Request) {
  const jar     = await cookies()
  const cookie  = jar.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.endpoint || !body?.p256dh || !body?.auth) {
    return NextResponse.json({ error: "Missing subscription fields" }, { status: 400 })
  }

  const db = adminClient()
  const { error } = await db
    .from("push_subscriptions")
    .upsert(
      {
        endpoint:    body.endpoint,
        p256dh:      body.p256dh,
        auth:        body.auth,
        client_code: session.clientCode,
        user_id:     session.userId,
      },
      { onConflict: "endpoint" },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const jar     = await cookies()
  const cookie  = jar.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 })
  }

  const db = adminClient()
  // Delete only the subscription that belongs to this user's device
  await db
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint)
    .eq("user_id", session.userId)

  return NextResponse.json({ ok: true })
}
