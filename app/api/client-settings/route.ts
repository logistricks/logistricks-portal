/**
 * app/api/client-settings/route.ts
 *
 * GET  /api/client-settings?key=theme   → returns { value: {...} } or {} if not set
 * PUT  /api/client-settings             → body { key, value } → upserts the setting
 *
 * Only authenticated sessions can access their own client's settings.
 * Writes are restricted to admin role only.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"

interface Session {
  username:   string
  clientCode: string
  userId:     string
  role:       string
  exp:        number
}

function getSession(cookie: string): Session | null {
  try {
    const dotIndex = cookie.lastIndexOf(".")
    if (dotIndex === -1) return null
    const payload  = cookie.slice(0, dotIndex)
    const sig      = cookie.slice(dotIndex + 1)
    const expected = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .update(payload).digest("base64url")
    if (expected !== sig) return null
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!data.username || !data.clientCode || !data.exp) return null
    if (Date.now() > data.exp) return null
    return data as Session
  } catch {
    return null
  }
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 })

  const key = req.nextUrl.searchParams.get("key")
  if (!key) return NextResponse.json({ error: "Missing key param" }, { status: 400 })

  const { data, error } = await adminClient()
    .from("client_settings")
    .select("value")
    .eq("client_code", session.clientCode)
    .eq("key", key)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ value: data?.value ?? null })
}

export async function PUT(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const session = getSession(cookie)
  if (!session) return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 })

  // Only admins can write settings
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.key || body.value === undefined) {
    return NextResponse.json({ error: "Missing key or value" }, { status: 400 })
  }

  const { error } = await adminClient()
    .from("client_settings")
    .upsert(
      { client_code: session.clientCode, key: body.key, value: body.value, updated_at: new Date().toISOString() },
      { onConflict: "client_code,key" },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
