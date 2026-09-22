/**
 * app/api/auto-reply-logs/route.ts
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function getSession(cookie: string): { username: string; clientCode: string } | null {
  try {
    const dotIndex = cookie.lastIndexOf(".")
    if (dotIndex === -1) return null
    const payload = cookie.slice(0, dotIndex)
    const sig     = cookie.slice(dotIndex + 1)
    const expected = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .update(payload).digest("base64url")
    if (expected !== sig) return null
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!data.username || !data.clientCode || !data.exp) return null
    if (Date.now() > data.exp) return null
    return { username: data.username, clientCode: data.clientCode }
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const session = getSession(sessionCookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type  = searchParams.get("type")
  const range = searchParams.get("range") ?? "30d"

  const cutoff: Record<string, string | null> = {
    today: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    "7d":  new Date(Date.now() - 7  * 86_400_000).toISOString(),
    "30d": new Date(Date.now() - 30 * 86_400_000).toISOString(),
    all:   null,
  }
  const since = cutoff[range] ?? cutoff["30d"]

  const admin = adminClient()
  let query = admin
    .from("auto_reply_logs")
    .select("*")
    .eq("client_code", session.clientCode)
    .order("created_at", { ascending: false })
    .limit(500)

  if (type) query = query.eq("log_type", type)
  if (since) query = query.gte("created_at", since)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

const VALID_TYPES = new Set(["acknowledgement", "missing_fields", "carrier"])

export async function POST(req: NextRequest) {
  const secret    = req.headers.get("x-portal-secret")
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || secret !== envSecret)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { client_code, log_type, sender_email, sender_name, subject, request_id, meta } =
    body as Record<string, unknown>

  if (!client_code || typeof client_code !== "string")
    return NextResponse.json({ error: "client_code required" }, { status: 400 })
  if (!log_type || !VALID_TYPES.has(String(log_type)))
    return NextResponse.json({ error: "log_type must be acknowledgement|missing_fields|carrier" }, { status: 400 })
  if (!sender_email || typeof sender_email !== "string")
    return NextResponse.json({ error: "sender_email required" }, { status: 400 })

  const { error } = await adminClient()
    .from("auto_reply_logs")
    .insert({
      client_code,
      log_type:     String(log_type),
      sender_email: String(sender_email),
      sender_name:  sender_name  ? String(sender_name)  : null,
      subject:      subject      ? String(subject)      : null,
      request_id:   request_id   ? String(request_id)   : null,
      meta:         typeof meta === "object" && meta !== null ? meta : {},
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
