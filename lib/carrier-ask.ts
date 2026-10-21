/**
 * lib/carrier-ask.ts  (server only)
 *
 * Asks a carrier to correct a quote that failed one of the company's checks (lib/quote-rules.ts).
 *  - draftAsk:   the ready-made email for one saved carrier quote (what the one-click button shows)
 *  - sendAsk:    sends it through the company's email server and records it
 *  - autoAsk:    runs right after a quote is saved: asks when a rule says "ask", up to the company's maximum per request and carrier
 * The subject carries the RFQ reference, so the corrected quote links back to the same request.
 */
import { applyTemplate } from "@/lib/template-render"
import { loadSmtp } from "@/lib/notify"
import { sendClientMail } from "@/lib/mailer"
import { mailProblem, rfqThread } from "@/lib/carrier-reminders"
import { cleanCarrierEmails } from "@/lib/carrier-emails"
import { DEFAULT_RULES, applyRules, cleanRules, issuesText, type QuoteRules } from "@/lib/quote-rules"
import type { Flag } from "@/lib/quote-math"

export async function loadQuoteRules(admin: any, clientCode: string): Promise<QuoteRules> {
  try {
    const { data } = await admin.from("client_settings").select("key, value").eq("client_code", clientCode).in("key", ["quote_rules", "carrier_emails"])
    const by = Object.fromEntries(((data ?? []) as any[]).map((r) => [r.key, r.value]))
    const rules = cleanRules(by.quote_rules)
    const mail = cleanCarrierEmails(by.carrier_emails)
    return { ...rules, ask_body: mail.quote_fix }
  } catch { return { ...DEFAULT_RULES } }
}

export interface AskDraft {
  to: string; cc: string[]; subject: string; body: string
  codes: string[]; asked: number; max: number
  carrier_name: string; freight_request_id: string; carrier_id: number | null
  in_reply_to: string | null
  references: string[]
  rfq_reference: string | null
}

const email = (v: unknown) => String(v ?? "").trim()

