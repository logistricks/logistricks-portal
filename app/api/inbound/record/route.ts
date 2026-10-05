/**
 * POST /api/inbound/record — store an email (in or out) and how it was linked. Auth: X-Portal-Secret.
 * Also stamps subject / message_id on a newly created request, and marks "possible reply to" requests.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { addrs, mailboxClient, normId, normSubject, parseIds } from "@/lib/inbound-match"

export const runtime = "nodejs"
const KINDS = ["request", "requester_reply", "carrier_reply", "other"]
const t = (v: unknown, max: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null }

export async function POST(req: NextRequest) {
  const secret = process.env.PORTAL_WEBHOOK_SECRET
  if (!secret || req.headers.get("x-portal-secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  const admin = adminClient()

  const clientCode = t(b.client_code, 15) ?? (await mailboxClient(admin, addrs([b.mailbox, b.to].flat().filter(Boolean))))
  if (!clientCode) return NextResponse.json({ error: "client_code or a known mailbox required" }, { status: 400 })

  const messageId = normId(b.message_id) || null
  const reqId = t(b.freight_request_id, 64)
  const row = {
    client_code: clientCode,
    direction: b.direction === "out" ? "out" : "in",
    kind: KINDS.includes(b.kind) ? b.kind : "other",
    source: t(b.source, 20), mailbox: t(addrs(b.mailbox)[0], 255),
    message_id: messageId, in_reply_to: parseIds(b.in_reply_to)[0] ?? null, references: parseIds(b.references),
    provider_thread_id: t(b.provider_thread_id, 200),
    subject: t(b.subject, 500), subject_normalized: normSubject(b.subject) || null,
    from_email: addrs(b.from_email)[0] ?? null, from_name: t(b.from_name, 200),
    to_emails: addrs(b.to), cc_emails: addrs(b.cc),
    received_at: b.received_at && !Number.isNaN(Date.parse(b.received_at)) ? new Date(b.received_at).toISOString() : new Date().toISOString(),
    body_text: t(b.body_text, 100000), attachment_count: Number(b.attachment_count) || 0,
    freight_request_id: reqId,
    match_method: t(b.match_method, 30), match_confidence: typeof b.match_confidence === "number" ? Math.max(0, Math.min(1, b.match_confidence)) : null,
    match_reason: t(b.match_reason, 500),
    review_status: ["auto", "needs_review", "confirmed", "rejected"].includes(b.review_status) ? b.review_status : "auto",
    ai_decision: b.ai_decision && typeof b.ai_decision === "object" ? b.ai_decision : null,
  }
  const q = messageId
    ? admin.from("inbound_emails").upsert(row, { onConflict: "client_code,message_id", ignoreDuplicates: false }).select("id").maybeSingle()
    : admin.from("inbound_emails").insert(row).select("id").maybeSingle()
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (reqId && row.kind === "request") {
    const patch: Record<string, unknown> = {}
    if (row.subject) patch.subject = row.subject
    if (messageId) patch.message_id = messageId
    if (b.related_request_id) patch.related_request_id = String(b.related_request_id)
    if (Object.keys(patch).length) await admin.from("freight_requests").update(patch).eq("id", reqId).eq("client_code", clientCode)
  }
  return NextResponse.json({ ok: true, id: data?.id ?? null })
}
