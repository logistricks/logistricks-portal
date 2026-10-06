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
 * Optional  send: true  — the portal ALSO sends the reply itself through the client's email server (recommended;
 *            n8n then needs no mail node). Responses then include { sent, status, message_id }.
 *
 * Responses:
 *   200  { to, subject, html, reply_type }   — ready to send
 *   200  { skipped: true, reason }           — no template / disabled
 *   400  { error }
 *   401  { error: "Unauthorized" }
 *   500  { error }
 */
import { isExw } from "@/lib/shipment-labels"
import { applyTemplate } from "@/lib/template-render"
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sendClientMail } from "@/lib/mailer"
import { htmlToPlainText } from "@/lib/quotation-render"

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
  pickup_address: "Pickup address (EXW)",
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
  return applyTemplate(text, vars)
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
  let   freight_request_id = (body.freight_request_id as string | undefined) || undefined
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

  // No request id sent (e.g. on the reply path): find the request by its mail thread.
  if (!freight_request_id && gmail_thread_id) {
    const { data: byThread } = await admin.from("freight_requests").select("id").eq("client_code", client_code).eq("gmail_thread_id", gmail_thread_id).order("received_at", { ascending: false }).limit(1)
    if (byThread?.[0]?.id) freight_request_id = byThread[0].id as string
  }

  // ── Determine missing fields ──────────────────────────────────────────────
  // Only compute missing when require_critical_data is actually enabled.
  // If the toggle is off, treat everything as "complete" so the missing-data
  // reply branch never fires inadvertently.
  const criticalFields: string[] = (clientRow?.require_critical_data && Array.isArray(clientRow?.critical_fields))
    ? (clientRow.critical_fields as string[])
    : []

  // The saved request is the source of truth: a reply may have just filled fields that the caller did not send.
  let saved: Record<string, unknown> = {}
  if (freight_request_id) {
    try {
      const { data: row } = await admin.from("freight_requests").select("*").eq("id", freight_request_id).maybeSingle()
      if (row) saved = row as Record<string, unknown>
    } catch { /* ignore */ }
  }
  const blank = (v: unknown) => v == null || String(v).trim() === "" || String(v).trim() === "[]"
  const val = (field: string) => (blank(body[field]) ? saved[field] : body[field])
  for (const f of ["cargo_type", "weight", "dimensions", "equipment", "incoterm", "bl_type", "pickup_address", "quantity", "mode", "urgency", "origin_city", "origin_country", "destination_city", "destination_country"]) {
    if (blank(body[f]) && !blank(saved[f])) body[f] = saved[f]
  }
  const computedMissingLabels = criticalFields
    .filter((field) => {
      // Pickup address is only mandatory when the shipment is EXW.
      if (field === "pickup_address" && !isExw(val("incoterm") as string | undefined)) return false
      return blank(val(field))
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

  // pickup address: from the call, else from the saved request (column exists from migration 048)
  let pickupAddress = parseField(body.pickup_address)
  let requestRef = parseField(body.request_ref)
  let originalSubject = ""
  if (freight_request_id) {
    try {
      const { data: fr } = await admin.from("freight_requests").select("pickup_address, request_ref, subject").eq("id", freight_request_id).maybeSingle()
      const row = fr as { pickup_address?: string | null; request_ref?: string | null; subject?: string | null } | null
      if (!pickupAddress) pickupAddress = String(row?.pickup_address ?? "")
      if (!requestRef) requestRef = String(row?.request_ref ?? "")
      originalSubject = String(row?.subject ?? "").replace(/^=+/, "").trim()
    } catch { /* column not there yet */ }
  }

  const vars: VarMap = {
    pickup_address:         pickupAddress,
    request_ref:            requestRef,
    sender_name:            parseField(body.sender_name)          || parseField(saved.sender_name) || "Sir/Madam",
    sender_email:           parseField(body.sender_email)         || parseField(saved.sender_email),
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
  // A reply that the portal sends itself continues the client's own email thread: "Re: <their subject>".
  // (Mail apps only thread messages with the same subject, so a different subject would arrive as a brand-new email.)
  const threadSubject = body.send === true && originalSubject
    ? (/^\s*(re|aw|sv|rv)\s*:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`)
    : ""
  const subject    = threadSubject || substituteVars(rawSubject, vars)
  const bodyText   = substituteVars(template.body ?? "", vars)
  const html       = wrapHtml(subject, bodyText)

  // ── Optional: send it from here, through the client's own email server ────
  let sendInfo: Record<string, unknown> = {}
  if (body.send === true) {
    const out = await sendClientMail(admin, {
      clientCode: client_code, purpose: "reply", freightRequestId: freight_request_id,
      to: [sender_email], subject, text: htmlToPlainText(html), html,
      idempotencyKey: freight_request_id ? `reply:${freight_request_id}:${replyType}` : null,
    })
    if (out.status === "skipped") return NextResponse.json({ skipped: true, reason: out.reason ?? "smtp_not_configured", sent: false })
    if (out.status !== "sent" && out.status !== "duplicate") {
      return NextResponse.json({ sent: false, status: out.status, error: out.reason ?? "The reply could not be sent" }, { status: out.status === "rejected" ? 422 : 502 })
    }
    sendInfo = { sent: true, status: out.status, message_id: out.message_id ?? null }
    if (out.status === "duplicate") return NextResponse.json({ to: sender_email, subject, reply_type: replyType, ...sendInfo })
  }

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
  // Must be awaited: on Vercel's serverless runtime the function can be frozen
  // or torn down immediately after the response is sent, so a fire-and-forget
  // insert here is not guaranteed to ever reach the database. A failure here
  // must never block the actual auto-reply response from going out.
  const { error: logError } = await admin.from("auto_reply_logs").insert({
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
  if (logError) {
    console.error("auto_reply_logs insert failed:", logError.message)
  }

  return NextResponse.json({ to: sender_email, subject, html, reply_type: replyType, ...sendInfo })
}