/** Builds the email for a saved carrier quote. `flags` limits it to those problems (default: every askable one on the quote). */
export async function draftAsk(admin: any, clientCode: string, quoteId: string | number, opts: { flags?: Flag[]; rules?: QuoteRules; sender?: string } = {}): Promise<AskDraft | { error: string }> {
  const { data: q } = await admin.from("carrier_quotes").select("*").eq("id", quoteId).ilike("client_code", clientCode).maybeSingle()
  if (!q) return { error: "Quote not found" }
  if (!q.freight_request_id || !q.carrier_id) return { error: "This quote isn't linked to a request and carrier yet, so there is nobody to ask." }
  const rules = opts.rules ?? await loadQuoteRules(admin, clientCode)

  const all: Flag[] = Array.isArray(q.validation_flags) ? q.validation_flags : []
  const flags = opts.flags ?? all
  const body = issuesText(flags)
  if (!body) return { error: "None of this quote's problems can be put to the carrier." }

  const [{ data: car }, { data: fr }, { data: rfq }] = await Promise.all([
    admin.from("carriers").select("id, carrier_id, carrier_name, person_name, email").eq("id", q.carrier_id).ilike("client_code", clientCode).maybeSingle(),
    admin.from("freight_requests").select("request_ref").eq("id", q.freight_request_id).ilike("client_code", clientCode).maybeSingle(),
    q.carrier_quote_request_id ? admin.from("carrier_quote_requests").select("rfq_reference").eq("id", q.carrier_quote_request_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const to = email(car?.email) || email(q.from_email)
  if (!to) return { error: "The carrier has no email address on file." }
  const cc: string[] = []
  if (car?.carrier_id != null) {
    const { data: ccs } = await admin.from("carriers").select("email").ilike("client_code", clientCode).eq("carrier_id", car.carrier_id).eq("is_cc", true).eq("active", true)
    for (const c of (ccs ?? []) as any[]) if (email(c.email)) cc.push(email(c.email))
  }

  const ref = email(rfq?.rfq_reference)
  const orig = email(q.email_subject).replace(/^((re|fw|fwd)\s*:\s*)+/i, "")
  let subject = `Re: ${orig || `Rate request ${fr?.request_ref ?? ""}`}`.trim()
  if (ref && !subject.includes(ref)) subject += ` [${ref}]`
  const signer = opts.sender || (await loadSmtp(admin, clientCode).catch(() => null))?.from_name || ""
  const text = applyTemplate(rules.ask_body, {
    contact_name: email(car?.person_name) || "there", carrier_name: email(car?.carrier_name),
    request_ref: email(fr?.request_ref), rfq_reference: ref, issues: body, sender_name: signer,
  }).replace(/\n{3,}/g, "\n\n").trim()

  const thread = await rfqThread(admin, clientCode, { freight_request_id: String(q.freight_request_id), rfq_reference: ref, email: to })
  const { count } = await admin.from("carrier_quote_asks").select("id", { count: "exact", head: true })
    .ilike("client_code", clientCode).eq("freight_request_id", q.freight_request_id).eq("carrier_id", q.carrier_id).eq("status", "sent")
  return {
    to, cc, subject, body: text, codes: flags.map((f) => f.code), asked: count ?? 0, max: rules.max_asks,
    carrier_name: email(car?.carrier_name), freight_request_id: String(q.freight_request_id), carrier_id: Number(q.carrier_id),
    in_reply_to: email(q.email_message_id) || null, references: thread.ids.slice(0, 1), rfq_reference: ref || null,
  }
}

/** Sends the email through the portal's mail gateway and records it. Never throws. */
export async function sendAsk(admin: any, clientCode: string, quoteId: string | number, d: AskDraft, mode: "auto" | "manual", by: string | null, edited?: { subject?: string; body?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const subject = edited?.subject?.trim() || d.subject, text = edited?.body?.trim() || d.body
  const log = (status: "sent" | "failed", error?: string) => admin.from("carrier_quote_asks").insert({
    client_code: clientCode, freight_request_id: d.freight_request_id, carrier_id: d.carrier_id, carrier_quote_id: String(quoteId),
    codes: d.codes, mode, status, to_email: d.to, subject, body: text, error: error ?? null, created_by: by,
  })
  try {
    const out = await sendClientMail(admin, {
      clientCode, purpose: "rfq", freightRequestId: d.freight_request_id, to: [d.to], cc: d.cc, subject, text, rfqReference: d.rfq_reference,
      idempotencyKey: `quote-ask-${quoteId}-${d.asked + 1}`,
      inReplyTo: d.in_reply_to, references: d.references,
    })
    if (out.status === "sent" || out.status === "duplicate") { await log("sent"); return { ok: true } }
    const msg = mailProblem(out)
    await log("failed", msg)
    return { ok: false, error: msg }
  } catch (e) {
    const msg = (e as Error).message || "The email could not be sent."
    await log("failed", msg).catch(() => {})
    return { ok: false, error: msg }
  }
}

/** After a quote is saved: asks the carrier when a rule is set to "ask" and the maximum for this request and carrier isn't reached. */
export async function autoAsk(admin: any, clientCode: string, quoteId: string | number, flags: Flag[], rules?: QuoteRules): Promise<{ asked: boolean; reason?: string }> {
  try {
    const r = rules ?? await loadQuoteRules(admin, clientCode)
    const { ask } = applyRules(flags, r)
    if (!ask.length) return { asked: false, reason: "no rule asks" }
    const d = await draftAsk(admin, clientCode, quoteId, { flags: ask, rules: r })
    if ("error" in d) return { asked: false, reason: d.error }
    if (d.asked >= r.max_asks) return { asked: false, reason: `already asked ${d.asked} time(s)` }
    const out = await sendAsk(admin, clientCode, quoteId, d, "auto", null)
    return out.ok ? { asked: true } : { asked: false, reason: out.error }
  } catch (e) { return { asked: false, reason: (e as Error).message } }
}
