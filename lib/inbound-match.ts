/**
 * Provider-independent "is this email a reply?" resolver.
 * Order: duplicate → carrier → provider thread → Message-ID headers → request number in the text →
 * same sender + same subject → candidate shortlist for the AI (or "new" when the sender has no history).
 */
export const normId = (v: unknown) => String(v ?? "").trim().replace(/^<+|>+$/g, "").trim().toLowerCase()
export const parseIds = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v.join(" ") : String(v ?? "")
  return Array.from(new Set((raw.match(/<[^>]+>/g) ?? raw.split(/[\s,]+/)).map(normId).filter(Boolean)))
}
export const addrs = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v.join(",") : String(v ?? "")
  return Array.from(new Set((raw.match(/[^\s<>,;"']+@[^\s<>,;"']+/g) ?? []).map((a) => a.toLowerCase())))
}
/** Strip Re:/Fwd:/AW:/[EXTERNAL] etc. so subjects of one conversation compare equal. */
export function normSubject(s: unknown): string {
  let t = String(s ?? "").trim()
  for (let i = 0; i < 8; i++) {
    const n = t.replace(/^\s*(\[[^\]]{1,30}\]\s*)+/, "").replace(/^\s*(re|fw|fwd|aw|wg|sv|vs|tr|rv|رد|الرد|إعادة توجيه)(\[\d+\])?\s*:\s*/i, "")
    if (n === t) break
    t = n
  }
  return t.toLowerCase().replace(/\s+/g, " ").trim()
}
const FREE = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "msn.com", "zoho.com"])
const domainOf = (e: string) => e.split("@")[1] ?? ""

export interface InboundEmail {
  to?: unknown; mailbox?: unknown; from_email?: string; from_name?: string; subject?: string
  message_id?: unknown; in_reply_to?: unknown; references?: unknown; provider_thread_id?: string
  received_at?: string; body_text?: string; source?: string
}

const OPEN = (s: string | null) => s !== "Closed" && s !== "Rejected"
const excerpt = (t: string | null) => String(t ?? "").replace(/\s+/g, " ").slice(0, 600)
const brief = (r: any) => ({
  id: r.id, request_ref: r.request_ref, subject: r.subject ?? null, status: r.status, received_at: r.received_at,
  sender_name: r.sender_name, sender_email: r.sender_email,
  origin: [r.origin_city, r.origin_country].filter(Boolean).join(", ") || null,
  destination: [r.destination_city, r.destination_country].filter(Boolean).join(", ") || null,
  cargo_type: r.cargo_type, weight: r.weight, equipment: r.equipment, incoterm: r.incoterm,
  missing_fields: r.missing_fields ?? [], first_message: excerpt(r.raw_message),
})

export async function mailboxClient(admin: any, mailboxes: string[]): Promise<string | null> {
  if (!mailboxes.length) return null
  const { data: a } = await admin.from("client_receiver_emails").select("client_code, r_mail").in("r_mail", mailboxes).eq("active", true).limit(1)
  if (a?.[0]) return a[0].client_code
  const { data: b } = await admin.from("email_sources").select("client_code, ms_email, imap_username").or(mailboxes.map((m) => `ms_email.eq.${m},imap_username.eq.${m}`).join(",")).limit(1)
  return b?.[0]?.client_code ?? null
}

export async function resolveInbound(admin: any, e: InboundEmail) {
  const mailboxes = addrs([e.mailbox, e.to].flat().filter(Boolean))
  const clientCode = await mailboxClient(admin, mailboxes)
  if (!clientCode) return { decision: "unknown_mailbox" as const, mailboxes }

  const from = addrs(e.from_email)[0] ?? ""
  const messageId = normId(e.message_id)
  const refsIds = Array.from(new Set([...parseIds(e.in_reply_to), ...parseIds(e.references)]))
  const subjectN = normSubject(e.subject)
  const text = `${e.subject ?? ""}\n${String(e.body_text ?? "").slice(0, 30000)}`
  const base = { client_code: clientCode, subject_normalized: subjectN, message_id: messageId || null, from_email: from }

  // 1. duplicate
  if (messageId) {
    const { data } = await admin.from("inbound_emails").select("id, freight_request_id").eq("client_code", clientCode).eq("message_id", messageId).maybeSingle()
    if (data) return { ...base, decision: "duplicate" as const, freight_request_id: data.freight_request_id }
  }

  // 2. a carrier we sent an RFQ to → hand over to the carrier-reply flow
  if (from) {
    const { data: cs } = await admin.from("carriers").select("id").eq("client_code", clientCode).ilike("email", from).limit(5)
    // A carrier's address alone is not enough (it may also send us a fresh request): only treat it as a carrier
    // reply when the mail looks like a reply — header references, a Re:/AW: subject, or one of our RFQ codes.
    const looksLikeReply = refsIds.length > 0 || /^\s*(re|aw|sv|rv)\s*:/i.test(String(e.subject ?? "")) || /RFQ-[0-9a-f]{8}-\d+-[0-9a-f]{6}/i.test(text)
    if (cs?.length && looksLikeReply) {
      const { data: rfqs } = await admin.from("carrier_quote_requests").select("id, freight_request_id, rfq_reference, sent_at, status").in("carrier_id", cs.map((c: any) => c.id)).order("sent_at", { ascending: false }).limit(10)
      if (rfqs?.length) return { ...base, decision: "carrier_reply" as const, method: "carrier_sender", confidence: 0.8, rfqs }
    }
  }

  const full = async (id: string) => (await admin.from("freight_requests").select("*").eq("id", id).maybeSingle()).data
  const reply = async (id: string, method: string, confidence: number, reason: string) => {
    const request = await full(id)
    return request ? { ...base, decision: "reply" as const, method, confidence, reason, request_id: id, request } : null
  }

  // 3. provider thread id (Gmail threadId, Graph conversationId)
  if (e.provider_thread_id) {
    const { data } = await admin.from("freight_requests").select("id").eq("client_code", clientCode).eq("gmail_thread_id", e.provider_thread_id).limit(1)
    if (data?.[0]) { const r = await reply(data[0].id, "thread", 0.98, "Same provider thread as the request"); if (r) return r }
    const { data: ie } = await admin.from("inbound_emails").select("freight_request_id").eq("client_code", clientCode).eq("provider_thread_id", e.provider_thread_id).not("freight_request_id", "is", null).limit(1)
    if (ie?.[0]) { const r = await reply(ie[0].freight_request_id, "thread", 0.97, "Same provider thread as a linked email"); if (r) return r }
  }

  // 4. Message-ID headers (In-Reply-To / References) against everything we stored
  if (refsIds.length) {
    const { data } = await admin.from("inbound_emails").select("freight_request_id").eq("client_code", clientCode).in("message_id", refsIds).not("freight_request_id", "is", null).limit(5)
    const ids = Array.from(new Set((data ?? []).map((x: any) => x.freight_request_id)))
    if (ids.length === 1) { const r = await reply(ids[0] as string, "headers", 0.99, "In-Reply-To / References point to a stored email of this request"); if (r) return r }
    const { data: fr } = await admin.from("freight_requests").select("id").eq("client_code", clientCode).in("message_id", refsIds).limit(2)
    if (fr?.length === 1) { const r = await reply(fr[0].id, "headers", 0.99, "In-Reply-To / References point to the original request email"); if (r) return r }
  }

  // pool of the client's recent / open requests
  const since = new Date(Date.now() - 90 * 86400_000).toISOString()
  const { data: pool } = await admin.from("freight_requests")
    .select("id, request_ref, subject, status, received_at, updated_at, sender_name, sender_email, origin_city, origin_country, destination_city, destination_country, cargo_type, weight, equipment, incoterm, missing_fields, raw_message")
    .eq("client_code", clientCode).or(`status.not.in.(Closed,Rejected),received_at.gte.${since}`).order("received_at", { ascending: false }).limit(600)
  const rows: any[] = pool ?? []

  // 5. our request number quoted in the subject or body
  const hits = rows.filter((r) => r.request_ref && new RegExp(`(?<![A-Za-z0-9-])${String(r.request_ref).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9])`, "i").test(text))
  if (hits.length === 1) { const r = await reply(hits[0].id, "ref_code", 0.97, `Request number ${hits[0].request_ref} found in the email`); if (r) return r }
  if (hits.length > 1) {
    const inSubject = hits.filter((r) => String(e.subject ?? "").toUpperCase().includes(String(r.request_ref).toUpperCase()))
    if (inSubject.length === 1) { const r = await reply(inSubject[0].id, "ref_code", 0.95, `Request number ${inSubject[0].request_ref} in the subject`); if (r) return r }
  }

  // 6. same sender + same subject, exactly one open request
  const bySender = rows.filter((r) => from && String(r.sender_email ?? "").toLowerCase() === from)
  if (subjectN) {
    const same = bySender.filter((r) => OPEN(r.status) && r.subject && normSubject(r.subject) === subjectN)
    if (same.length === 1) { const r = await reply(same[0].id, "subject_sender", 0.9, "Same sender and same subject as an open request"); if (r) return r }
  }

  // 7. shortlist for the AI: this sender's open requests + closed in the last 30 days, then colleagues at the same company
  const cutoff = Date.now() - 30 * 86400_000
  const recent = (r: any) => OPEN(r.status) || Date.parse(r.updated_at ?? r.received_at) >= cutoff
  let cands = bySender.filter(recent)
  const dom = domainOf(from)
  if (dom && !FREE.has(dom)) cands = [...cands, ...rows.filter((r) => String(r.sender_email ?? "").toLowerCase() !== from && domainOf(String(r.sender_email ?? "").toLowerCase()) === dom && recent(r))]
  cands = cands.slice(0, 8)
  if (!cands.length) return { ...base, decision: "new" as const, method: "no_history", confidence: 0.9, reason: "No open or recent request from this sender" }
  return { ...base, decision: "undetermined" as const, candidates: cands.map(brief), hint_ref_hits: hits.map((h) => h.request_ref) }
}
