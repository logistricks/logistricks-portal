/**
 * app/api/mail/send/route.ts — the mail gateway for the n8n workflows.
 * Auth: X-Portal-Secret. The sender and server always come from the client's saved email settings.
 *
 * POST { client_code, purpose: "rfq" | "reply", freight_request_id, to: string[], cc?: string[],
 *        subject, text, idempotency_key?, rfq_reference? }
 *  -> 200 { ok: true,  status: "sent" | "duplicate", message_id }
 *  -> 200 { ok: false, status: "skipped", reason }              (client's email server not set up / off)
 *  -> 422 { ok: false, status: "rejected", reason }             (a safety rule refused it)
 *  -> 502 { ok: false, status: "failed",   reason }             (the email server refused / was unreachable)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { portalSecretOk, sendClientMail } from "@/lib/mailer"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!portalSecretOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const purpose = b.purpose === "rfq" || b.purpose === "reply" ? b.purpose : null
  if (!purpose) return NextResponse.json({ ok: false, status: "rejected", reason: "purpose must be rfq or reply" }, { status: 422 })
  if (typeof b.client_code !== "string" || !b.client_code.trim()) return NextResponse.json({ ok: false, status: "rejected", reason: "client_code required" }, { status: 422 })

  const out = await sendClientMail(adminClient(), {
    clientCode: b.client_code.trim(), purpose, freightRequestId: typeof b.freight_request_id === "string" ? b.freight_request_id : null,
    to: Array.isArray(b.to) ? b.to : typeof b.to === "string" ? [b.to] : [], cc: Array.isArray(b.cc) ? b.cc : [],
    subject: String(b.subject ?? ""), text: String(b.text ?? ""),   // html is deliberately NOT accepted from the caller
    idempotencyKey: typeof b.idempotency_key === "string" ? b.idempotency_key : null,
    rfqReference: typeof b.rfq_reference === "string" ? b.rfq_reference : null,
  })
  const ok = out.status === "sent" || out.status === "duplicate"
  const code = ok || out.status === "skipped" ? 200 : out.status === "rejected" ? 422 : 502
  return NextResponse.json({ ok, ...out }, { status: code })
}
