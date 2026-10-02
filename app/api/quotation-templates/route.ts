/**
 * app/api/quotation-templates/route.ts
 * CRUD for quotation_templates — the outbound quotation form templates
 * sent to the original requester. Mirrors app/api/templates/route.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"
import { logActivity } from "@/lib/log-activity"
import { sanitizeQuotationHtml } from "@/lib/quotation-html"
import { htmlToPlainText } from "@/lib/quotation-render"
import { normalizeOptions } from "@/lib/quotation-variables"

const MAX_HTML = 2_500_000

/** Normalises the template content: HTML is sanitised, and `body` always keeps a plain-text version. */
function cleanContent(b: any): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  const wantsHtml = b.format === "html"
  if (wantsHtml) {
    const raw = String(b.body_html ?? "")
    if (raw.length > MAX_HTML) return { ok: false, error: "Template is too large (images in the Word file?). Reduce image sizes and try again." }
    const html = sanitizeQuotationHtml(raw)
    const text = htmlToPlainText(html)
    if (!text && !/<img|<table/i.test(html)) return { ok: false, error: "The template body is empty." }
    return { ok: true, fields: { format: "html", body_html: html, body: text } }
  }
  const body = String(b.body ?? "")
  if (!body.trim()) return { ok: false, error: "The template body is empty." }
  return { ok: true, fields: { format: "text", body_html: null, body } }
}

/** Optional v2 fields. Dropped automatically if migration 042 has not run yet. */
function extFields(b: any): Record<string, unknown> {
  const mode = ["any", "sea", "air", "land"].includes(b.applies_to_mode) ? b.applies_to_mode : "any"
  return {
    description:     typeof b.description === "string" ? b.description.slice(0, 300) : null,
    applies_to_mode: mode,
    source_filename: typeof b.source_filename === "string" ? b.source_filename.slice(0, 200) : null,
    options:         normalizeOptions(b.options),
  }
}
const EXT_KEYS = ["format", "body_html", "description", "applies_to_mode", "source_filename", "options"]
const missingColumn = (e: any) => !!e && (e.code === "42703" || e.code === "PGRST204")
const withoutExt = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => !EXT_KEYS.includes(k)))

