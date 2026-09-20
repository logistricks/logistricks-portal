/**
 * app/api/notifications/subscribe/route.ts
 *
 * POST — save a Web Push subscription for this client
 *        Body: { endpoint, p256dh, auth }
 *
 * DELETE — remove a push subscription
 *          Body: { endpoint }
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { endpoint?: string; p256dh?: string; auth?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { endpoint, p256dh, auth } = body
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "endpoint, p256dh and auth are required" }, { status: 400 })
  }

  const admin = adminClient()
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      { client_code: session.clientCode, endpoint, p256dh, auth },
      { onConflict: "endpoint" },
    )

  if (error) {
    console.error("[api/notifications/subscribe POST]", error.message)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { endpoint?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 })

  const admin = adminClient()
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint)
    .eq("client_code", session.clientCode)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
