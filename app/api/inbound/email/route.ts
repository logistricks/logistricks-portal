/**
 * app/api/inbound/email/route.ts — manual email intake (drag & drop an .eml / .msg).
 *
 * GET  -> { mailboxes }: the client's mailbox addresses (for the manual "pick the mailbox" step).
 * POST multipart: mode = "preview" | "process", kind = "request" | "carrier_reply", freight_request_id?,
 *   file? (.eml / .msg), overrides? (JSON: from_email, from_name, subject, body_text, mailbox, date), extra? (more files).
 *   preview = read the file and show what was found; process = validate and send it to the workflow.
 *   No file = pasted email text (sender, mailbox and text come from overrides).
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
import { parseEmailFile, type ParsedEmail } from "@/lib/email-parse"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_FILE = 25 * 1024 * 1024

const ADDR_OK = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const MAX_EXTRA = 8
const MAX_EXTRA_BYTES = 10 * 1024 * 1024

async function mailboxesFor(admin: any, clientCode: string): Promise<string[]> {
  const [rcv, src] = await Promise.all([
    admin.from("client_receiver_emails").select("r_mail").eq("client_code", clientCode).eq("active", true),
    admin.from("email_sources").select("ms_email, imap_username").eq("client_code", clientCode),
  ])
  const out = new Set<string>()
  for (const r of rcv.data ?? []) if (r.r_mail) out.add(String(r.r_mail).trim().toLowerCase())
  for (const r of src.data ?? []) for (const a of [r.ms_email, r.imap_username]) if (a && String(a).includes("@")) out.add(String(a).trim().toLowerCase())
  return Array.from(out)
}

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ mailboxes: await mailboxesFor(adminClient(), s.session.clientCode) })
}

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers cannot add emails." }, { status: 403 })
  const clientCode = s.session.clientCode

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  const kind = String(form?.get("kind") ?? "")
  const mode = String(form?.get("mode") ?? "process") === "preview" ? "preview" : "process"
  const freightRequestId = String(form?.get("freight_request_id") ?? "").trim() || null
  let ov: Record<string, any> = {}
  try { ov = JSON.parse(String(form?.get("overrides") ?? "{}")) || {} } catch { /* ignore */ }
  const extraFiles = (form?.getAll("extra") ?? []).filter((x): x is File => x instanceof File).slice(0, MAX_EXTRA)
  if (kind !== "request" && kind !== "carrier_reply") return NextResponse.json({ error: "kind must be request or carrier_reply" }, { status: 400 })
  if (!(file instanceof File) && mode === "preview") return NextResponse.json({ error: "Drop an .eml or .msg email file." }, { status: 400 })
  if (file instanceof File && file.size > MAX_FILE) return NextResponse.json({ error: "File is larger than 25 MB." }, { status: 413 })

  const empty: ParsedEmail = { from_email: "", from_name: "", to: [], cc: [], recipients: [], subject: "", date: null, message_id: null, body_text: "", attachments: [] }
  let mail: ParsedEmail = empty
  if (file instanceof File) {
    try { mail = await parseEmailFile(file.name, Buffer.from(await file.arrayBuffer())) }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that email file." }, { status: 422 }) }
  }
  const admin = adminClient()
  const mailboxes = await mailboxesFor(admin, clientCode)
  const fromFile = mail.recipients.find((a) => mailboxes.includes(a))

  // A file must have reached one of the client's mailboxes (checked on the real recipients).
  if (file instanceof File && !fromFile) {
    return NextResponse.json({
      ok: false, reason: "mailbox_not_in_setup", mailboxes,
      error: mail.recipients.length
        ? `None of this email's recipients (${mail.recipients.slice(0, 5).join(", ")}) is a mailbox set up for client ${clientCode}. Add it in Settings → Emails first, or drop an email sent to one of the client's addresses.`
        : `This email file lists no recipient address, so it can't be matched to a client mailbox for ${clientCode}.`,
    }, { status: 422 })
  }

  if (mode === "preview") {
    return NextResponse.json({
      ok: true, mailboxes, preview: {
        from_email: mail.from_email, from_name: mail.from_name, subject: mail.subject, date: mail.date,
        body_text: mail.body_text.slice(0, 30000), mailbox: fromFile ?? null,
        attachments: mail.attachments.map((a) => ({ filename: a.filename, size: a.size })),
      },
    })
  }

  // ── process: apply the person's edits, validate, send to the workflow ──
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const merged: ParsedEmail = {
    ...mail,
    from_email: str(ov.from_email).toLowerCase() || mail.from_email,
    from_name: str(ov.from_name) || mail.from_name,
    subject: ov.subject != null ? str(ov.subject) : mail.subject,
    body_text: ov.body_text != null ? String(ov.body_text) : mail.body_text,
    date: str(ov.date) || mail.date,
    message_id: str(ov.message_id) || mail.message_id,
  }
  const chosen = str(ov.mailbox).toLowerCase()
  const matched = chosen && mailboxes.includes(chosen) ? chosen : fromFile
  if (!matched) {
    return NextResponse.json({ ok: false, reason: "mailbox_not_in_setup", mailboxes, error: `Pick the client mailbox this email was sent to (set up in Settings → Emails for ${clientCode}).` }, { status: 422 })
  }
  if (!ADDR_OK.test(merged.from_email)) return NextResponse.json({ ok: false, reason: "sender_missing", error: "Enter the sender's email address." }, { status: 422 })

  const atts = merged.attachments.map((a) => ({ filename: a.filename, mime_type: a.mime_type, data_base64: a.data_base64 }))
  for (const f of extraFiles) {
    if (f.size > MAX_EXTRA_BYTES) return NextResponse.json({ error: `${f.name} is larger than 10 MB.` }, { status: 413 })
    atts.push({ filename: f.name, mime_type: f.type || "application/octet-stream", data_base64: Buffer.from(await f.arrayBuffer()).toString("base64") })
  }
  if (!merged.body_text.trim() && atts.length === 0) return NextResponse.json({ error: "The email has no text and no attachments." }, { status: 422 })

  if (kind === "carrier_reply" && merged.message_id) {
    const { data: dup } = await admin.from("carrier_quotes").select("id").eq("client_code", clientCode).eq("email_message_id", merged.message_id).limit(1)
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
    client_code: clientCode, to_email: matched, from_email: merged.from_email, from_name: merged.from_name,
    subject: merged.subject, body_text: merged.body_text, received_at: merged.date ?? new Date().toISOString(),
    message_id: merged.message_id, attachments: atts,
    intake_source: "manual", intake_filename: file instanceof File ? file.name : "pasted text",
    added_by: s.session.username, freight_request_id: freightRequestId ?? undefined,
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Portal-Secret": secret },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(110_000),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, reason: "workflow_unreachable", error: `Could not reach the n8n workflow: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }
  const text = await res.text()
  let out: any = null
  try { out = JSON.parse(text) } catch { /* not json */ }
  if (!res.ok) return NextResponse.json({ ok: false, reason: "workflow_error", error: out?.error || out?.message || text.slice(0, 300) || `Workflow returned ${res.status}` }, { status: 502 })
  return NextResponse.json({ ok: true, kind, mailbox: matched, subject: merged.subject, from: merged.from_email, attachments: atts.length, result: out ?? text.slice(0, 300) })
}
