/**
 * lib/pipeline-health.ts  (server only)
 *
 * "Pipeline Health": how well requests were handled in a period, measured against the same time limits the Tasks page
 * uses (Admin → Task Setup). Every step of a request is either on time, late, or not due yet (not counted):
 *   Confirm fields (25) · Send to carriers (25) · Prepare quotation (20) · Send quotation (15) · Close the loop (15)
 * Score = weighted share of steps that were on time. Steps with nothing to measure are left out and the rest re-weighted.
 */
import { computeTasks, type TaskLimits } from "@/lib/task-rules"

const H = 3600_000
const ts = (v: unknown) => { const n = v ? Date.parse(String(v)) : NaN; return isNaN(n) ? 0 : n }
const firstOf = (xs: number[]) => { const f = xs.filter(Boolean); return f.length ? Math.min(...f) : 0 }

export const PARTS = [
  { key: "confirm", label: "Confirm the fields", hint: "New request → fields checked or acknowledged", weight: 25 },
  { key: "rfq", label: "Send to carriers", hint: "Fields confirmed → carriers asked for rates", weight: 25 },
  { key: "prepare", label: "Prepare the quotation", hint: "First carrier quote in → quotation prepared", weight: 20 },
  { key: "send", label: "Send the quotation", hint: "Quotation prepared → sent to the requester", weight: 15 },
  { key: "close", label: "Close the loop", hint: "Quotation sent → outcome recorded in time", weight: 15 },
] as const
type PartKey = (typeof PARTS)[number]["key"]
type Tally = Record<PartKey, { ok: number; total: number }>
const blank = (): Tally => ({ confirm: { ok: 0, total: 0 }, rfq: { ok: 0, total: 0 }, prepare: { ok: 0, total: 0 }, send: { ok: 0, total: 0 }, close: { ok: 0, total: 0 } })

function tally(into: Tally, k: PartKey, ok: boolean) { into[k].total++; if (ok) into[k].ok++ }

/** Score a group of requests (those received in one window). */
function scoreGroup(reqs: any[], rfqBy: Map<string, number[]>, cqBy: Map<string, number[]>, quoBy: Map<string, any[]>, L: TaskLimits, now: number): Tally {
  const T = blank()
  for (const r of reqs) {
    if (r.status === "Rejected") continue
    const id = String(r.id), t0 = ts(r.received_at)
    if (!t0) continue
    const rfqs = rfqBy.get(id) ?? [], quotes = cqBy.get(id) ?? [], quos = quoBy.get(id) ?? []
    const firstRfq = firstOf(rfqs), firstQuote = firstOf(quotes)
    const ack = ["acknowledgement", "complete", "manual"].includes(String(r.reply_sent_type)) ? ts(r.replied_at) : 0
    const confirmedAt = firstOf([ts(r.fields_confirmed_at), ack, firstRfq, firstQuote])

    // 1 confirm
    if (confirmedAt) tally(T, "confirm", confirmedAt - t0 <= L.confirm_h * H)
    else if (now - t0 > L.confirm_h * H) tally(T, "confirm", false)

    // 2 send to carriers
    const base = confirmedAt || 0
    if (firstRfq) tally(T, "rfq", firstRfq - (base || t0) <= L.rfq_h * H)
    else if (base && now - base > L.rfq_h * H) tally(T, "rfq", false)

    // 3 prepare the quotation
    const created = firstOf(quos.map((q) => ts(q.created_at)))
    if (firstQuote) {
      if (created) tally(T, "prepare", created - firstQuote <= L.quotation_h * H)
      else if (now - firstQuote > L.quotation_h * H) tally(T, "prepare", false)
    }

    // 4 send the quotation
    if (created) {
      const sent = firstOf(quos.filter((q) => q.status === "sent").map((q) => ts(q.sent_at ?? q.created_at)))
      if (sent) tally(T, "send", sent - created <= L.send_h * H)
      else if (now - created > L.send_h * H) tally(T, "send", false)
    }

    // 5 close the loop: a quotation sent more than follow-up hours ago should have an outcome by now
    const sentAt = firstOf(quos.filter((q) => q.status === "sent").map((q) => ts(q.sent_at ?? q.created_at)))
    if (sentAt && now - sentAt > L.followup_h * H) tally(T, "close", !!r.outcome || r.status === "Closed")
  }
  return T
}