/** Only one default per client: clear the flag everywhere else (the database also enforces this). */
async function clearOtherDefaults(db: any, clientCode: string, exceptTemplateId?: number) {
  let q = db.from("quotation_templates").update({ is_default: false }).eq("client_code", clientCode).eq("is_default", true)
  if (exceptTemplateId) q = q.neq("template_id", exceptTemplateId)
  await q
}

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
  const cc = session.clientCode

  async function nextTemplateId() {
    const { data: maxRow } = await db
      .from("quotation_templates").select("template_id").eq("client_code", cc)
      .order("template_id", { ascending: false }).limit(1).maybeSingle()
    return (maxRow?.template_id ?? 0) + 1
  }

  // ── duplicate ──────────────────────────────────────────────────────────────
  if (body.action === "duplicate") {
    const srcId: number = body.template_id
    if (!srcId) return NextResponse.json({ error: "template_id required" }, { status: 400 })

    const { data: src } = await db
      .from("quotation_templates").select("*").eq("client_code", cc).eq("template_id", srcId).maybeSingle()
    if (!src) return NextResponse.json({ error: "Template not found" }, { status: 404 })

    const nextId = await nextTemplateId()
    const row = {
      client_code: cc, template_id: nextId, template_name: `${src.template_name} (Copy)`,
      subject: src.subject, body: src.body, is_default: false,
      format: src.format ?? "text", body_html: src.body_html ?? null, description: src.description ?? null,
      applies_to_mode: src.applies_to_mode ?? "any", source_filename: src.source_filename ?? null, options: src.options ?? {},
    }
    let { error } = await db.from("quotation_templates").insert(row)
    if (missingColumn(error)) ({ error } = await db.from("quotation_templates").insert(withoutExt(row)))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logActivity({
      clientCode: cc, eventType: "quotation_template_created", actor: session.username,
      description: `Duplicated quotation template "${src.template_name}" → "${src.template_name} (Copy)"`,
      meta: { template_id: nextId, source_template_id: srcId, duplicated: true },
    })
    return NextResponse.json({ ok: true, template_id: nextId }, { status: 201 })
  }

  // ── create / update ────────────────────────────────────────────────────────
  const name = String(body.template_name ?? "").trim()
  if (!name) return NextResponse.json({ error: "Template name is required." }, { status: 400 })
  const content = cleanContent(body)
  if (!content.ok) return NextResponse.json({ error: content.error }, { status: 400 })

  const common = {
    template_name: name,
    subject:       String(body.subject ?? ""),
    ...content.fields,
    ...extFields(body),
  }
  const wantDefault = body.is_default === true
  const active = body.active ?? true

  if (body.row_id && body.row_id > 0) {
    const patch = { ...common, active, updated_at: new Date().toISOString() }
    let { data: updated, error } = await db
      .from("quotation_templates").update(patch).eq("client_code", cc).eq("id", body.row_id).select("template_id").maybeSingle()
    if (missingColumn(error)) ({ data: updated, error } = await db
      .from("quotation_templates").update(withoutExt(patch)).eq("client_code", cc).eq("id", body.row_id).select("template_id").maybeSingle())
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated) return NextResponse.json({ error: "Template not found" }, { status: 404 })

    if (wantDefault && active) {
      await clearOtherDefaults(db, cc, updated.template_id)
      await db.from("quotation_templates").update({ is_default: true }).eq("client_code", cc).eq("template_id", updated.template_id)
    } else {
      await db.from("quotation_templates").update({ is_default: false }).eq("client_code", cc).eq("template_id", updated.template_id)
    }

    await logActivity({
      clientCode: cc, eventType: "quotation_template_updated", actor: session.username,
      description: `Updated quotation template "${name}"`, meta: { row_id: body.row_id, template_name: name },
    })
    return NextResponse.json({ ok: true })
  }

  const nextId = await nextTemplateId()
  const row = { client_code: cc, template_id: nextId, ...common, is_default: false, active }
  let { error } = await db.from("quotation_templates").insert(row)
  if (missingColumn(error)) ({ error } = await db.from("quotation_templates").insert(withoutExt(row)))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (wantDefault && active) {
    await clearOtherDefaults(db, cc, nextId)
    await db.from("quotation_templates").update({ is_default: true }).eq("client_code", cc).eq("template_id", nextId)
  }

  await logActivity({
    clientCode: cc, eventType: "quotation_template_created", actor: session.username,
    description: `Created quotation template "${name}"`, meta: { template_id: nextId, template_name: name },
  })
  return NextResponse.json({ ok: true, template_id: nextId }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.template_id) return NextResponse.json({ error: "template_id required" }, { status: 400 })

  const db = adminClient()
  const cc = session.clientCode
  const id = Number(body.template_id)

  const { data: cur } = await db
    .from("quotation_templates").select("template_id, active, is_default").eq("client_code", cc).eq("template_id", id).maybeSingle()
  if (!cur) return NextResponse.json({ error: "Template not found" }, { status: 404 })

  // Set / clear the default. Only one default per client, and it must be active.
  if (body.is_default !== undefined) {
    if (body.is_default) {
      if (!cur.active) return NextResponse.json({ error: "An inactive template can't be the default. Activate it first." }, { status: 400 })
      await clearOtherDefaults(db, cc, id)
    }
    const { error } = await db.from("quotation_templates").update({ is_default: !!body.is_default }).eq("client_code", cc).eq("template_id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.active !== undefined) {
    const patch: Record<string, unknown> = { active: !!body.active }
    if (!body.active) patch.is_default = false // deactivating the default leaves no default rather than a dead one
    const { error } = await db.from("quotation_templates").update(patch).eq("client_code", cc).eq("template_id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
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
