/**
 * app/api/requests/[id]/auto-reply/route.ts
 * Phase 5: returns a prepared auto-reply email for n8n to send via Gmail.
 *
 * POST /api/requests/:id/auto-reply
 *   → { to, subject, body } — filled from the client's active reply template
 *   → 204 if auto-reply is disabled or no reply template is set
 *   → 401/403/404/500 on error
 *
 * n8n workflow:
 *   Wait(auto_reply_delay_min) → POST here → Gmail Send
 */

import { createHmac } from "crypto"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

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

/** Fill {{variable}} placeholders in a template string */
function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Auth — n8n calls this with the portal_session cookie OR an API secret header
  // For simplicity we accept either the session cookie or X-Portal-Secret header
  const secret = req.headers.get("x-portal-secret")
  const validSecret = secret && secret === process.env.PORTAL_WEBHOOK_SECRET
  const cookie  = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null

  if (!validSecret && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = admin()

  // 1. Load the freight request
  const requestId = params.id
  const { data: freightReq, error: reqErr } = await db
    .from("freight_requests")
    .select("id, client_code, sender_name, sender_email, raw_message, received_at, confidence")
    .eq("id", requestId)
    .maybeSingle()

  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })
  if (!freightReq) return NextResponse.json({ error: "Request not found" }, { status: 404 })

  const clientCode: string = freightReq.client_code

  // 2. Check auto-reply is enabled for this client
  const { data: clientRow, error: clientErr } = await db
    .from("clients")
    .select("auto_reply_enabled, auto_reply_delay_min")
    .eq("client_code", clientCode)
    .single()

  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 })
  if (!clientRow?.auto_reply_enabled) {
    // Auto-reply disabled — n8n should skip the send
    return new NextResponse(null, { status: 204 })
  }

  // 3. Find the active reply template for this client
  const { data: templateRow, error: tmplErr } = await db
    .from("templates")
    .select("template_name, type, subject, body")
    .eq("client_code", clientCode)
    .eq("is_reply_template", true)
    .eq("active", true)
    .maybeSingle()

  if (tmplErr) return NextResponse.json({ error: tmplErr.message }, { status: 500 })
  if (!templateRow) {
    // No reply template configured — skip
    return new NextResponse(null, { status: 204 })
  }

  // 4. Determine missing critical fields
  const { data: clientSettings } = await db
    .from("clients")
    .select("require_critical_data, critical_fields")
    .eq("client_code", clientCode)
    .single()

  const { data: parsedFields } = await db
    .from("freight_requests")
    .select("origin_city, origin_country, destination_city, destination_country, cargo_type, equipment, weight, incoterm, modes")
    .eq("id", requestId)
    .maybeSingle()

  const FIELD_LABELS: Record<string, string> = {
    origin_city:        "Origin City",
    origin_country:     "Origin Country",
    destination_city:   "Destination City",
    destination_country:"Destination Country",
    cargo_type:         "Cargo Type",
    equipment:          "Equipment",
    weight:             "Weight",
    incoterm:           "Incoterm",
  }

  const criticalFields: string[] = clientSettings?.critical_fields ?? Object.keys(FIELD_LABELS)
  const missingParts: string[]   = []
  if (parsedFields && clientSettings?.require_critical_data) {
    for (const field of criticalFields) {
      const val = (parsedFields as Record<string, unknown>)[field]
      if (!val || val === "—") missingParts.push(FIELD_LABELS[field] ?? field)
    }
  }

  // 5. Build template variables
  const vars: Record<string, string> = {
    sender_name:    freightReq.sender_name ?? "there",
    sender_email:   freightReq.sender_email ?? "",
    request_ref:    requestId.slice(0, 8).toUpperCase(),
    missing_fields: missingParts.length > 0
      ? missingParts.join(", ")
      : "None — all required information was received.",
    delay_min:      String(clientRow.auto_reply_delay_min ?? 0),
    received_at:    new Date(freightReq.received_at).toLocaleString("en-GB", { timeZone: "UTC" }),
  }

  // 6. Fill subject + body
  const subject = fillTemplate(templateRow.subject ?? "Re: Your freight inquiry", vars)
  const body    = fillTemplate(templateRow.body, vars)

  // 7. Return payload for n8n Gmail node
  return NextResponse.json({
    to:      freightReq.sender_email,
    subject,
    body,
    request_id:    requestId,
    client_code:   clientCode,
    delay_min:     clientRow.auto_reply_delay_min,
  })
}
