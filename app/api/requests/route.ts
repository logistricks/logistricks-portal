/**
 * app/api/requests/route.ts
 *
 * Returns freight_requests filtered by the clientCode embedded in the
 * signed session cookie. Uses service role key — RLS is bypassed on the
 * server; anon clients cannot query this data at all.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"
import { mapDbToRequest, type DbFreightRequest } from "@/lib/supabase-queries"
import { logActivity } from "@/lib/log-activity"

function getSession(cookie: string): { username: string; clientCode: string } | null {
  try {
    const dotIndex = cookie.lastIndexOf(".")
    if (dotIndex === -1) return null
    const payload = cookie.slice(0, dotIndex)
    const sig = cookie.slice(dotIndex + 1)
    const expected = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .update(payload)
      .digest("base64url")
    if (expected !== sig) return null
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!data.username || !data.clientCode || !data.exp) return null
    if (Date.now() > data.exp) return null
    return { username: data.username, clientCode: data.clientCode }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const session = getSession(sessionCookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data, error } = await admin
    .from("freight_requests")
    .select("*")
    .eq("client_code", session.clientCode)
    .order("received_at", { ascending: false })

  if (error) {
    console.error("[api/requests]", error.message)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  const requests = (data as DbFreightRequest[]).map(mapDbToRequest)
  return NextResponse.json(requests)
}

export async function PATCH(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const session = getSession(sessionCookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, aog, dgr, status } = body as {
    id?: string
    aog?: boolean
    dgr?: boolean
    status?: string
  }

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const VALID_STATUSES = new Set(["Pending", "In Review", "Sent to Carrier", "Quoted", "Closed", "Approved"])

  const patch: Record<string, unknown> = {}
  if (typeof aog === "boolean") patch.aog = aog
  if (typeof dgr === "boolean") patch.dgr = dgr
  if (typeof status === "string" && VALID_STATUSES.has(status)) patch.status = status
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { error } = await admin
    .from("freight_requests")
    .update(patch)
    .eq("id", id)
    .eq("client_code", session.clientCode)

  if (error) {
    console.error("[api/requests PATCH]", error.message)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  // ── Activity log ──────────────────────────────────────────────────────────
  if (patch.status) {
    void logActivity({
      clientCode:  session.clientCode,
      eventType:   "request_status_changed",
      actor:       session.username,
      description: `Request status changed to "${patch.status}"`,
      requestId:   id,
      meta:        { new_status: patch.status },
    })
  } else {
    const flags = Object.entries(patch)
      .map(([k, v]) => `${k.toUpperCase()} ${v ? "on" : "off"}`)
      .join(", ")
    void logActivity({
      clientCode:  session.clientCode,
      eventType:   "request_status_changed",
      actor:       session.username,
      description: `Request flags updated: ${flags}`,
      requestId:   id,
      meta:        patch,
    })
  }

  return NextResponse.json({ ok: true })
}
