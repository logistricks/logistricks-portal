/**
 * Helpers for carrier quotes that arrive without a clear link:
 *  - resolveCarrierPk: which of the client's carriers (carriers.id) sent a reply
 *  - suggestForQuotes: the open requests a non-linked quote most likely belongs to, with the reasons
 */

const FREE_MAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|aol|proton|protonmail|gmx|mail|yandex)\./i

const tokens = (s: unknown): string[] =>
  String(s ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 2)
const overlaps = (a: unknown, b: unknown): boolean => {
  const A = new Set(tokens(a))
  return tokens(b).some((w) => A.has(w))
}
const domainOf = (e: unknown): string => String(e ?? "").toLowerCase().split("@")[1]?.trim() ?? ""

type CarrierRow = { id: number; email: string | null; carrier_name: string | null }

async function loadCarriers(admin: any, clientCode: string): Promise<CarrierRow[]> {
  const { data } = await admin.from("carriers").select("id, email, carrier_name").ilike("client_code", clientCode).eq("is_cc", false)
  return (data ?? []) as CarrierRow[]
}

function pickCarrier(carriers: CarrierRow[], fromEmail: string | null | undefined, preferIds?: Set<number>): number | null {
  const wanted = String(fromEmail ?? "").trim().toLowerCase()
  if (!wanted) return null
  const exact = carriers.find((c) => (c.email ?? "").trim().toLowerCase() === wanted)
  if (exact) return exact.id
  const dom = domainOf(wanted)
  if (!dom || FREE_MAIL.test(dom)) return null
  const same = carriers.filter((c) => domainOf(c.email) === dom)
  if (!same.length) return null
  return (preferIds && same.find((c) => preferIds.has(c.id))?.id) ?? same[0].id
}

/** Which carrier sent this? Exact address, else a carrier on the same company domain, else the only carrier still owing a quote on that request. */
export async function resolveCarrierPk(admin: any, clientCode: string, fromEmail: string | null | undefined, requestId?: string | null): Promise<number | null> {
  const carriers = await loadCarriers(admin, clientCode)
  let waiting: Set<number> | undefined
  if (requestId) {
    const { data } = await admin.from("carrier_quote_requests").select("carrier_id, carrier_quotes ( id )").eq("freight_request_id", requestId)
    waiting = new Set(((data ?? []) as any[]).filter((r) => !(r.carrier_quotes ?? []).length).map((r) => r.carrier_id as number))
  }
  const hit = pickCarrier(carriers, fromEmail, waiting)
  if (hit) return hit
  if (waiting && waiting.size === 1) return Array.from(waiting)[0]
  return null
}

export interface QuoteSuggestion {
  id: string
  ref: string
  senderName: string
  route: string
  cargoType: string
  score: number
  reasons: string[]
  carrierId: number | null
  rfqSentToCarrier: boolean
}

/** For each non-linked quote: up to 3 open requests it probably belongs to, best first. */
export async function suggestForQuotes(admin: any, clientCode: string, quotes: any[]): Promise<Record<number, QuoteSuggestion[]>> {
  const out: Record<number, QuoteSuggestion[]> = {}
  if (!quotes.length) return out
  const cols = "id, request_ref, sender_name, origin_city, destination_city, cargo_type, received_at"
  const { data: reqs } = await admin.from("freight_requests").select(cols).ilike("client_code", clientCode).eq("is_done", false).neq("status", "Closed").order("received_at", { ascending: false }).limit(300)
  const requests = (reqs ?? []) as any[]
  if (!requests.length) return out
  const [carriers, rfqRes] = await Promise.all([
    loadCarriers(admin, clientCode),
    admin.from("carrier_quote_requests").select("freight_request_id, carrier_id, email_thread_id, sent_at, carrier_quotes ( id )").in("freight_request_id", requests.map((r) => r.id)),
  ])
  const rfqs = (rfqRes.data ?? []) as any[]
  const now = Date.now()

  for (const q of quotes) {
    const carrierPk: number | null = q.carrier_id ?? pickCarrier(carriers, q.from_email)
    const text = `${q.email_subject ?? ""}\n${q.raw_reply ?? ""}`
    const refs = new Set((text.match(/\bLT-\d+\b/gi) ?? []).map((x) => x.toUpperCase()))
    const list: QuoteSuggestion[] = []
    for (const r of requests) {
      let score = 0
      const reasons: string[] = []
      const ref = String(r.request_ref ?? "")
      if (ref && refs.has(ref.toUpperCase())) { score += 100; reasons.push(`The email mentions ${ref}`) }
      const mine = rfqs.filter((x) => x.freight_request_id === r.id)
      if (q.email_thread_id && mine.some((x) => x.email_thread_id === q.email_thread_id)) { score += 90; reasons.push("Same email thread as the RFQ") }
      const toCarrier = carrierPk ? mine.filter((x) => x.carrier_id === carrierPk) : []
      if (toCarrier.length) {
        const waiting = toCarrier.some((x) => !(x.carrier_quotes ?? []).length)
        score += waiting ? 45 : 20
        reasons.push(waiting ? "RFQ was sent to this carrier and is still waiting for its quote" : "RFQ was sent to this carrier")
        const last = Math.max(...toCarrier.map((x) => Date.parse(x.sent_at ?? "") || 0))
        if (last && now - last < 14 * 86400000) score += 5
      }
      const from = overlaps(`${q.origin_place ?? ""} ${q.origin_code ?? ""}`, r.origin_city)
      const to = overlaps(`${q.destination_place ?? ""} ${q.destination_code ?? ""}`, r.destination_city)
      if (from) { score += 20; reasons.push("Same origin") }
      if (to) { score += 20; reasons.push("Same destination") }
      if (overlaps(q.commodity_description, r.cargo_type)) { score += 10; reasons.push("Same commodity") }
      if (score < 40) continue
      list.push({
        id: r.id, ref: ref || `LT-${String(r.id).slice(0, 8).toUpperCase()}`, senderName: r.sender_name ?? "Unknown",
        route: [[r.origin_city].filter(Boolean).join(""), [r.destination_city].filter(Boolean).join("")].filter(Boolean).join(" → "),
        cargoType: r.cargo_type ?? "", score, reasons, carrierId: carrierPk, rfqSentToCarrier: toCarrier.length > 0,
      })
    }
    list.sort((a, b) => b.score - a.score)
    if (list.length) out[q.id] = list.slice(0, 3)
  }
  return out
}
