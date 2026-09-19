/**
 * app/api/activity/route.ts
 * GET  — list activity log entries for the authenticated client.
 * POST — insert a manual entry (for external callers like n8n).
 */

import { createHmac } from "crypto"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getSession(cookie: string): { username: string; clientCode: string } | null {
  const dotIndex = cookie.lastIndexOf(".")
  if (dotIndex < 0) return null
  const payload  = cookie.slice(0, dotIndex)
  const sig      = cookie.slice(dotIndex + 1)
  const expected = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(payload)
    .digest("base64url")
  if (expected !== sig) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!data.username || !data.clientCode || !data.exp) return null
    if (Date.now() > data.exp) return null
    return { username: data.username, clientCode: data.clientCode }
  } catch {
    return null
  }
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function auth(req: NextRequest): { username: string; clientCode: string } | null {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return null
  return getSession(cookie)
}

const CATEGORY_EVENTS: Record<string, string[]> = {
  Requests:  ["request_received", "request_status_changed"],
  Carriers:  ["carrier_added", "carrier_updated", "carrier_deleted"],
  Templates: ["template_created", "template_updated", "template_deleted"],
}

export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url      = new URL(req.url)
  const category = url.searchParams.get("category") ?? "All"
  const range    = url.searchParams.get("range")    ?? "7d"
  const limit    = Math.min(Number(url.searchParams.get("limit") ?? 200), 500)

  let query = admin()
    .from("activity_log")
    .select("*")
    .eq("client_code", session.clientCode)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (category !== "All" && CATEGORY_EVENTS[category]) {
    query = query.in("event_type", CATEGORY_EVENTS[category])
  }

  if (range !== "all") {
    const now  = new Date()
    let since: Date
    if (range === "today") {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else {
      const days = range === "7d" ? 7 : 30
      since = new Date(Date.now() - days * 86_400_000)
    }
    query = query.gte("created_at", since.toISOString())
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((row) => {
    let cat = "Other"
    for (const [c, types] of Object.entries(CATEGORY_EVENTS)) {
      if (types.includes(row.event_type)) { cat = c; break }
    }
    return { ...row, category: cat }
  })

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.event_type || !body?.description) {
    return NextResponse.json({ error: "event_type and description required" }, { status: 400 })
  }

  const { error } = await admin().from("activity_log").insert({
    client_code: session.clientCode,
    event_type:  body.event_type,
    actor:       body.actor       ?? session.username,
    description: body.description,
    request_id:  body.request_id  ?? null,
    meta:        body.meta        ?? {},
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}
