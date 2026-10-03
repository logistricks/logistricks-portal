/**
 * app/api/inbound/email/route.ts — manual email intake (drag & drop an .eml / .msg).
 *
 * POST multipart: file, kind = "request" | "carrier_reply", freight_request_id? (carrier replies from a request page)
 * Auth: portal session (operator or admin).
 *
 * 1. Parses the email file.
 * 2. Validates that one of its recipient addresses is a mailbox set up for the signed-in client
 *    (Settings → Emails), so a mail for another client / an unknown mailbox is rejected.
 * 3. Hands the mail to the n8n webhook workflow for its kind — the same extraction + portal steps as
 *    the automatic mailbox flows, only the trigger differs. Everything is stamped intake_source = "manual".
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { parseEmailFile } from "@/lib/email-parse"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_FILE = 25 * 1024 * 1024

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers cannot add emails." }, { status: 403 })
  const clientCode = s.session.clientCode

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  const kind = String(form?.get("kind") ?? "")
  const freightRequestId = String(form?.get("freight_request_id") ?? "").trim() || null
  if (!(file instanceof File)) return NextResponse.json({ error: "Drop an .eml or .msg email file." }, { status: 400 })
  if (kind !== "request" && kind !== "carrier_reply") return NextResponse.json({ error: "kind must be request or carrier_reply" }, { status: 400 })
  if (file.size > MAX_FILE) return NextResponse.json({ error: "File is larger than 25 MB." }, { status: 413 })

  let mail
  try { mail = await parseEmailFile(file.name, Buffer.from(await file.arrayBuffer())) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that email file." }, { status: 422 }) }
  if (!mail.body_text && mail.attachments.length === 0) return NextResponse.json({ error: "The email has no text and no attachments." }, { status: 422 })

  // ── Validate: the mail must have reached a mailbox that belongs to this client ──
  const admin = adminClient()
  const [rcv, src] = await Promise.all([
    admin.from("client_receiver_emails").select("r_mail").eq("client_code", clientCode).eq("active", true),
    admin.from("email_sources").select("ms_email, imap_username").eq("client_code", clientCode),
  ])
  const mailboxes = new Set<string>()
  for (const r of rcv.data ?? []) if (r.r_mail) mailboxes.add(String(r.r_mail).trim().toLowerCase())
  for (const r of src.data ?? []) for (const a of [r.ms_email, r.imap_username]) if (a && String(a).includes("@")) mailboxes.add(String(a).trim().toLowerCase())
  const matched = mail.recipients.find((a) => mailboxes.has(a))
  if (!matched) {
    return NextResponse.json({
      ok: false, reason: "mailbox_not_in_setup",
      error: mail.recipients.length
        ? `None of this email's recipients (${mail.recipients.slice(0, 5).join(", ")}) is a mailbox set up for client ${clientCode}. Add it in Settings → Emails first, or drop an email sent to one of the client's addresses.`
        : `This email file lists no recipient address, so it can't be matched to a client mailbox for ${clientCode}.`,
    }, { status: 422 })
  }

  // Carrier replies: the same reply must not be stored twice.
  if (kind === "carrier_reply" && mail.message_id) {
    const { data: dup } = await admin.from("carrier_quotes").select("id").eq("client_code", clientCode).eq("email_message_id", mail.message_id).limit(1)
    if (dup && dup.length) return NextResponse.json({ ok: false, reason: "duplicate", error: "This email was already processed (same Message-ID)." }, { status: 409 })
  }

  const url = kind === "request" ? process.env.N8N_REQUEST_INTAKE_WEBHOOK_URL : process.env.N8N_CARRIER_REPLY_WEBHOOK_URL
  const secret = process.env.PORTAL_WEBHOOK_SECRET
  if (!url || !secret) {
    return NextResponse.json({
      ok: false, reason: "workflow_not_configured",
      error: `Set ${kind === "request" ? "N8N_REQUEST_INTAKE_WEBHOOK_URL" : "N8N_CARRIER_REPLY_WEBHOOK_URL"} (and PORTAL_WEBHOOK_SECRET) in the portal's environment variables to enable manual email intake.`,
    }, { status: 503 })
  }

  const payload = {
    client_code: clientCode,
    to_email: matched,
    from_email: mail.from_email,
    from_name: mail.from_name,
    subject: mail.subject,
    body_text: mail.body_text,
    received_at: mail.date ?? new Date().toISOString(),
    message_id: mail.message_id,
    attachments: mail.attachments.map((a) => ({ filename: a.filename, mime_type: a.mime_type, data_base64: a.data_base64 })),
    intake_source: "manual",
    intake_filename: file.name,
    added_by: s.session.username,
    freight_request_id: freightRequestId ?? undefined,
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Portal-Secret": secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(110_000),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, reason: "workflow_unreachable", error: `Could not reach the n8n workflow: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }
  const text = await res.text()
  let out: any = null
  try { out = JSON.parse(text) } catch { /* not json */ }
  if (!res.ok) return NextResponse.json({ ok: false, reason: "workflow_error", error: out?.error || out?.message || text.slice(0, 300) || `Workflow returned ${res.status}` }, { status: 502 })
  return NextResponse.json({ ok: true, kind, mailbox: matched, subject: mail.subject, from: mail.from_email, attachments: mail.attachments.length, result: out ?? text.slice(0, 300) })
}
