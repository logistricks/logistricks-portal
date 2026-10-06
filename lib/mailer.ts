/**
 * lib/mailer.ts  (server only) — the portal's outbound mail gateway.
 *
 * Every automated email (RFQs to carriers, auto-replies to requesters) is sent from here, through the CLIENT'S OWN
 * SMTP settings (Settings → Email server; the password is stored encrypted). n8n never holds mail credentials and
 * never chooses the sender or the server: it only says WHAT to send and WHO it is for.
 *
 * Safety rules enforced here, whatever the caller asks:
 *  - purpose "rfq":   every recipient (to + cc) must be a carrier / carrier CC address of that client.
 *  - purpose "reply": the single recipient must be the sender of the stored freight request.
 *  - the request must belong to the client; recipients, subject and body are size-capped; header injection is stripped.
 *  - idempotency: the same key never sends twice (n8n retries / double runs are harmless).
 *  - rate limit per client; MAIL_REDIRECT_TO sends everything to one test address instead (safe testing).
 *  - every attempt is logged in outbound_emails with the Message-ID we generated.
 */
import { randomUUID, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"
import { loadSmtp, smtpError, transport } from "@/lib/notify"

export type MailPurpose = "rfq" | "reply"
export interface SendArgs {
  clientCode: string
  purpose: MailPurpose
  freightRequestId: string | null | undefined
  to: string[]
  cc?: string[]
  subject: string
  text: string
  html?: string                    // trusted, portal-generated HTML only (auto-replies). Never taken from n8n.
  idempotencyKey?: string | null
  rfqReference?: string | null
}
export interface SendOutcome {
  status: "sent" | "duplicate" | "skipped" | "failed" | "rejected"
  reason?: string
  message_id?: string | null
  recipients?: string[]
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/
const MAX_RECIPIENTS = 10
const MAX_TEXT = 200_000
const PER_MINUTE = 60

/** X-Portal-Secret check, constant time. */
export function portalSecretOk(req: NextRequest): boolean {
  const env = process.env.PORTAL_WEBHOOK_SECRET
  const got = req.headers.get("x-portal-secret")
  if (!env || !got) return false
  const a = Buffer.from(got), b = Buffer.from(env)
  return a.length === b.length && timingSafeEqual(a, b)
}

const norm = (list: unknown): string[] =>
  Array.from(new Set((Array.isArray(list) ? list : []).map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => EMAIL_RE.test(e))))
const oneLine = (s: string) => s.replace(new RegExp("[\\r\\n\\u2028\\u2029]+", "g"), " ").trim()
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const plainToHtml = (t: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">${esc(t).replace(/\n/g, "<br>")}</div>`

export async function sendClientMail(admin: any, a: SendArgs): Promise<SendOutcome> {
  const clientCode = a.clientCode
  const to = norm(a.to), cc = norm(a.cc)
  const subject = oneLine(String(a.subject ?? "")).slice(0, 250)
  const text = String(a.text ?? "")
  const reject = (reason: string): SendOutcome => ({ status: "rejected", reason })

  if (!to.length) return reject("no_recipients")
  if (to.length > MAX_RECIPIENTS || cc.length > MAX_RECIPIENTS) return reject("too_many_recipients")
  if (!subject) return reject("subject_required")
  if (!text.trim() || text.length > MAX_TEXT) return reject("body_empty_or_too_large")
  if (!a.freightRequestId) return reject("freight_request_id_required")

  // the request must belong to this client
  const { data: fr } = await admin.from("freight_requests").select("id, sender_email, message_id").eq("id", a.freightRequestId).ilike("client_code", clientCode).maybeSingle()
  if (!fr) return reject("request_not_found_for_client")

  // who may receive this?
  if (a.purpose === "rfq") {
    const { data: cs } = await admin.from("carriers").select("email, cc_emails").ilike("client_code", clientCode)
    const allowed = new Set<string>()
    for (const c of cs ?? []) {
      if (c.email) allowed.add(String(c.email).trim().toLowerCase())
      for (const x of c.cc_emails ?? []) allowed.add(String(x).trim().toLowerCase())
    }
    const bad = [...to, ...cc].filter((e) => !allowed.has(e))
    if (bad.length) return reject(`recipient_not_a_carrier_of_this_client: ${bad.slice(0, 3).join(", ")}`)
  } else {
    const sender = String(fr.sender_email ?? "").trim().toLowerCase()
    if (to.length !== 1 || cc.length || to[0] !== sender) return reject("reply_must_go_to_the_requester_only")
  }

  // idempotency
  const key = a.idempotencyKey ? String(a.idempotencyKey).slice(0, 200) : null
  if (key) {
    const { data: prev } = await admin.from("outbound_emails").select("id, status, message_id").ilike("client_code", clientCode).eq("idempotency_key", key).maybeSingle()
    if (prev?.status === "sent") return { status: "duplicate", message_id: prev.message_id, reason: "already_sent" }
  }

  // rate limit
  const { count } = await admin.from("outbound_emails").select("id", { count: "exact", head: true }).ilike("client_code", clientCode).gte("created_at", new Date(Date.now() - 60_000).toISOString())
  if ((count ?? 0) >= PER_MINUTE) return reject("rate_limited")

  const log = async (status: "sent" | "failed" | "skipped", extra: Record<string, unknown>) => {
    const row = {
      client_code: clientCode, purpose: a.purpose, freight_request_id: a.freightRequestId, rfq_reference: a.rfqReference ?? null,
      to_emails: to, cc_emails: cc, subject, status, idempotency_key: key, ...extra,
    }
    try {
      if (key) {
        const { data: prev } = await admin.from("outbound_emails").select("id").ilike("client_code", clientCode).eq("idempotency_key", key).maybeSingle()
        if (prev) { await admin.from("outbound_emails").update(row).eq("id", prev.id); return }
      }
      await admin.from("outbound_emails").insert(row)
    } catch { /* logging is best effort */ }
  }

  const cfg = await loadSmtp(admin, clientCode)
  if (!cfg || !cfg.enabled) {
    await log("skipped", { error: "Email server not set up or switched off" })
    return { status: "skipped", reason: "smtp_not_configured" }
  }

  // safe test mode: everything goes to one address
  const redirect = (process.env.MAIL_REDIRECT_TO || "").trim().toLowerCase()
  const redirected = EMAIL_RE.test(redirect)
  const sendTo = redirected ? [redirect] : to
  const sendCc = redirected ? [] : cc
  const sendSubject = redirected ? `[TEST → ${to.join(", ")}] ${subject}`.slice(0, 250) : subject

  const domain = (cfg.from_email.split("@")[1] || "logistricks.local").toLowerCase()
  const messageId = `${randomUUID()}@${domain}`
  const inReplyTo = a.purpose === "reply" && fr.message_id ? `<${fr.message_id}>` : undefined

  try {
    await (await transport(cfg)).sendMail({
      from: cfg.from_name ? { name: cfg.from_name, address: cfg.from_email } : cfg.from_email,
      to: sendTo, cc: sendCc.length ? sendCc : undefined, replyTo: cfg.reply_to || undefined,
      subject: sendSubject, text, html: a.purpose === "reply" && a.html ? a.html : plainToHtml(text),
      messageId: `<${messageId}>`,
      ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}),
      // RFC 3834: tells other auto-responders not to answer our automatic acknowledgements (no mail loops)
      ...(a.purpose === "reply" ? { headers: { "Auto-Submitted": "auto-replied" } } : {}),
    })
    await log("sent", { message_id: messageId, in_reply_to: inReplyTo ? fr.message_id : null, redirected, sent_at: new Date().toISOString() })
    return { status: "sent", message_id: messageId, recipients: sendTo }
  } catch (e) {
    const msg = smtpError(e)
    await log("failed", { error: msg, redirected })
    return { status: "failed", reason: msg }
  }
}
