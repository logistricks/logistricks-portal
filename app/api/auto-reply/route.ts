/**
 * app/api/auto-reply/route.ts
 *
 * POST — renders the default "Auto-Reply" template for a client,
 *        substituting all {{variable}} tokens with the request data.
 *        Called by n8n after a freight_request row is inserted.
 *        Auth: X-Portal-Secret header.
 *
 * Body: {
 *   client_code:       string   (required)
 *   sender_email:      string   (required — the To address)
 *   sender_name?:      string
 *   origin_city?:      string
 *   origin_country?:   string
 *   destination_city?: string
 *   destination_country?: string
 *   cargo_type?:       string
 *   quantity?:         string
 *   weight?:           string
 *   dimensions?:       string
 *   equipment?:        string   (may be JSON array — auto-parsed)
 *   mode?:             string
 *   incoterm?:         string
 *   bl_type?:          string
 *   urgency?:          string
 *   received_date?:    string   (ISO — formatted to readable date)
 * }
 *
 * Responses:
 *   200  { to, subject, html }          — ready to send
 *   200  { skipped: true, reason }      — no auto-reply template configured
 *   400  { error }                       — bad input
 *   401  { error: "Unauthorized" }
 *   500  { error }
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"

// ── Template variable substitution ───────────────────────────────────────────

type VarMap = Record<string, string>

/** Parse a value that may be a JSON array (n8n inserts equipment as JSON). */
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

// ── Missing-fields label map ──────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  cargo_type:  "Cargo Type",
  weight:      "Weight / Tonnage",
  dimensions:  "Dimensions",
  equipment:   "Equipment / Container",
  incoterm:    "Incoterm",
  bl_type:     "BL Type",
}

/**
 * Parse the missing_fields value from n8n.
 * Handles: JS array, JSON array string, comma-separated key string.
 * Maps raw keys (e.g. "weight") to human-readable labels.
 */
function parseMissingFields(value: unknown): string {
  if (value == null) return ""
  // Already a JS array (parsed by req.json())
  if (Array.isArray(value)) {
    return value.map((k) => FIELD_LABELS[String(k)] ?? String(k)).join(", ")
  }
  const s = String(value).trim()
  if (!s) return ""
  // JSON array string  e.g. '["weight","dimensions"]'
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s)
      if (Array.isArray(arr)) {
        return arr.map((k: unknown) => FIELD_LABELS[String(k)] ?? String(k)).join(", ")
      }
    } catch { /* fall through */ }
  }
  // Comma-separated keys  e.g. "weight,dimensions,bl_type"
  return s.split(",").map((k) => FIELD_LABELS[k.trim()] ?? k.trim()).join(", ")
}

/** Replace every {{key}} token in text with the corresponding value. */
function substituteVars(text: string, vars: VarMap): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "")
}

/**
 * Wrap a plain-text body in a minimal responsive HTML email shell.
 * If the body already contains HTML tags, use it directly inside the shell.
 */
