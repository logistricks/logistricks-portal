/**
 * app/api/requests/[id]/sender-reply/route.ts
 *
 * POST — called by n8n when the original sender replies to a missing-data
 *        auto-reply email with the requested information.
 *        Parses the AI-extracted fields from the body and patches the
 *        freight_request row, then appends the reply to the conversation
 *        thread.
 *
 * Auth: X-Portal-Secret header (same secret as other n8n-facing endpoints)
 *
 * Body:
 *   client_code       string   (required)
 *   gmail_thread_id   string   (optional — for conversation matching)
 *   raw_reply         string   (optional — the sender's raw reply text)
 *   // Extracted field values (any subset of the editable cargo fields):
 *   cargo_type        string
 *   weight            string
 *   quantity          string
 *   dimensions        string
 *   equipment         string
 *   incoterm          string
 *   bl_type           string
 *   preferred_carrier string
 *   origin_city       string
 *   origin_country    string
 *   destination_city  string
 *   destination_country string
 */
import { NextResponse, after, type NextRequest } from "next/server"
import { notify, requestValues } from "@/lib/notify"
import { adminClient } from "@/lib/api-session"
import { logActivity } from "@/lib/log-activity"

const UPDATABLE_FIELDS = [
  "cargo_type", "weight", "quantity", "dimensions",
  "equipment", "incoterm", "bl_type", "preferred_carrier",
  "origin_city", "origin_country", "destination_city", "destination_country",
] as const

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const secret = req.headers.get("x-portal-secret")
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const client_code     = body.client_code as string | undefined
  const gmail_thread_id = body.gmail_thread_id as string | undefined
  const raw_reply       = body.raw_reply as string | undefined

  if (!client_code) return NextResponse.json({ error: "client_code required" }, { status: 400 })

  const admin = adminClient()

  // ── Fetch existing request ────────────────────────────────────────────────
  const { data: row, error: fetchErr } = await admin
    .from("freight_requests")
    .select("id, client_code, conversation")
    .eq("id", id)
    .eq("client_code", client_code)
    .single()

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 })
  }

  // ── Build patch from provided fields ─────────────────────────────────────
  const patch: Record<string, unknown> = {}
  const updatedFields: string[] = []

  for (const field of UPDATABLE_FIELDS) {
    const val = body[field]
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      patch[field] = String(val).trim()
      updatedFields.push(field)
    }
  }

  if (updatedFields.length === 0 && !raw_reply) {
    return NextResponse.json({ skipped: true, reason: "No field values provided" })
  }

  // ── Append sender reply to conversation ──────────────────────────────────
  const existing: unknown[] = Array.isArray(row.conversation) ? row.conversation : []
  const replyMessage = {
    role:          "sender",
    type:          "reply",
    body:          raw_reply ?? "(no text captured)",
    sent_at:       new Date().toISOString(),
    fields_parsed: updatedFields,
  }

  patch.conversation = [...existing, replyMessage]

  if (updatedFields.length > 0) {
    // Clear missing_fields for any field that was just provided
    patch.missing_fields = []
  }

  // ── Apply patch ───────────────────────────────────────────────────────────
  const { error: updateErr } = await admin
    .from("freight_requests")
    .update(patch)
    .eq("id", id)
    .eq("client_code", client_code)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── Activity log ──────────────────────────────────────────────────────────
  void logActivity({
    clientCode:  client_code,
    eventType:   "sender_reply_received",
    actor:       "system",
    description: updatedFields.length > 0
      ? `Sender replied with missing info — updated: ${updatedFields.join(", ")}`
      : "Sender reply received (no parseable fields)",
    requestId:   id,
    meta:        { updated_fields: updatedFields, gmail_thread_id },
  })

  after(async () => {
    const vals = await requestValues(admin, client_code, id)
    await notify(admin, client_code, "sender_reply", {
      ...vals, updated_fields: updatedFields.join(", "), reply_excerpt: String(raw_reply ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
    }, { requestId: id })
  })

  return NextResponse.json({ ok: true, updated_fields: updatedFields })
}
