/**
 * app/api/auto-reply/route.ts
 *
 * POST — renders the correct auto-reply template for a client,
 *        substituting all {{variable}} tokens with the request data.
 *        Called by n8n after a freight_request row is inserted/updated.
 *        Auth: X-Portal-Secret header.
 *
 * Body:
 *   client_code        string   (required)
 *   sender_email       string   (required — the To address)
 *   freight_request_id string   (optional — UUID of the freight_request row)
 *   gmail_thread_id    string   (optional — Gmail threadId for logging)
 *   missing_fields     string | string[]  (optional)
 *   ... (all other shipment fields)
 *
 * Responses:
 *   200  { to, subject, html, reply_type }   — ready to send
 *   200  { skipped: true, reason }           — no template / disabled
 *   400  { error }
 *   401  { error: "Unauthorized" }
 *   500  { error }
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"

type VarMap = Record<string, string>

function parseField(value: unknown): string {
  if (value == null) return ""
  const s = String(value).trim()
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s)
      if (Array.isArray(arr)) return arr.join(", ")
    } catch { /* not JSON */ }
  }
  return s
}

const FIELD_LABELS: Record<string, string> = {
  cargo_type:  "Cargo Type",
  weight:      "Weight / Tonnage",
  dimensions:  "Dimensions",
  equipment:   "Equipment / Container",
  incoterm:    "Incoterm",
  bl_type:     "BL Type",
}

function parseMissingFields(value: unknown): string {
  if (value == null) return ""
  if (Array.isArray(value)) {
    return value.map((k) => FIELD_LABELS[String(k)] ?? String(k)).join(", ")
  }
  const s = String(value).trim()
  if (!s) return ""
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s)
      if (Array.isArray(arr)) {
        return arr.map((k: unknown) => FIELD_LABELS[String(k)] ?? String(k)).join(", ")
      }
    } catch { /* fall through */ }
  }
  return s.split(",").map((k) => FIELD_LABELS[k.trim()] ?? k.trim()).join(", ")
}

function substituteVars(text: string, vars: VarMap): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "")
}

