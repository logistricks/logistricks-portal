/**
 * GET /api/request-timeline?freight_request_id=<uuid>
 * The complete path of one request, oldest first: every email in and out, with exact times, from → to, and the text.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"

export const runtime = "nodejs"

export type TimelineEvent = {
  id: string
  at: string
  kind: "request_sent" | "added" | "requester_reply" | "rfq_sent" | "carrier_reply" | "reply_sent" | "quotation_sent" | "failed" | "outcome"
  title: string
  from: string | null
  to: string | null
  subject: string | null
  body: string | null
  note: string | null
}

const ts = (v: unknown) => { const t = Date.parse(String(v ?? "")); return Number.isNaN(t) ? null : t }
const who = (name: unknown, email: unknown) => {
  const n = String(name ?? "").trim(), e = String(email ?? "").trim()
  return n && e && n.toLowerCase() !== e.toLowerCase() ? `${n} <${e}>` : e || n || null
}
const stripHtml = (h: string) => h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim()
function dur(ms: number) {
  let s = Math.floor(Math.abs(ms) / 1000); const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60
  const p = (n: number) => String(n).padStart(2, "0")
  return d ? `${d}d ${h}h ${p(m)}m ${p(s)}s` : h ? `${h}h ${p(m)}m ${p(s)}s` : m ? `${m}m ${p(s)}s` : `${s}s`
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = new URL(req.url).searchParams.get("freight_request_id")
  if (!id) return NextResponse.json({ error: "freight_request_id required" }, { status: 400 })

  const admin = adminClient()
  const { data: fr } = await admin.from("freight_requests").select("*").eq("id", id).ilike("client_code", session.clientCode).maybeSingle()
  if (!fr) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const code = String(fr.client_code)

  const [inb, outb, rfqs, quotes, qtns] = await Promise.all([
    admin.from("inbound_emails").select("*").eq("freight_request_id", id).ilike("client_code", code).order("received_at", { ascending: true }),
    admin.from("outbound_emails").select("*").eq("freight_request_id", id).ilike("client_code", code).order("created_at", { ascending: true }),
    admin.from("carrier_quote_requests").select("id, carrier_id, sent_at, responded_at, rfq_reference, status, carriers ( carrier_name, email )").eq("freight_request_id", id),
    admin.from("carrier_quotes").select("*").eq("freight_request_id", id).order("received_at", { ascending: true }),
    admin.from("quotations").select("*").eq("freight_request_id", id).ilike("client_code", code),
  ])
  const inbound = (inb.data ?? []) as any[]
  const outbound = (outb.data ?? []) as any[]
  const rfqRows = (rfqs.data ?? []) as any[]
  const quoteRows = (quotes.data ?? []) as any[]
  const quotations = (qtns.data ?? []) as any[]

  const ev: TimelineEvent[] = []
  const sender = who(fr.sender_name, fr.sender_email)
  const first = inbound.find((e) => e.kind === "request")
  const mailbox = String(first?.to_emails?.[0] ?? "") || "your mailbox"
  const ourFrom = String(outbound.find((o) => o.from_email)?.from_email ?? "") || "Portal"

  // 1. the original email, as sent by the requester
  const sentAt = first?.received_at ?? fr.received_at
  ev.push({ id: "req-sent", at: new Date(sentAt).toISOString(), kind: "request_sent", title: "Request email sent",
    from: sender, to: mailbox, subject: fr.subject ?? first?.subject ?? null, body: fr.raw_message ?? first?.body_text ?? null, note: null })
  // 2. when the portal took it in
  const added = ts(fr.created_at)
  if (added != null) {
    const lag = added - Date.parse(sentAt)
    ev.push({ id: "req-added", at: new Date(added).toISOString(), kind: "added", title: "Added to the portal", from: null, to: null, subject: null, body: null,
      note: lag > 1000 ? `${dur(lag)} after it was sent${fr.intake_source === "manual" ? " (dropped in by hand)" : ""}` : fr.intake_source === "manual" ? "Dropped in by hand" : null })
  }

  // 3. the requester answering us
  for (const e of inbound) {
    if (e.kind !== "requester_reply") continue
    const lag = ts(e.created_at) != null ? Date.parse(e.created_at) - Date.parse(e.received_at) : 0
    ev.push({ id: `in-${e.id}`, at: new Date(e.received_at).toISOString(), kind: "requester_reply", title: "Requester replied",
      from: who(e.from_name, e.from_email) ?? sender, to: (e.to_emails ?? [])[0] ?? mailbox, subject: e.subject, body: e.body_text,
      note: lag > 5000 ? `Reached the portal ${dur(lag)} later` : null })
  }

  // 4. everything we sent (RFQs to carriers, replies to the requester)
  const outTimes: { at: number; to: string[]; kind: string; ref: string | null }[] = []
  for (const o of outbound) {
    const at = ts(o.sent_at) ?? ts(o.created_at)!
    const to = (o.to_emails ?? []) as string[]
    if (o.status !== "sent") {
      ev.push({ id: `out-${o.id}`, at: new Date(at).toISOString(), kind: "failed", title: o.status === "failed" ? "Email failed to send" : "Email not sent",
        from: o.from_email ?? ourFrom, to: to.join(", "), subject: o.subject, body: o.body_text ?? null, note: o.error ?? null })
      continue
    }
    outTimes.push({ at, to: to.map((x) => x.toLowerCase()), kind: o.purpose, ref: o.rfq_reference ?? null })
    ev.push({ id: `out-${o.id}`, at: new Date(at).toISOString(), kind: o.purpose === "rfq" ? "rfq_sent" : "reply_sent",
      title: o.purpose === "rfq" ? "RFQ sent to carrier" : "Reply sent to requester",
      from: o.from_email ?? ourFrom, to: to.join(", "), subject: o.subject, body: o.body_text ?? null,
      note: o.redirected ? "Test mode: delivered to the test address instead" : null })
  }

  // RFQs from before emails were logged
  const carrierName = new Map<string, string>()
  for (const r of rfqRows) {
    const mail = String(r.carriers?.email ?? "").toLowerCase()
    carrierName.set(String(r.id), r.carriers?.carrier_name ?? mail)
    const t = ts(r.sent_at); if (t == null) continue
    const logged = outTimes.some((o) => o.kind === "rfq" && ((o.ref && o.ref === r.rfq_reference) || (mail && o.to.includes(mail) && Math.abs(o.at - t) < 30 * 60_000)))
    if (logged) continue
    ev.push({ id: `rfq-${r.id}`, at: new Date(t).toISOString(), kind: "rfq_sent", title: "RFQ sent to carrier", from: ourFrom, to: who(r.carriers?.carrier_name, mail),
      subject: null, body: null, note: "From the RFQ log (the email text was not saved)" })
  }

  // 5. replies / confirmations recorded on the request itself (older ones, before emails were logged)
  const conv = Array.isArray(fr.conversation) ? fr.conversation as any[] : []
  for (const [i, m] of conv.entries()) {
    if (m?.role !== "system") continue
    const t = ts(m.sent_at); if (t == null) continue
    if (outTimes.some((o) => o.kind === "reply" && Math.abs(o.at - t) < 90_000)) continue
    const label = m.type === "missing_fields" ? "Asked the requester for missing details" : m.type === "complete" ? "Confirmation sent to requester" : m.type === "acknowledgement" ? "Acknowledgement sent to requester" : "Reply sent to requester"
    ev.push({ id: `conv-${i}`, at: new Date(t).toISOString(), kind: "reply_sent", title: label, from: ourFrom, to: sender, subject: null, body: stripHtml(String(m.body ?? "")), note: null })
  }

  // 6. carrier replies and quotes, with the exact time the carrier took
  const rfqSentFor = (q: any): number | null => {
    const row = rfqRows.find((r) => String(r.id) === String(q.carrier_quote_request_id)) ?? rfqRows.find((r) => r.carrier_id === q.carrier_id)
    if (!row) return null
    const mail = String(row.carriers?.email ?? "").toLowerCase()
    const t = ts(row.sent_at)
    const exact = outTimes.filter((o) => o.kind === "rfq" && ((o.ref && o.ref === row.rfq_reference) || (mail && o.to.includes(mail)))).map((o) => o.at)
    if (t != null && exact.length) return exact.sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0]
    return t
  }
  const RT: Record<string, string> = { quote: "Quote received", update: "Updated quote received", counter_offer: "Counter-offer received", counter: "Counter-offer received", decline: "Carrier declined", info_request: "Carrier asked a question", other: "Carrier replied" }
  for (const q of quoteRows) {
    const at = ts(q.received_at); if (at == null) continue
    const row = rfqRows.find((r) => String(r.id) === String(q.carrier_quote_request_id)) ?? rfqRows.find((r) => r.carrier_id === q.carrier_id)
    const name = row?.carriers?.carrier_name ?? q.from_email ?? "carrier"
    const sent = rfqSentFor(q)
    const price = q.rate_usd != null ? `${q.rate_currency ?? "USD"} ${Number(q.rate_usd).toLocaleString("en-US")}` : null
    ev.push({ id: `cq-${q.id}`, at: new Date(at).toISOString(), kind: "carrier_reply", title: `${RT[q.response_type ?? "quote"] ?? "Carrier replied"} — ${name}`,
      from: who(name, q.from_email ?? row?.carriers?.email), to: mailbox, subject: q.email_subject ?? null, body: q.raw_reply ?? q.notes ?? null,
      note: [sent != null && at >= sent ? `Responded in ${dur(at - sent)}` : null, price ? `Quoted ${price}` : null].filter(Boolean).join(" · ") || null })
  }

  // 7. the quotation sent to the requester
  for (const q of quotations) {
    const t = ts(q.sent_at); if (t == null || q.status !== "sent") continue
    if (outTimes.some((o) => o.kind === "reply" && Math.abs(o.at - t) < 120_000)) continue
    ev.push({ id: `qt-${q.id}`, at: new Date(t).toISOString(), kind: "quotation_sent", title: "Quotation sent to requester", from: ourFrom, to: sender,
      subject: q.generated_subject ?? null, body: q.generated_body ? stripHtml(String(q.generated_body)) : null, note: null })
  }

  // 8. the deal: won / lost, booking, invoice, payment (no email — set by a person)
  const usd = (n: unknown) => n != null ? `USD ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null
  if (fr.outcome && ts(fr.outcome_at) != null) {
    const label: Record<string, string> = { won: "Marked WON", lost: "Marked LOST", expired: "Quote expired", cancelled: "Cancelled" }
    ev.push({ id: "outcome", at: new Date(fr.outcome_at).toISOString(), kind: "outcome", title: `${label[fr.outcome] ?? fr.outcome}${fr.won_carrier_name ? ` — ${fr.won_carrier_name}` : ""}`,
      from: fr.outcome_by ?? null, to: null, subject: null, body: fr.outcome_note ?? null,
      note: [fr.outcome === "won" && fr.won_sell_usd != null ? `Sold at ${usd(fr.won_sell_usd)}` : null, fr.won_margin_usd != null ? `margin ${usd(fr.won_margin_usd)}` : null,
        fr.outcome_reason ? `Reason: ${String(fr.outcome_reason).replace(/_/g, " ")}` : null].filter(Boolean).join(" · ") || null })
  }
  if (ts(fr.booked_at) != null) ev.push({ id: "booked", at: new Date(fr.booked_at).toISOString(), kind: "outcome", title: `Booked${fr.booking_reference ? ` — ref ${fr.booking_reference}` : ""}`, from: null, to: null, subject: null, body: fr.booking_description ?? null, note: null })
  if (ts(fr.invoiced_at) != null) ev.push({ id: "invoiced", at: new Date(fr.invoiced_at).toISOString(), kind: "outcome", title: "Invoiced", from: null, to: null, subject: null, body: null, note: null })
  if (ts(fr.paid_at) != null) ev.push({ id: "paid", at: new Date(fr.paid_at).toISOString(), kind: "outcome", title: "Payment received", from: null, to: null, subject: null, body: null, note: null })

  ev.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return NextResponse.json({ events: ev })
}
