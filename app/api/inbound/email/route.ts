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
 * 3. Hands the mail to the n8n webhook workflow for its kind, WAITS for it to finish (or fail), logs the run in
 *    intake_logs and reports what actually happened (request created / linked as a reply / error).
 *    Hands the mail to the n8n webhook workflow for its kind — the same extraction + portal steps as
 *    the automatic mailbox flows, only the trigger differs. Everything is stamped intake_source = "manual".
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { parseEmailFile, type ParsedEmail } from "@/lib/email-parse"
import { normId } from "@/lib/inbound-match"

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

  const empty: ParsedEmail = { from_email: "", from_name: "", to: [], cc: [], recipients: [], subject: "", date: null, message_id: null, in_reply_to: null, references: [], body_text: "", attachments: [] }
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
    const { data: dup } = await admin.from("carrier_quotes").select("id").eq("client_code", clientCode).in("email_message_id", [normId(merged.message_id), `<${normId(merged.message_id)}>`]).limit(1)
    if (dup && dup.length) return NextResponse.json({ ok: false, reason: "duplicate", error: "This email was already processed (same Message-ID)." }, { status: 409 })
  }

  if (kind === "request" && merged.message_id) {
    const { data: dupIn } = await admin.from("inbound_emails").select("id, freight_request_id").eq("client_code", clientCode).eq("message_id", normId(merged.message_id)).limit(1)
    if (dupIn && dupIn.length) {
      await admin.from("intake_logs").insert({ client_code: clientCode, kind, source: "manual", filename: file instanceof File ? file.name : "pasted text", from_email: merged.from_email, subject: merged.subject, message_id: normId(merged.message_id), status: "ignored", stage: "duplicate", error: "Already processed (same Message-ID).", created_by: s.session.username, finished_at: new Date().toISOString(), duration_ms: 0, freight_request_id: dupIn[0].freight_request_id ?? null })
      return NextResponse.json({ ok: false, reason: "duplicate", error: "This email was already processed (same Message-ID)." }, { status: 409 })
    }
  }

  const url = kind === "request" ? process.env.N8N_REQUEST_INTAKE_WEBHOOK_URL : process.env.N8N_CARRIER_REPLY_WEBHOOK_URL
  const secret = process.env.PORTAL_WEBHOOK_SECRET
  if (!url || !secret) {
    return NextResponse.json({
      ok: false, reason: "workflow_not_configured",
      error: "Adding emails by hand is not set up yet. Ask your administrator to finish the email processing setup.",
    }, { status: 503 })
  }

  const payload = {
    client_code: clientCode, to_email: matched, from_email: merged.from_email, from_name: merged.from_name,
    subject: merged.subject, body_text: merged.body_text, received_at: merged.date ?? new Date().toISOString(),
    message_id: merged.message_id, in_reply_to: mail.in_reply_to, references: mail.references, to: mail.to, cc: mail.cc, attachments: atts,
    intake_source: "manual", intake_filename: file instanceof File ? file.name : "pasted text",
    added_by: s.session.username, freight_request_id: freightRequestId ?? undefined,
  }

  // ── log the run, hand over to n8n and wait for the outcome ──
  const started = Date.now()
  const filename = file instanceof File ? file.name : "pasted text"
  const { data: logRow } = await admin.from("intake_logs").insert({
    client_code: clientCode, kind, source: "manual", filename, from_email: merged.from_email, subject: merged.subject,
    message_id: merged.message_id ? normId(merged.message_id) : null, status: "running", stage: "sent",
    created_by: s.session.username, freight_request_id: freightRequestId,
  }).select("id").maybeSingle()
  const logId: string | null = logRow?.id ?? null
  const finish = async (status: string, patch: Record<string, unknown>) => {
    if (!logId) return
    await admin.from("intake_logs").update({ status, finished_at: new Date().toISOString(), duration_ms: Date.now() - started, ...patch }).eq("id", logId)
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Portal-Secret": secret },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(100_000),
    })
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError"
      ? "Processing is taking longer than expected. It may still be running — check the Intake log in a minute."
      : `Email processing could not be reached: ${e instanceof Error ? e.message : e}`
    await finish("failed", { stage: "unreachable", error: msg })
    return NextResponse.json({ ok: false, reason: "workflow_unreachable", error: msg, log_id: logId }, { status: 502 })
  }
  const text = await res.text()
  let out: any = null
  try { out = JSON.parse(text) } catch { /* not json */ }
  if (!res.ok) {
    const msg = out?.error || out?.message || text.slice(0, 300) || `Workflow returned ${res.status}`
    await finish("failed", { stage: "workflow_error", http_status: res.status, error: msg, n8n_response: text.slice(0, 20000) })
    return NextResponse.json({ ok: false, reason: "workflow_error", error: `Processing failed: ${msg}`, log_id: logId }, { status: 502 })
  }
  // n8n can answer "started" straight away (webhook set to respond immediately) — then the portal waits for the
  // outcome itself by watching for the records the workflow writes.
  const answeredEarly = /workflow (was )?started/i.test(text) || !text.trim()
  const outcome = await waitForOutcome(admin, { clientCode, kind, messageId: merged.message_id ? normId(merged.message_id) : null, filename, since: started - 2000, patient: answeredEarly, deadline: started + 112_000 })
  // A carrier quote dropped inside a request belongs to that request: if the workflow could not link it (no RFQ reference
  // in the email, or it never passed the request on), link it here, the same way the "Link to request" action does.
  if (outcome.found && kind === "carrier_reply" && freightRequestId && outcome.result.linked === false && outcome.result.quote_id) {
    try {
      const lr = await fetch(new URL("/api/carrier-quotes/link", req.url), {
        method: "POST", headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
        body: JSON.stringify({ quote_id: outcome.result.quote_id, freight_request_id: freightRequestId }),
      })
      if (lr.ok) outcome.result = { ...outcome.result, linked: true, request_id: freightRequestId, linked_by: "dropped_in_request" }
      else { const e = await lr.json().catch(() => null); outcome.result = { ...outcome.result, link_error: e?.error ?? `HTTP ${lr.status}` } }
    } catch { /* leave it as a non-linked quote */ }
  }
  const resultObj = { ...(out && typeof out === "object" ? { response: out } : {}), ...outcome.result }
  if (outcome.found) {
    await finish("success", { stage: "done", http_status: res.status, n8n_response: text.slice(0, 20000), result: resultObj, freight_request_id: outcome.result.request_id ?? freightRequestId })
    return NextResponse.json({ ok: true, kind, mailbox: matched, subject: merged.subject, from: merged.from_email, attachments: atts.length, result: { ...(out && typeof out === "object" ? out : {}), ...outcome.result }, log_id: logId })
  }
  // n8n finished without error but nothing new was recorded: stopped by a filter / duplicate rule, or still running.
  const note = answeredEarly
    ? "The email was accepted but no result appeared in time. It may still be processing — check the Intake log again shortly."
    : "Processing finished without creating a record. The email may have been skipped by a rule (duplicate, unknown mailbox or filter)."
  await finish("unconfirmed", { stage: "no_record", http_status: res.status, n8n_response: text.slice(0, 20000), error: note, result: resultObj })
  return NextResponse.json({ ok: false, reason: "no_record", error: note, log_id: logId }, { status: 202 })
}

