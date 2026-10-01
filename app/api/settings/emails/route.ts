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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Is this mailbox already used by ANY client (receiver emails or connected sources)? Never reveals which. */
async function mailboxTaken(email: string): Promise<boolean> {
  const a = admin()
  const lower = email.toLowerCase()
  const [r, m] = await Promise.all([
    a.from("client_receiver_emails").select("id").ilike("r_mail", lower).limit(1),
    a.from("email_sources").select("id").or(`ms_email.ilike.${lower},imap_username.ilike.${lower}`).limit(1),
  ])
  return (r.data?.length ?? 0) > 0 || (m.data?.length ?? 0) > 0
}

export async function GET(req: NextRequest) {
  const s = auth(req)
  if (!s) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const check = req.nextUrl.searchParams.get("check")
  if (check !== null) {
    const email = check.trim()
    if (!EMAIL_RE.test(email)) return NextResponse.json({ valid: false, available: false, reason: "Enter a valid email address." })
    const taken = await mailboxTaken(email)
    return NextResponse.json({
      valid: true, available: !taken,
      reason: taken ? "This email address is already registered and cannot be added." : null,
    })
  }
  const { data, error } = await admin()
    .from("client_receiver_emails")
    .select("id, r_mail, active, label")
    .eq("client_code", s.clientCode)
    .order("created_at")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const s = auth(req)
  if (!s) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { r_mail, label } = await req.json().catch(() => ({}))
  if (!r_mail?.trim()) return NextResponse.json({ error: "Email required" }, { status: 400 })
  if (!EMAIL_RE.test(r_mail.trim())) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  if (await mailboxTaken(r_mail.trim()))
    return NextResponse.json({ error: "This email address is already registered and cannot be added." }, { status: 409 })
  const { data, error } = await admin()
    .from("client_receiver_emails")
    .insert({ client_code: s.clientCode, r_mail: r_mail.trim(), label: label?.trim() || null, active: true })
    .select("id, r_mail, active, label")
    .single()
  if (error) {
    // 23505 = unique violation: the address already belongs to a client (never say which one).
    if (error.code === "23505")
      return NextResponse.json({ error: "This email address is already registered and cannot be added." }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const s = auth(req)
  if (!s) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id, active } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const { error } = await admin()
    .from("client_receiver_emails")
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
    .from("client_receiver_emails")
    .delete()
    .eq("id", id)
    .eq("client_code", s.clientCode)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
