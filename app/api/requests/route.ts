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
import { activeQuoteCounts } from "@/lib/request-status"
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

  const rows = data as DbFreightRequest[]
  const counts = await activeQuoteCounts(admin, rows.filter((r) => r.status === "Quoted" || r.status === "Sent to Carrier").map((r) => r.id)).catch(() => ({} as Record<string, number>))
  const requests = rows.map((r) => ({ ...mapDbToRequest(r), activeQuoteCount: counts[r.id] ?? 0 }))
  return NextResponse.json(requests)
}

export async function PATCH(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const session = getSession(sessionCookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, aog, dgr, status, fields } = body as {
    id?: string
    aog?: boolean
    dgr?: boolean
    status?: string
    // Cargo field edits (keys must be in EDITABLE_FIELDS allowlist)
    fields?: Record<string, string>
  }

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Cargo fields that an operator is allowed to manually edit
  const EDITABLE_FIELDS = new Set([
    "cargo_type", "weight", "quantity", "dimensions",
    "equipment", "incoterm", "bl_type", "preferred_carrier",
    "origin_city", "origin_country", "destination_city", "destination_country",
    "pickup_address",
  ])

  const VALID_STATUSES = new Set(["Pending", "Waiting for Approval", "Rejected", "Approved - Carrier, Pending Send", "Approved - Carrier, Sent", "Approved - Reply, Pending Send", "Approved - Reply, Sent", "Sent to Carrier", "Quoted", "Closed"])

  const patch: Record<string, unknown> = {}
  if (typeof aog === "boolean") patch.aog = aog
  if (typeof dgr === "boolean") patch.dgr = dgr
  if (typeof status === "string" && VALID_STATUSES.has(status)) patch.status = status
  if (fields && typeof fields === "object") {
    for (const [key, val] of Object.entries(fields)) {
      if (EDITABLE_FIELDS.has(key) && typeof val === "string") {
        patch[key] = val.trim() || null
      }
    }
  }
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
  } else if (fields && Object.keys(fields).length > 0) {
    void logActivity({
      clientCode:  session.clientCode,
      eventType:   "request_field_edited",
      actor:       session.username,
      description: `Request fields edited: ${Object.keys(fields).join(", ")}`,
      requestId:   id,
      meta:        fields,
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
