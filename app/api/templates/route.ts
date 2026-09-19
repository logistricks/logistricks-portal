/**
 * app/api/templates/route.ts
 * CRUD for the templates table, scoped to the authenticated user's client_code.
 */

import { createHmac } from "crypto"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { logActivity } from "@/lib/log-activity"

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

export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await admin()
    .from("templates")
    .select("*")
    .eq("client_code", session.clientCode)
    .order("template_id", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const db = admin()

  if (body.action === "duplicate") {
    const srcId: number = body.template_id
    if (!srcId) return NextResponse.json({ error: "template_id required" }, { status: 400 })

    const { data: src } = await db
      .from("templates")
      .select("*")
      .eq("client_code", session.clientCode)
      .eq("template_id", srcId)
      .maybeSingle()

    if (!src) return NextResponse.json({ error: "Template not found" }, { status: 404 })

    const { data: maxRow } = await db
      .from("templates")
      .select("template_id")
      .eq("client_code", session.clientCode)
      .order("template_id", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextId = (maxRow?.template_id ?? 0) + 1

    const { error } = await db.from("templates").insert({
      client_code:        session.clientCode,
      template_id:        nextId,
      template_name:      `${src.template_name} (Copy)`,
      type:               src.type,
      subject:            src.subject,
      body:               src.body,
      linked_carrier_ids: src.linked_carrier_ids,
      is_default:         false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logActivity({
      clientCode:  session.clientCode,
      eventType:   "template_created",
      actor:       session.username,
      description: `Duplicated template "${src.template_name}" → "${src.template_name} (Copy)"`,
      meta: { template_id: nextId, source_template_id: srcId, duplicated: true },
    })

    return NextResponse.json({ ok: true, template_id: nextId }, { status: 201 })
  }

  if (body.row_id && body.row_id > 0) {
    const { error } = await db
      .from("templates")
      .update({
        template_name:      body.template_name,
        type:               body.type,
        subject:            body.subject ?? null,
        body:               body.body,
        linked_carrier_ids: body.linked_carrier_ids ?? [],
        is_default:         body.is_default ?? false,
        active:             body.active       ?? true,
        updated_at:         new Date().toISOString(),
      })
      .eq("client_code", session.clientCode)
      .eq("id",          body.row_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logActivity({
      clientCode:  session.clientCode,
      eventType:   "template_updated",
      actor:       session.username,
      description: `Updated template "${body.template_name}"`,
      meta: { row_id: body.row_id, template_name: body.template_name, type: body.type },
    })

    return NextResponse.json({ ok: true })
  }

  const { data: maxRow } = await db
    .from("templates")
    .select("template_id")
    .eq("client_code", session.clientCode)
    .order("template_id", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextId = (maxRow?.template_id ?? 0) + 1

  const { error } = await db.from("templates").insert({
    client_code:        session.clientCode,
    template_id:        nextId,
    template_name:      body.template_name,
    type:               body.type,
    subject:            body.subject ?? null,
    body:               body.body,
    linked_carrier_ids: body.linked_carrier_ids ?? [],
    is_default:         body.is_default ?? false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "template_created",
    actor:       session.username,
    description: `Created template "${body.template_name}"`,
    meta: { template_id: nextId, template_name: body.template_name, type: body.type },
  })

  return NextResponse.json({ ok: true, template_id: nextId }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url        = new URL(req.url)
  const templateId = Number(url.searchParams.get("template_id"))
  if (!templateId) return NextResponse.json({ error: "template_id required" }, { status: 400 })

  const db = admin()

  const { data: nameRow } = await db
    .from("templates")
    .select("template_name")
    .eq("client_code", session.clientCode)
    .eq("template_id", templateId)
    .maybeSingle()

  // Check if template has been used in outgoing requests
  // request_templates table is created in Phase 7/8 — until then this check is a no-op
  let inUse = false
  const { count: usageCount, error: usageErr } = await db
    .from("request_templates")
    .select("template_id", { count: "exact", head: true })
    .eq("client_code", session.clientCode)
    .eq("template_id", templateId)
  if (!usageErr) inUse = (usageCount ?? 0) > 0

  if (inUse) {
    return NextResponse.json(
      { error: "in_use", name: nameRow?.template_name ?? String(templateId) },
      { status: 409 },
    )
  }

  const { error } = await db
    .from("templates")
    .delete()
    .eq("client_code", session.clientCode)
    .eq("template_id", templateId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "template_deleted",
    actor:       session.username,
    description: `Deleted template "${nameRow?.template_name ?? templateId}"`,
    meta: { template_id: templateId },
  })

  return NextResponse.json({ ok: true })
}
