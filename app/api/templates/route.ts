/**
 * app/api/templates/route.ts
 * CRUD for the templates table — scoped to the caller's client_code via session cookie.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"

function getSession(cookie: string): { username: string; clientCode: string } | null {
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
    return { username: data.username, clientCode: data.clientCode }
  } catch { return null }
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function auth(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return null
  return getSession(cookie)
}

// ── GET — list ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await admin()
    .from("templates").select("*")
    .eq("client_code", session.clientCode)
    .order("template_id", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST — create, update, or duplicate ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { action, template } = body
  const db = admin()
  const cc = session.clientCode

  // ── Duplicate ──────────────────────────────────────────────────────────────
  if (action === "duplicate") {
    const { data: maxRow } = await db.from("templates").select("template_id")
      .eq("client_code", cc).order("template_id", { ascending: false }).limit(1).maybeSingle()
    const nextId = (maxRow?.template_id ?? 0) + 1
    const { error } = await db.from("templates").insert({
      client_code: cc, template_id: nextId,
      template_name: `${template.template_name} (Copy)`,
      type: template.type, subject: template.subject,
      body: template.body, linked_carrier_ids: template.linked_carrier_ids,
      is_default: false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  if (template.row_id > 0) {
    const { error } = await db.from("templates").update({
      template_name: template.template_name,
      subject: template.subject ?? null,
      body: template.body,
      linked_carrier_ids: template.linked_carrier_ids,
      is_default: template.is_default,
      updated_at: new Date().toISOString(),
    }).eq("id", template.row_id).eq("client_code", cc)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (template.is_default) {
      await db.from("templates").update({ is_default: false })
        .eq("client_code", cc).eq("type", template.type).neq("id", template.row_id)
    }
    return NextResponse.json({ ok: true })
  }

  // ── Insert ─────────────────────────────────────────────────────────────────
  const { data: maxRow } = await db.from("templates").select("template_id")
    .eq("client_code", cc).order("template_id", { ascending: false }).limit(1).maybeSingle()
  const nextId = (maxRow?.template_id ?? 0) + 1

  const { error } = await db.from("templates").insert({
    client_code: cc, template_id: nextId,
    template_name: template.template_name, type: template.type,
    subject: template.subject ?? null, body: template.body,
    linked_carrier_ids: template.linked_carrier_ids, is_default: template.is_default,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (template.is_default) {
    await db.from("templates").update({ is_default: false })
      .eq("client_code", cc).eq("type", template.type).neq("template_id", nextId)
  }
  return NextResponse.json({ ok: true })
}

// ── DELETE ─────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { template_id }: { template_id: number } = await req.json()
  const { error } = await admin().from("templates").delete()
    .eq("client_code", session.clientCode).eq("template_id", template_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
