import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"

function getSession(cookie: string) {
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
    return { username: data.username, clientCode: data.clientCode, role: data.role }
  } catch { return null }
}
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
function auth(req: NextRequest) {
  const c = req.cookies.get("portal_session")?.value
  return c ? getSession(c) : null
}

export async function GET(req: NextRequest) {
  const s = auth(req)
  if (!s) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const { data, error } = await admin()
    .from("client_whatsapp_numbers")
    .select("id, number, active, label")
    .eq("client_code", s.clientCode)
    .order("created_at")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const s = auth(req)
  if (!s) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { number, label } = await req.json().catch(() => ({}))
  if (!number?.trim()) return NextResponse.json({ error: "Number required" }, { status: 400 })
  const { data, error } = await admin()
    .from("client_whatsapp_numbers")
    .insert({ client_code: s.clientCode, number: number.trim(), label: label?.trim() || null, active: true })
    .select("id, number, active, label")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const s = auth(req)
  if (!s) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id, active } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const { error } = await admin()
    .from("client_whatsapp_numbers")
    .update({ active })
    .eq("id", id)
    .eq("client_code", s.clientCode)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = auth(req)
  if (!s) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const { error } = await admin()
    .from("client_whatsapp_numbers")
    .delete()
    .eq("id", id)
    .eq("client_code", s.clientCode)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