function wrapHtml(subject: string, bodyContent: string): string {
  const hasHtml = /<[a-z][\s\S]*>/i.test(bodyContent)
  const inner = hasHtml
    ? bodyContent
    : bodyContent
        .split("\n")
        .map((l) => `<p style="margin:0 0 12px 0">${l}</p>`)
        .join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
          <!-- Header bar -->
          <tr>
            <td style="background:#0D1B2A;padding:20px 32px">
              <span style="color:#F97316;font-size:18px;font-weight:700;letter-spacing:.02em">Logistricks</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.7;color:#0f172a">
              ${inner}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;font-size:12px;color:#94a3b8;text-align:center">
              This is an automated response. Please do not reply directly to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = req.headers.get("x-portal-secret")
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const client_code   = body.client_code as string | undefined
  const sender_email  = body.sender_email as string | undefined

  if (!client_code) {
    return NextResponse.json({ error: "client_code required" }, { status: 400 })
  }
  if (!sender_email) {
    return NextResponse.json({ error: "sender_email required" }, { status: 400 })
  }

  // ── Fetch client flags ───────────────────────────────────────────────────
  const admin = adminClient()
  const { data: clientRow, error: clientErr } = await admin
    .from("clients")
    .select("auto_reply_enabled, require_critical_data, auto_reply_missing_enabled, critical_fields")
    .eq("client_code", client_code)
    .single()

  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 })

  // ── Determine which template to use ──────────────────────────────────────
  // Missing-data path: fires when auto_reply_missing_enabled is on,
  // independently of auto_reply_enabled and missing_fields content.
  // (The toggle is already gated on require_critical_data in the UI.)
  const useMissingTemplate = Boolean(clientRow?.auto_reply_missing_enabled)

  // Standard auto-reply path: only when auto_reply_enabled is on and not
  // overridden by the missing-data path.
  const useStandardTemplate = Boolean(clientRow?.auto_reply_enabled) && !useMissingTemplate

  if (!useMissingTemplate && !useStandardTemplate) {
    return NextResponse.json({
      skipped: true,
      reason: "Auto-reply is disabled for this client",
    })
  }

  const templateFlag = useMissingTemplate ? "is_missing_reply_template" : "is_reply_template"
  const templateLabel = useMissingTemplate ? "Missing-data auto-reply" : "Auto-Reply"

  // ── Fetch the flagged auto-reply template ────────────────────────────────
  const { data: templates, error: tErr } = await admin
    .from("templates")
    .select("template_id, template_name, type, subject, body, is_default")
    .eq("client_code", client_code)
    .eq(templateFlag, true)
    .order("template_id", { ascending: true })
    .limit(1)

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  if (!templates || templates.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: `No ${templateLabel} template configured for this client`,
    })
  }

  const template = templates[0]

  // ── Compute missing critical fields from body ───────────────────────────
  const criticalFields: string[] = Array.isArray(clientRow?.critical_fields)
    ? (clientRow.critical_fields as string[])
    : []

  const computedMissingFields = criticalFields
    .filter((field) => {
      const val = body[field]
      return val == null || String(val).trim() === "" || String(val).trim() === "[]"
    })
    .map((field) => FIELD_LABELS[field] ?? field)
    .join(", ")

  // ── Build substitution map ────────────────────────────────────────────────
  const receivedRaw  = body.received_date as string | undefined
  const receivedDate = receivedRaw
    ? new Date(receivedRaw).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      })
    : ""

  const vars: VarMap = {
    sender_name:          parseField(body.sender_name)          || parseField(body.sender_email),
    sender_email:         parseField(body.sender_email),
    origin_city:          parseField(body.origin_city),
    origin_country:       parseField(body.origin_country),
    destination_city:     parseField(body.destination_city),
    destination_country:  parseField(body.destination_country),
    cargo_type:           parseField(body.cargo_type),
    quantity:             parseField(body.quantity),
    weight:               parseField(body.weight),
    dimensions:           parseField(body.dimensions),
    equipment:            parseField(body.equipment),
    mode:                 parseField(body.mode),
    incoterm:             parseField(body.incoterm),
    bl_type:              parseField(body.bl_type),
    urgency:              parseField(body.urgency),
    received_date:        receivedDate,
    // Carrier vars — left blank for auto-replies (not yet assigned)
    carrier_name:         "",
    contact_name:         "",
    carrier_email:        "",
    carrier_phone:        "",
    // Derived
    preferred_carrier:    parseField(body.preferred_carrier),
    special_requirements: parseField(body.special_requirements),
    availability_questions: parseField(body.availability_questions),
    missing_fields:       computedMissingFields || parseMissingFields(body.missing_fields),
  }

  // ── Substitute & render ───────────────────────────────────────────────────
  const rawSubject = template.subject ?? `Re: Freight Request — ${vars.origin_city} → ${vars.destination_city}`
  const subject    = substituteVars(rawSubject, vars)
  const bodyText   = substituteVars(template.body ?? "", vars)
  const html       = wrapHtml(subject, bodyText)

  return NextResponse.json({ to: sender_email, subject, html })
}