/** Looks for what the workflow wrote for this email; polls for it when n8n answered before finishing. */
async function waitForOutcome(
  admin: any,
  a: { clientCode: string; kind: string; messageId: string | null; filename: string; since: number; patient: boolean; deadline: number },
): Promise<{ found: boolean; result: Record<string, any> }> {
  const sinceIso = new Date(a.since).toISOString()
  const look = async (): Promise<Record<string, any> | null> => {
    if (a.kind === "carrier_reply") {
      let q = admin.from("carrier_quotes").select("*").eq("client_code", a.clientCode).gte("created_at", sinceIso)
      // the workflow may store the Message-ID with or without the angle brackets
      q = a.messageId ? q.in("email_message_id", [a.messageId, `<${a.messageId}>`]) : q.eq("intake_filename", a.filename)
      const { data } = await q.order("created_at", { ascending: false }).limit(1)
      const r = data?.[0]
      return r ? { outcome: "carrier_quote", quote_id: r.id, request_id: r.freight_request_id ?? null, review_status: r.review_status ?? null, linked: !!r.freight_request_id } : null
    }
    // requests: the inbound_emails row says how it was matched; freight_requests says what was created.
    let rec: any = null
    if (a.messageId) {
      const { data } = await admin.from("inbound_emails").select("kind, match_method, match_confidence, match_reason, review_status, freight_request_id").eq("client_code", a.clientCode).eq("message_id", a.messageId).limit(1)
      rec = data?.[0] ?? null
    }
    let fq = admin.from("freight_requests").select("id, request_ref, related_request_id, created_at").eq("client_code", a.clientCode).gte("created_at", sinceIso)
    fq = a.messageId ? fq.eq("message_id", a.messageId) : fq.eq("intake_filename", a.filename).eq("intake_source", "manual")
    const { data: fr } = await fq.order("created_at", { ascending: false }).limit(1)
    const req = fr?.[0] ?? null
    if (!req && !rec?.freight_request_id) return null
    let ref: string | null = req?.request_ref ?? null
    const reqId = req?.id ?? rec?.freight_request_id ?? null
    if (!ref && reqId) {
      const { data: r2 } = await admin.from("freight_requests").select("request_ref").eq("id", reqId).maybeSingle()
      ref = r2?.request_ref ?? null
    }
    const isReply = rec?.kind === "requester_reply"
    return {
      outcome: isReply ? "linked_as_reply" : req?.related_request_id ? "new_possible_reply" : "new_request",
      request_id: reqId, request_ref: ref, related_request_id: req?.related_request_id ?? null,
      match_method: rec?.match_method ?? null, match_confidence: rec?.match_confidence ?? null,
      match_reason: rec?.match_reason ?? null, review_status: rec?.review_status ?? null,
    }
  }
  const first = await look()
  if (first) return { found: true, result: first }
  if (!a.patient) return { found: false, result: {} }
  while (Date.now() < a.deadline) {
    await new Promise((r) => setTimeout(r, 2500))
    const r = await look()
    if (r) return { found: true, result: r }
  }
  return { found: false, result: {} }
}
