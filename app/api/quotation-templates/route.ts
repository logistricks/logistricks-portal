/**
 * app/api/quotation-templates/route.ts
 * CRUD for quotation_templates — the outbound quotation form templates
 * sent to the original requester. Mirrors app/api/templates/route.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"
import { logActivity } from "@/lib/log-activity"

function auth(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return null
  return getSession(cookie)
}

export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await adminClient()
    .from("quotation_templates")
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

  const db = adminClient()

  if (body.action === "duplicate") {
    const srcId: number = body.template_id
    if (!srcId) return NextResponse.json({ error: "template_id required" }, { status: 400 })

    const { data: src } = await db
      .from("quotation_templates")
      .select("*")
      .eq("client_code", session.clientCode)
      .eq("template_id", srcId)
      .maybeSingle()

    if (!src) return NextResponse.json({ error: "Template not found" }, { status: 404 })

    const { data: maxRow } = await db
      .from("quotation_templates")
      .select("template_id")
      .eq("client_code", session.clientCode)
      .order("template_id", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextId = (maxRow?.template_id ?? 0) + 1

    const { error } = await db.from("quotation_templates").insert({
      client_code:   session.clientCode,
      template_id:   nextId,
      template_name: `${src.template_name} (Copy)`,
      subject:       src.subject,
      body:          src.body,
      is_default:    false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logActivity({
      clientCode: session.clientCode,
      eventType:  "quotation_template_created",
      actor:      session.username,
      description: `Duplicated quotation template "${src.template_name}" → "${src.template_name} (Copy)"`,
      meta: { template_id: nextId, source_template_id: srcId, duplicated: true },
    })

    return NextResponse.json({ ok: true, template_id: nextId }, { status: 201 })
  }

  if (body.row_id && body.row_id > 0) {
    const { error } = await db
      .from("quotation_templates")
      .update({
        template_name: body.template_name,
        subject:       body.subject ?? "",
        body:          body.body,
        is_default:    body.is_default ?? false,
        active:        body.active ?? true,
        updated_at:    new Date().toISOString(),
      })
      .eq("client_code", session.clientCode)
      .eq("id", body.row_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logActivity({
      clientCode: session.clientCode,
      eventType:  "quotation_template_updated",
      actor:      session.username,
      description: `Updated quotation template "${body.template_name}"`,
      meta: { row_id: body.row_id, template_name: body.template_name },
    })

    return NextResponse.json({ ok: true })
  }

  const { data: maxRow } = await db
    .from("quotation_templates")
    .select("template_id")
    .eq("client_code", session.clientCode)
    .order("template_id", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextId = (maxRow?.template_id ?? 0) + 1

  const { error } = await db.from("quotation_templates").insert({
    client_code:   session.clientCode,
    template_id:   nextId,
    template_name: body.template_name,
    subject:       body.subject ?? "",
    body:          body.body,
    is_default:    body.is_default ?? false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity({
    clientCode: session.clientCode,
    eventType:  "quotation_template_created",
    actor:      session.username,
    description: `Created quotation template "${body.template_name}"`,
    meta: { template_id: nextId, template_name: body.template_name },
  })

  return NextResponse.json({ ok: true, template_id: nextId }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.template_id) return NextResponse.json({ error: "template_id required" }, { status: 400 })

  const db = adminClient()

  // is_default: only one per client — unset all others first
  if (body.is_default !== undefined) {
    if (body.is_default) {
      await db
        .from("quotation_templates")
        .update({ is_default: false })
        .eq("client_code", session.clientCode)
        .eq("is_default", true)
    }
    const { error } = await db
      .from("quotation_templates")
      .update({ is_default: body.is_default })
      .eq("client_code", session.clientCode)
      .eq("template_id", body.template_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const patch: Record<string, unknown> = {}
  if (body.active !== undefined) patch.active = body.active

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { error } = await db
    .from("quotation_templates")
    .update(patch)
    .eq("client_code", session.clientCode)
    .eq("template_id", body.template_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url        = new URL(req.url)
  const templateId = Number(url.searchParams.get("template_id"))
  if (!templateId) return NextResponse.json({ error: "template_id required" }, { status: 400 })

  const db = adminClient()

  const { data: nameRow } = await db
    .from("quotation_templates")
    .select("template_name")
    .eq("client_code", session.clientCode)
    .eq("template_id", templateId)
    .maybeSingle()

  let inUse = false
  const { count: usageCount, error: usageErr } = await db
    .from("quotations")
    .select("id", { count: "exact", head: true })
    .eq("client_code", session.clientCode)
    .eq("quotation_template_id", templateId)
  if (!usageErr) inUse = (usageCount ?? 0) > 0

  if (inUse) {
    return NextResponse.json(
      { error: "in_use", name: nameRow?.template_name ?? String(templateId) },
      { status: 409 },
    )
  }

  const { error } = await db
    .from("quotation_templates")
    .delete()
    .eq("client_code", session.clientCode)
    .eq("template_id", templateId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity({
    clientCode: session.clientCode,
    eventType:  "quotation_template_deleted",
    actor:      session.username,
    description: `Deleted quotation template "${nameRow?.template_name ?? templateId}"`,
    meta: { template_id: templateId },
  })

  return NextResponse.json({ ok: true })
}
