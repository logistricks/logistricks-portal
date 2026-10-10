/**
 * GET /api/dashboard?from=ISO&to=ISO&tz=minutesOffset
 * Live dashboard metrics for the session's client, for [from, to) and the
 * equally long period before it (for deltas). All numbers come from the db.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"

export const dynamic = "force-dynamic"

const HOUR = 3600_000
const DAY = 24 * HOUR

async function fetchAll<T>(build: (from: number, to: number) => any, max = 10000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

const num = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v))
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const top = (m: Map<string, number>, n = 6) =>
  Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, value]) => ({ label, value }))
const bump = (m: Map<string, number>, k: string | null | undefined, by = 1) => {
  const key = (k ?? "").trim()
  if (key) m.set(key, (m.get(key) ?? 0) + by)
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const now = Date.now()
  let to = Date.parse(sp.get("to") ?? "")
  let from = Date.parse(sp.get("from") ?? "")
  if (isNaN(to)) to = now + 1
  if (isNaN(from)) from = to - DAY
  if (from >= to) from = to - DAY
  from = Math.max(from, to - 366 * DAY)
  const tz = Number(sp.get("tz") ?? 0) || 0 // minutes, as Date.getTimezoneOffset() (UTC - local)
  const span = to - from
  const prevFrom = from - span
  const code = session.clientCode
  const admin = adminClient()

  try {
    // ── freight requests in current + previous period ───────────────
    const reqs = await fetchAll<any>((a, b) =>
      admin.from("freight_requests").select("*").eq("client_code", code)
        .gte("received_at", new Date(prevFrom).toISOString()).lt("received_at", new Date(to).toISOString())
        .order("received_at", { ascending: false }).range(a, b))
    const ts = (r: any) => Date.parse(r.received_at)
    const cur = reqs.filter((r) => ts(r) >= from)
    const prev = reqs.filter((r) => ts(r) < from)

    // snapshot (not period based)
    const { data: snap } = await admin.from("freight_requests").select("status").eq("client_code", code).limit(20000)
    const statusAll = new Map<string, number>()
    for (const r of snap ?? []) bump(statusAll, (r as any).status)
    const openStatuses = Array.from(statusAll.keys()).filter((s) => s !== "Closed" && s !== "Rejected")
    const active = openStatuses.reduce((s, k) => s + (statusAll.get(k) ?? 0), 0)

    // closed in period (closed_at if the column exists, else updated_at)
    const closedAt = (r: any) => Date.parse(r.closed_at ?? r.updated_at ?? r.received_at)
    const { data: closedRows } = await admin.from("freight_requests").select("*").eq("client_code", code).eq("status", "Closed")
      .gte("updated_at", new Date(prevFrom).toISOString()).limit(5000)
    const closedCur = (closedRows ?? []).filter((r: any) => closedAt(r) >= from && closedAt(r) < to)
    const closedPrev = (closedRows ?? []).filter((r: any) => closedAt(r) >= prevFrom && closedAt(r) < from)

    // ── quotations (outbound, with real money) ──────────────────────
    const quos = await fetchAll<any>((a, b) =>
      admin.from("quotations").select("id, freight_request_id, base_rate_usd, final_price_usd, status, sent_at, created_at").eq("client_code", code)
        .gte("created_at", new Date(prevFrom).toISOString()).lt("created_at", new Date(to).toISOString()).range(a, b)
    ).catch(() => [] as any[])
    const qTs = (q: any) => Date.parse(q.sent_at ?? q.created_at)
    const sentCur = quos.filter((q) => q.status === "sent" && qTs(q) >= from)
    const sentPrev = quos.filter((q) => q.status === "sent" && qTs(q) < from)
    const sumFinal = (xs: any[]) => xs.reduce((s, q) => s + (num(q.final_price_usd) ?? 0), 0)
    const sumMargin = (xs: any[]) =>
      xs.reduce((s, q) => s + (num(q.final_price_usd) != null && num(q.base_rate_usd) != null ? num(q.final_price_usd)! - num(q.base_rate_usd)! : 0), 0)

    // ── carrier quotes ──────────────────────────────────────────────
    const selQ = (extra: string) =>
      fetchAll<any>((a, b) =>
        admin.from("carrier_quotes")
          .select(`id, freight_request_id, carrier_id, rate_usd, received_at${extra}, freight_requests!freight_request_id!inner(client_code)`)
          .eq("freight_requests.client_code", code)
          .gte("received_at", new Date(prevFrom).toISOString()).lt("received_at", new Date(to).toISOString()).range(a, b))
    let cqs: any[] = []
    try { cqs = await selQ(", response_type") } catch { try { cqs = await selQ("") } catch { cqs = [] } }
    cqs = cqs.filter((q) => !q.response_type || ["quote", "update", "counter_offer", "counter"].includes(q.response_type))
    const cqCur = cqs.filter((q) => Date.parse(q.received_at) >= from)
    const cqPrev = cqs.filter((q) => Date.parse(q.received_at) < from)

    // RFQs sent
    const rfqs = await fetchAll<any>((a, b) =>
      admin.from("carrier_quote_requests").select("id, freight_request_id, carrier_id, status, sent_at, freight_requests!inner(client_code)")
        .eq("freight_requests.client_code", code)
        .gte("sent_at", new Date(prevFrom).toISOString()).lt("sent_at", new Date(to).toISOString()).range(a, b)
    ).catch(() => [] as any[])
    const rfqCur = rfqs.filter((x) => Date.parse(x.sent_at) >= from)
    const rfqPrev = rfqs.filter((x) => Date.parse(x.sent_at) < from)

    // carrier names
    const carrierIds = Array.from(new Set([...cqCur, ...rfqCur].map((q) => q.carrier_id).filter(Boolean)))
    const carrierName = new Map<string, string>()
    if (carrierIds.length) {
      const { data: cs } = await admin.from("carriers").select("id, carrier_name").in("id", carrierIds)
      for (const c of cs ?? []) carrierName.set(String((c as any).id), (c as any).carrier_name)
    }

    // auto replies sent
    const { count: autoReplies } = await admin.from("auto_reply_logs").select("id", { count: "exact", head: true })
      .eq("client_code", code).gte("created_at", new Date(from).toISOString()).lt("created_at", new Date(to).toISOString())
    const { count: autoRepliesPrev } = await admin.from("auto_reply_logs").select("id", { count: "exact", head: true })
      .eq("client_code", code).gte("created_at", new Date(prevFrom).toISOString()).lt("created_at", new Date(from).toISOString())

    // ── response time: request received → first quotation created ──
    const firstQuoteAt = (list: any[]) => {
      const m = new Map<string, number>()
      for (const q of list) {
        const t = Date.parse(q.created_at)
        const cur0 = m.get(q.freight_request_id)
        if (cur0 === undefined || t < cur0) m.set(q.freight_request_id, t)
      }
      return m
    }
    const hoursToQuote = (rs: any[], qs: any[]) => {
      const fq = firstQuoteAt(qs)
      const xs: number[] = []
      for (const r of rs) { const t = fq.get(r.id); if (t && t >= ts(r)) xs.push((t - ts(r)) / HOUR) }
      return median(xs)
    }

    // ── time series ─────────────────────────────────────────────────
    const local = (t: number) => t - tz * 60_000
    const unit: "hour" | "day" | "week" | "month" = span <= 36 * HOUR ? "hour" : span <= 63 * DAY ? "day" : span <= 190 * DAY ? "week" : "month"
    const floorLocal = (t: number) => {
      const d = new Date(local(t))
      if (unit === "hour") d.setUTCMinutes(0, 0, 0)
      else if (unit === "day") d.setUTCHours(0, 0, 0, 0)
      else if (unit === "week") { d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) }
      else { d.setUTCHours(0, 0, 0, 0); d.setUTCDate(1) }
      return d.getTime()
    }
    const nextLocal = (t: number) => {
      const d = new Date(t)
      if (unit === "hour") d.setUTCHours(d.getUTCHours() + 1)
      else if (unit === "day") d.setUTCDate(d.getUTCDate() + 1)
      else if (unit === "week") d.setUTCDate(d.getUTCDate() + 7)
      else d.setUTCMonth(d.getUTCMonth() + 1)
      return d.getTime()
    }
    const label = (t: number) => {
      const d = new Date(t)
      if (unit === "hour") return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
      if (unit === "month") return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    }
    const buckets: { t: number; label: string; requests: number; quotes: number; quotations: number; closed: number; value: number; margin: number }[] = []
    for (let t = floorLocal(from); t < local(to) && buckets.length < 400; t = nextLocal(t))
      buckets.push({ t, label: label(t), requests: 0, quotes: 0, quotations: 0, closed: 0, value: 0, margin: 0 })
    const at = (abs: number) => {
      const l = floorLocal(abs)
      return buckets.find((b) => b.t === l)
    }
    for (const r of cur) { const b = at(ts(r)); if (b) b.requests++ }
    for (const q of cqCur) { const b = at(Date.parse(q.received_at)); if (b) b.quotes++ }
    for (const q of sentCur) {
      const b = at(qTs(q))
      if (b) {
        b.quotations++
        b.value += num(q.final_price_usd) ?? 0
        if (num(q.base_rate_usd) != null && num(q.final_price_usd) != null) b.margin += num(q.final_price_usd)! - num(q.base_rate_usd)!
      }
    }
    for (const r of closedCur) { const b = at(closedAt(r)); if (b) b.closed++ }

    // ── breakdowns (current period) ─────────────────────────────────
    const status = new Map<string, number>(); const source = new Map<string, number>()
    const lanes = new Map<string, number>(); const senders = new Map<string, number>()
    const cargo = new Map<string, number>(); const incoterms = new Map<string, number>()
    const mode = { Sea: 0, Air: 0, Land: 0 }
    const intake = { automatic: 0, manual: 0 }
    const urgency = new Map<string, number>()
    let aog = 0, dgr = 0, exw = 0, incomplete = 0
    for (const r of cur) {
      bump(status, r.status); bump(source, r.source || "Email")
      if (r.is_sea) mode.Sea++; if (r.is_air) mode.Air++; if (r.is_land) mode.Land++
      if (r.intake_source === "manual") intake.manual++; else intake.automatic++
      const o = r.origin_country || r.origin_city, d = r.destination_country || r.destination_city
      if (o && d) bump(lanes, `${o} → ${d}`)
      bump(senders, r.sender_name || r.sender_email)
      bump(cargo, r.cargo_type); bump(incoterms, (r.incoterm || "").toUpperCase())
      bump(urgency, r.urgency)
      if (r.aog) aog++; if (r.dgr) dgr++
      if (/^\s*(exw|ex[\s-]?works?)\b/i.test(r.incoterm || "")) exw++
      if (Array.isArray(r.missing_fields) && r.missing_fields.length) incomplete++
    }
    const carrierQuotes = new Map<string, number>(); const carrierRates = new Map<string, number[]>()
    for (const q of cqCur) {
      const n = carrierName.get(String(q.carrier_id)) ?? `Carrier ${q.carrier_id}`
      bump(carrierQuotes, n)
      const v = num(q.rate_usd); if (v != null) carrierRates.set(n, [...(carrierRates.get(n) ?? []), v])
    }
    const carrierRfq = new Map<string, number>()
    for (const x of rfqCur) bump(carrierRfq, carrierName.get(String(x.carrier_id)) ?? `Carrier ${x.carrier_id}`)
    const carriers = Array.from(new Set([...carrierRfq.keys(), ...carrierQuotes.keys()])).map((name) => {
      const rates = carrierRates.get(name) ?? []
      const rfq = carrierRfq.get(name) ?? 0, qn = carrierQuotes.get(name) ?? 0
      return { name, rfqs: rfq, quotes: qn, responseRate: rfq ? Math.min(100, (qn / rfq) * 100) : null, avgRate: rates.length ? rates.reduce((s, v) => s + v, 0) / rates.length : null }
    }).sort((a, b) => b.quotes - a.quotes || b.rfqs - a.rfqs).slice(0, 8)

    // funnel (requests received in period)
    const ids = new Set(cur.map((r) => r.id))
    const withRfq = new Set(rfqs.filter((x) => ids.has(x.freight_request_id)).map((x) => x.freight_request_id))
    const withQuote = new Set(cqs.filter((x) => ids.has(x.freight_request_id)).map((x) => x.freight_request_id))
    const withQuotation = new Set(quos.filter((x) => x.status === "sent" && ids.has(x.freight_request_id)).map((x) => x.freight_request_id))
    const funnel = [
      { label: "Received", value: cur.length },
      { label: "RFQ sent", value: withRfq.size },
      { label: "Carrier quote", value: withQuote.size },
      { label: "Quotation sent", value: withQuotation.size },
      { label: "Closed", value: cur.filter((r) => r.status === "Closed").length },
    ]

    const kpi = (c: number | null, p: number | null) => ({ value: c, prev: p })
    return NextResponse.json({
      range: { from, to, prevFrom, unit },
      generatedAt: now,
      kpis: {
        requests: kpi(cur.length, prev.length),
        active: kpi(active, null),
        needsAttention: kpi(cur.filter((r) => r.status === "Pending" || r.status === "Waiting for Approval").length + 0, null),
        carrierQuotes: kpi(cqCur.length, cqPrev.length),
        rfqs: kpi(rfqCur.length, rfqPrev.length),
        quotationsSent: kpi(sentCur.length, sentPrev.length),
        quotedValue: kpi(sumFinal(sentCur), sumFinal(sentPrev)),
        margin: kpi(sumMargin(sentCur), sumMargin(sentPrev)),
        closed: kpi(closedCur.length, closedPrev.length),
        hoursToQuote: kpi(hoursToQuote(cur, quos), hoursToQuote(prev, quos)),
        winRate: kpi(pct(closedCur.length, Math.max(sentCur.length, 0)), pct(closedPrev.length, sentPrev.length)),
        autoReplies: kpi(autoReplies ?? 0, autoRepliesPrev ?? 0),
        avgQuotation: kpi(sentCur.length ? sumFinal(sentCur) / sentCur.length : null, sentPrev.length ? sumFinal(sentPrev) / sentPrev.length : null),
      },
      series: buckets,
      statusPeriod: top(status, 12),
      statusSnapshot: top(statusAll, 12),
      source: top(source), lanes: top(lanes), senders: top(senders), cargo: top(cargo), incoterms: top(incoterms),
      urgency: top(urgency),
      mode, intake, flags: { aog, dgr, exw, incomplete },
      carriers, funnel,
    })
  } catch (e: any) {
    console.error("[api/dashboard]", e?.message ?? e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}
