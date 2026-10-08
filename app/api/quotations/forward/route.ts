/**
 * POST /api/quotations/forward   { quotation_id }
 *   Sends a built quotation to the ORIGINAL SENDER of the request through the client's own SMTP server
 *   (automatic send). Format follows the quotation template: text, formatted HTML, or email text + PDF attachment.
 *   Refuses disregarded carrier quotes. Logged in outbound_emails, auto_reply_logs ("quotation") and activity_log;
 *   the quotation is marked sent.
 *
 *   POST /api/quotations/forward   { quotation_id, manual: true }
 *   Logs a quotation the user sent themselves from their own mailbox (same logs, method "manual").
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { sendClientMail } from "@/lib/mailer"
import { renderPdf } from "@/lib/quotation-pdf-server"
import { htmlDocument } from "@/lib/quotation-render"
import { normalizeOptions } from "@/lib/quotation-variables"
import { logActivity } from "@/lib/log-activity"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const sr = await sessionWithRole(req)
  if (!sr) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const session = sr.session
  if (sr.role === "viewer") return NextResponse.json({ error: "Viewers can't send quotations" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const qid = Number(body?.quotation_id)
  const manual = body?.manual === true
  if (!qid) return NextResponse.json({ error: "quotation_id required" }, { status: 400 })

  const admin = adminClient()
  const code = session.clientCode
  const { data: q } = await admin.from("quotations").select("*").eq("id", qid).ilike("client_code", code).maybeSingle()
  if (!q) return NextResponse.json({ error: "Quotation not found" }, { status: 404 })

  const { data: fr } = await admin.from("freight_requests").select("id, request_ref, sender_email, sender_name, status").eq("id", q.freight_request_id).ilike("client_code", code).maybeSingle()
  if (!fr) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  if (!fr.sender_email) return NextResponse.json({ error: "This request has no sender email on file" }, { status: 400 })
  if (["Closed", "Rejected"].includes(String(fr.status))) return NextResponse.json({ error: `The request is ${fr.status}` }, { status: 400 })

  if (q.carrier_quote_id) {
    const { data: cq } = await admin.from("carrier_quotes").select("disregarded").eq("id", q.carrier_quote_id).maybeSingle()
    if ((cq as { disregarded?: boolean } | null)?.disregarded === true)
      return NextResponse.json({ error: "The carrier quote behind this quotation was disregarded. Reactivate it first." }, { status: 400 })
  }

  const subject = String(q.generated_subject || `Quotation ${q.quotation_number ?? q.id}`)
  const text = String(q.generated_body || "")
  const format = String(q.generated_format || "text")
  const method = manual ? "manual" : "automatic"
  let result: { status: string; reason?: string; message_id?: string | null } = { status: "sent" }

  if (!manual) {
    let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined
    let html: string | undefined
    if (format === "pdf" && q.generated_html) {
      try {
        const { data: t } = await admin.from("quotation_templates").select("options").ilike("client_code", code).eq("template_id", q.quotation_template_id).maybeSingle()
        const options = normalizeOptions((t as { options?: unknown } | null)?.options)
        const pdf = await renderPdf(htmlDocument(String(q.generated_html), options).replace("padding:28px", "padding:0"), options.page_size === "letter" ? "letter" : "a4")
        attachments = [{ filename: `Quotation ${q.quotation_number ?? q.id}.pdf`.replace(/[^\w .-]+/g, "-"), content: Buffer.from(pdf), contentType: "application/pdf" }]
      } catch (e) {
        return NextResponse.json({ sent: false, error: `PDF generation failed: ${(e as Error).message}` }, { status: 500 })
      }
    } else if (format === "html" && q.generated_html) {
      html = String(q.generated_html)
    }
    const out = await sendClientMail(admin, {
      clientCode: code, purpose: "reply", freightRequestId: fr.id, to: [fr.sender_email],
      subject, text: text || subject, html, attachments, idempotencyKey: `quotation:${q.id}`,
    })
    result = out
    if (out.status === "skipped") return NextResponse.json({ sent: false, error: "Email server (SMTP) is not set up or is switched off. Use manual sending, or set it up in Settings." }, { status: 409 })
    if (out.status !== "sent" && out.status !== "duplicate") {
      await logQuotation(admin, code, fr, subject, method, "failed", out.reason ?? out.status, session.username)
      return NextResponse.json({ sent: false, status: out.status, error: out.reason ?? "The quotation could not be sent" }, { status: out.status === "rejected" ? 422 : 502 })
    }
  }

  await admin.from("quotations").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", q.id).ilike("client_code", code)
  await logQuotation(admin, code, fr, subject, method, "sent", null, session.username)
  await logActivity({
    clientCode: code, eventType: "quotation_forwarded", actor: session.username, requestId: fr.id,
    description: `Quotation ${q.quotation_number ?? q.id} forwarded to ${fr.sender_email} (${method})`,
    meta: { quotation_id: q.id, method, format, message_id: result.message_id ?? null },
  })
  return NextResponse.json({ ok: true, sent: true, method, to: fr.sender_email, message_id: result.message_id ?? null })
}

async function logQuotation(admin: any, code: string, fr: any, subject: string, method: string, status: string, error: string | null, actor: string) {
  try {
    await admin.from("auto_reply_logs").insert({
      client_code: code, log_type: "quotation", sender_email: fr.sender_email, sender_name: fr.sender_name ?? null, subject, request_id: fr.id,
      meta: { method, status, error, request_ref: fr.request_ref ?? null, sent_by: actor },
    })
  } catch { /* logging is best effort */ }
}
