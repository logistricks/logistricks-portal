/**
 * lib/quotation-send.ts  (server only)
 * Sends a built quotation to the ORIGINAL SENDER of the request, or logs a manual send. Shared by the Forward route and by the
 * automatic send that follows the last quotation approval. Refuses a quotation that still needs approval (unless skipApproval).
 * Returns { status, json } like an API response.
 */
import { sendClientMail } from "@/lib/mailer"
import { renderPdf } from "@/lib/quotation-pdf-server"
import { htmlDocument } from "@/lib/quotation-render"
import { normalizeOptions } from "@/lib/quotation-variables"
import { isExpiredDate } from "@/lib/validity"
import { logActivity } from "@/lib/log-activity"
import { contentHash, loadCheckSettings } from "@/lib/quotation-check"
import { approvalRequirement } from "@/lib/quotation-approval"

const R = (json: any, o?: { status?: number }) => ({ status: o?.status ?? 200, json })

export async function sendQuotationToRequester(admin: any, code: string, actor: string, qid: number, opts: { manual: boolean; confirmExpired?: boolean; confirmChecks?: boolean; skipApproval?: boolean }): Promise<{ status: number; json: any }> {
  const manual = opts.manual
  const { data: q } = await admin.from("quotations").select("*").eq("id", qid).ilike("client_code", code).maybeSingle()
  if (!q) return R({ error: "Quotation not found" }, { status: 404 })

  const { data: fr } = await admin.from("freight_requests").select("id, request_ref, sender_email, sender_name, status").eq("id", q.freight_request_id).ilike("client_code", code).maybeSingle()
  if (!fr) return R({ error: "Request not found" }, { status: 404 })
  if (!opts.skipApproval) {
    const need = await approvalRequirement(admin, code, q, actor)
    if (need.needed) return R({ error: need.status === "pending" ? "This quotation is waiting for approval." : need.status === "rejected" ? "This quotation was rejected. Change it and send it for approval again." : "This quotation needs approval before it can be sent.", approval_required: true, approval_status: need.status }, { status: 409 })
  }
  if (!fr.sender_email) return R({ error: "This request has no sender email on file" }, { status: 400 })
  if (["Closed", "Rejected"].includes(String(fr.status))) return R({ error: `The request is ${fr.status}` }, { status: 400 })

  let expiredOn: string | null = null
  if (q.carrier_quote_id) {
    const { data: cq } = await admin.from("carrier_quotes").select("disregarded, validity_date").eq("id", q.carrier_quote_id).maybeSingle()
    if ((cq as { disregarded?: boolean } | null)?.disregarded === true)
      return R({ error: "The carrier quote behind this quotation was disregarded. Reactivate it first." }, { status: 400 })
    expiredOn = (cq as { validity_date?: string | null } | null)?.validity_date ?? null
  }
  // Flag only: an expired carrier quote or quotation may still be sent, but only after the user confirmed the prompt.
  const expiredCarrier = isExpiredDate(expiredOn)
  const expiredQuotation = isExpiredDate((q as { valid_until?: string | null }).valid_until)
  if ((expiredCarrier || expiredQuotation) && opts.confirmExpired !== true)
    return R({ error: expiredCarrier ? "The carrier quote validity date has passed." : "The quotation validity date has passed.", expired: true }, { status: 409 })

  // Automatic sending: a quotation whose check found problems is only sent after the person confirmed them.
  if (!manual && opts.confirmChecks !== true) {
    const set = await loadCheckSettings(admin, code)
    if (set.enabled) {
      const { data: chk } = await admin.from("quotation_checks").select("verdict, content_hash").eq("quotation_id", q.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      if (chk && chk.content_hash === contentHash(q) && chk.verdict === "problems")
        return R({ error: "The quotation check found problems. Review them, or confirm to send anyway.", check_problems: true }, { status: 409 })
    }
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
        return R({ sent: false, error: `PDF generation failed: ${(e as Error).message}` }, { status: 500 })
      }
    } else if (format === "html" && q.generated_html) {
      html = String(q.generated_html)
    }
    const out = await sendClientMail(admin, {
      clientCode: code, purpose: "reply", freightRequestId: fr.id, to: [fr.sender_email],
      subject, text: text || subject, html, attachments, idempotencyKey: `quotation:${q.id}`,
    })
    result = out
    if (out.status === "skipped") return R({ sent: false, error: "Email server (SMTP) is not set up or is switched off. Use manual sending, or set it up in Settings." }, { status: 409 })
    if (out.status !== "sent" && out.status !== "duplicate") {
      await logQuotation(admin, code, fr, subject, method, "failed", out.reason ?? out.status, actor)
      return R({ sent: false, status: out.status, error: out.reason ?? "The quotation could not be sent" }, { status: out.status === "rejected" ? 422 : 502 })
    }
  }

  await admin.from("quotations").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", q.id).ilike("client_code", code)
  await logQuotation(admin, code, fr, subject, method, "sent", null, actor)
  await logActivity({
    clientCode: code, eventType: "quotation_forwarded", actor: actor, requestId: fr.id,
    description: `Quotation ${q.quotation_number ?? q.id} forwarded to ${fr.sender_email} (${method})`,
    meta: { quotation_id: q.id, method, format, message_id: result.message_id ?? null },
  })
  return R({ ok: true, sent: true, method, to: fr.sender_email, message_id: result.message_id ?? null })
}

async function logQuotation(admin: any, code: string, fr: any, subject: string, method: string, status: string, error: string | null, actor: string) {
  try {
    await admin.from("auto_reply_logs").insert({
      client_code: code, log_type: "quotation", sender_email: fr.sender_email, sender_name: fr.sender_name ?? null, subject, request_id: fr.id,
      meta: { method, status, error, request_ref: fr.request_ref ?? null, sent_by: actor },
    })
  } catch { /* logging is best effort */ }
}