function wrapHtml(_subject: string, bodyContent: string): string {
  const hasHtml = /<[a-z][\s\S]*>/i.test(bodyContent)
  const inner = hasHtml
    ? bodyContent
    : bodyContent
        .split("\n")
        .map((l) => `<p style="margin:0 0 12px 0">${l || "&nbsp;"}</p>`)
        .join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#0f172a">
  ${inner}
</body>
</html>`
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-portal-secret")
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const client_code        = body.client_code as string | undefined
  const sender_email       = body.sender_email as string | undefined
  const freight_request_id = body.freight_request_id as string | undefined
  const gmail_thread_id    = body.gmail_thread_id as string | undefined

  if (!client_code)   return NextResponse.json({ error: "client_code required" }, { status: 400 })
  if (!sender_email)  return NextResponse.json({ error: "sender_email required" }, { status: 400 })

  const admin = adminClient()

  const { data: clientRow, error: clientErr } = await admin
    .from("clients")
    .select("auto_reply_enabled, require_critical_data, auto_reply_missing_enabled, auto_reply_complete_enabled, critical_fields")
    .eq("client_code", client_code)
    .single()

  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 })

  // ── Determine missing fields ──────────────────────────────────────────────
  const criticalFields: string[] = Array.isArray(clientRow?.critical_fields)
    ? (clientRow.critical_fields as string[])
    : []

  const computedMissingLabels = criticalFields
    .filter((field) => {
      const val = body[field]
      return val == null || String(val).trim() === "" || String(val).trim() === "[]"
    })
    .map((field) => FIELD_LABELS[field] ?? field)

  const hasMissing = computedMissingLabels.length > 0

  // ── Select reply type ─────────────────────────────────────────────────────
  // Priority: missing_fields > complete > acknowledgement
  // Each only fires if its toggle is enabled.
  let replyType: "missing_fields" | "complete" | "acknowledgement" | null = null
  let templateFlag: string

  if (hasMissing && clientRow?.auto_reply_missing_enabled) {
    replyType    = "missing_fields"
    templateFlag = "is_missing_reply_template"
  } else if (!hasMissing && clientRow?.auto_reply_complete_enabled) {
    replyType    = "complete"
    templateFlag = "is_complete_reply_template"
  } else if (clientRow?.auto_reply_enabled) {
    replyType    = "acknowledgement"
    templateFlag = "is_reply_template"
  } else {
    return NextResponse.json({ skipped: true, reason: "No applicable auto-reply enabled for this client" })
  }

  // ── Fetch template ────────────────────────────────────────────────────────
  const { data: templates, error: tErr } = await admin
    .from("templates")
    .select("template_id, template_name, type, subject, body, is_default")
    .eq("client_code", client_code)
    .eq(templateFlag, true)
    .order("template_id", { ascending: true })
    .limit(1)

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!templates || templates.length === 0) {
    return NextResponse.json({ skipped: true, reason: `No ${replyType} template configured for this client` })
  }

  const template = templates[0]

  // ── Substitution map ─────────────────────────────────────────────────────
  const receivedRaw  = body.received_date as string | undefined
  const receivedDate = receivedRaw
    ? new Date(receivedRaw).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : ""

  const missingFieldsLabel = computedMissingLabels.join(", ") || parseMissingFields(body.missing_fields)

  const vars: VarMap = {
    sender_name:            parseField(body.sender_name)          || parseField(body.sender_email),
    sender_email:           parseField(body.sender_email),
    origin_city:            parseField(body.origin_city),
    origin_country:         parseField(body.origin_country),
    destination_city:       parseField(body.destination_city),
    destination_country:    parseField(body.destination_country),
    cargo_type:             parseField(body.cargo_type),
    quantity:               parseField(body.quantity),
    weight:                 parseField(body.weight),
    dimensions:             parseField(body.dimensions),
    equipment:              parseField(body.equipment),
    mode:                   parseField(body.mode),
    incoterm:               parseField(body.incoterm),
    bl_type:                parseField(body.bl_type),
    urgency:                parseField(body.urgency),
    received_date:          receivedDate,
    carrier_name:           "",
    contact_name:           "",
    carrier_email:          "",
    carrier_phone:          "",
    preferred_carrier:      parseField(body.preferred_carrier),
    special_requirements:   parseField(body.special_requirements),
    availability_questions: parseField(body.availability_questions),
    missing_fields:         missingFieldsLabel,
  }

  const rawSubject = template.subject ?? `Re: Freight Request — ${vars.origin_city} → ${vars.destination_city}`
  const subject    = substituteVars(rawSubject, vars)
  const bodyText   = substituteVars(template.body ?? "", vars)
  const html       = wrapHtml(subject, bodyText)

  // ── Update freight_request: mark replied + append to conversation ────────
  if (freight_request_id) {
    // Fetch existing conversation
    const { data: frRow } = await admin
      .from("freight_requests")
      .select("conversation")
      .eq("id", freight_request_id)
      .single()

    const existing: unknown[] = Array.isArray(frRow?.conversation) ? frRow.conversation : []
    const newMessage = {
      role:    "system",
      type:    replyType,
      body:    html,
      sent_at: new Date().toISOString(),
    }

    await admin
      .from("freight_requests")
      .update({
        replied_at:      new Date().toISOString(),
        reply_sent_type: replyType,
        reply_body:      html,
        conversation:    [...existing, newMessage],
        ...(gmail_thread_id ? { gmail_thread_id } : {}),
      })
      .eq("id", freight_request_id)
  }

  // ── Log ──────────────────────────────────────────────────────────────────
  void admin.from("auto_reply_logs").insert({
    client_code,
    log_type:        replyType,
    sender_email,
    sender_name:     vars.sender_name || undefined,
    subject,
    request_id:      freight_request_id ?? null,
    gmail_thread_id: gmail_thread_id ?? null,
    meta: {
      origin:         `${vars.origin_city}, ${vars.origin_country}`.replace(/, $/, ""),
      destination:    `${vars.destination_city}, ${vars.destination_country}`.replace(/, $/, ""),
      cargo_type:     vars.cargo_type  || undefined,
      missing_fields: replyType === "missing_fields" ? missingFieldsLabel || undefined : undefined,
      template_id:    template.template_id,
    },
  })

  return NextResponse.json({ to: sender_email, subject, html, reply_type: replyType })
}
