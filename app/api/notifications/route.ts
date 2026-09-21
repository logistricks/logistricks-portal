/**
 * app/api/notifications/route.ts
 *
 * GET  — returns 30 most recent notifications for the client,
 *         with read_at reflecting THIS USER's read state.
 * PATCH — marks one or all notifications as read for THIS USER.
 */
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSession, adminClient } from "@/lib/api-session"

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET() {
  const jar     = await cookies()
  const cookie  = jar.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = adminClient()

  // 1. Fetch the 30 most recent notifications for this client
  const { data: notifs, error: nErr } = await db
    .from("notifications")
    .select("id, type, title, body, request_id, created_at")
    .eq("client_code", session.clientCode)
    .order("created_at", { ascending: false })
    .limit(30)

  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 })
  if (!notifs || notifs.length === 0) return NextResponse.json([])

  // 2. Fetch this user's read records for those notifications
  const ids = notifs.map((n: { id: string }) => n.id)
  const { data: reads } = await db
    .from("notification_reads")
    .select("notification_id, read_at")
    .eq("user_id", session.userId)
    .in("notification_id", ids)

  // 3. Merge: attach per-user read_at to each notification
  const readMap: Record<string, string> = {}
  for (const r of (reads ?? [])) readMap[r.notification_id] = r.read_at

  const result = notifs.map((n: { id: string; type: string; title: string; body: string | null; request_id: string | null; created_at: string }) => ({
    ...n,
    read_at: readMap[n.id] ?? null,
  }))

  return NextResponse.json(result)
}

// ─── PATCH ───────────────────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const jar     = await cookies()
  const cookie  = jar.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const db   = adminClient()

  if (body.read_all) {
    // Mark every unread notification in this client as read for this user
    const { data: unread } = await db
      .from("notifications")
      .select("id")
      .eq("client_code", session.clientCode)

    if (unread && unread.length > 0) {
      const rows = unread.map((n: { id: string }) => ({
        notification_id: n.id,
        user_id:         session.userId,
        read_at:         new Date().toISOString(),
      }))
      await db
        .from("notification_reads")
        .upsert(rows, { onConflict: "notification_id,user_id", ignoreDuplicates: true })
    }
    return NextResponse.json({ ok: true })
  }

  if (body.id) {
    await db
      .from("notification_reads")
      .upsert(
        { notification_id: body.id, user_id: session.userId, read_at: new Date().toISOString() },
        { onConflict: "notification_id,user_id", ignoreDuplicates: true },
      )
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Missing id or read_all" }, { status: 400 })
}