function combine(T: Tally) {
  let w = 0, s = 0
  const parts = PARTS.map((p) => {
    const t = T[p.key]
    const pct = t.total ? (t.ok / t.total) * 100 : null
    if (pct !== null) { w += p.weight; s += p.weight * pct }
    return { key: p.key, label: p.label, hint: p.hint, weight: p.weight, ok: t.ok, total: t.total, pct: pct === null ? null : Math.round(pct) }
  })
  return { score: w ? Math.round(s / w) : null, parts }
}

async function fetchAll<T>(build: (a: number, b: number) => any, cap = 5000): Promise<T[]> {
  const out: T[] = []
  for (let a = 0; a < cap; a += 1000) {
    const { data, error } = await build(a, a + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function computeHealth(admin: any, cc: string, L: TaskLimits & { health_target?: number }, from: number, to: number, now = Date.now()) {
  const span = Math.max(H, to - from)
  const prevFrom = from - span
  const sinceIso = new Date(prevFrom).toISOString(), toIso = new Date(to).toISOString()
  const COLS = "id, status, received_at, outcome, reply_sent_type, replied_at, fields_confirmed_at"
  const loadReqs = (cols: string) => fetchAll<any>((a, b) => admin.from("freight_requests").select(cols).eq("client_code", cc).gte("received_at", sinceIso).lt("received_at", toIso).order("received_at", { ascending: true }).range(a, b))

  const [reqs, rfqs, cqs, quos, tasks] = await Promise.all([
    loadReqs(COLS).catch(() => loadReqs("*")),
    fetchAll<any>((a, b) => admin.from("carrier_quote_requests").select("freight_request_id, sent_at, freight_requests!inner(client_code)").eq("freight_requests.client_code", cc).gte("sent_at", sinceIso).range(a, b)).catch(() => [] as any[]),
    fetchAll<any>((a, b) => admin.from("carrier_quotes").select("freight_request_id, received_at, freight_requests!freight_request_id!inner(client_code)").eq("freight_requests.client_code", cc).gte("received_at", sinceIso).range(a, b)).catch(() => [] as any[]),
    fetchAll<any>((a, b) => admin.from("quotations").select("freight_request_id, status, sent_at, created_at").eq("client_code", cc).gte("created_at", sinceIso).range(a, b)).catch(() => [] as any[]),
    computeTasks(admin, cc, L, now).catch(() => [] as any[]),
  ])

  const rfqBy = new Map<string, number[]>(), cqBy = new Map<string, number[]>(), quoBy = new Map<string, any[]>()
  for (const x of rfqs) { const k = String(x.freight_request_id); (rfqBy.get(k) ?? rfqBy.set(k, []).get(k)!).push(ts(x.sent_at)) }
  for (const x of cqs) { const k = String(x.freight_request_id); (cqBy.get(k) ?? cqBy.set(k, []).get(k)!).push(ts(x.received_at)) }
  for (const x of quos) { const k = String(x.freight_request_id); (quoBy.get(k) ?? quoBy.set(k, []).get(k)!).push(x) }

  const cur = reqs.filter((r) => ts(r.received_at) >= from)
  const prev = reqs.filter((r) => ts(r.received_at) < from)
  const now_ = combine(scoreGroup(cur, rfqBy, cqBy, quoBy, L, now))
  const prevScore = combine(scoreGroup(prev, rfqBy, cqBy, quoBy, L, now)).score

  // trend: up to 8 equal slices of the period
  const N = 8, step = span / N
  const trend = Array.from({ length: N }, (_, i) => {
    const a = from + i * step, b = a + step
    const grp = cur.filter((r) => { const t = ts(r.received_at); return t >= a && t < b })
    return { from: Math.round(a), to: Math.round(b), count: grp.length, score: combine(scoreGroup(grp, rfqBy, cqBy, quoBy, L, now)).score }
  })

  const weakest = now_.parts.filter((p) => p.pct !== null && p.total >= 2).sort((a, b) => (a.pct! - b.pct!))[0] ?? null
  const open = tasks.filter((t: any) => !t.waiting)
  const overdue = open.filter((t: any) => t.dueAt < now)
  return {
    score: now_.score, prevScore, target: Math.round(Number(L.health_target) || 85),
    parts: now_.parts, trend, requests: cur.length,
    weakest: weakest ? { key: weakest.key, label: weakest.label, pct: weakest.pct } : null,
    rightNow: { open: open.length, overdue: overdue.length },
  }
}
