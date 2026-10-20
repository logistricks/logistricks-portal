/** Server-only report queries. Everything is scoped to the session's client_code. */
import type { ColumnDef, ReportResult } from "./catalog"
import { reportById } from "./catalog"
import { wonStage, WON_STAGE_LABEL, LOST_REASON_LABEL, summarizeOutcomes } from "@/lib/win-loss"

const HOUR = 3600_000, DAY = 24 * HOUR
const CAP = 5000

async function all<T = any>(build: (a: number, b: number) => any): Promise<T[]> {
  const out: T[] = []
  for (let a = 0; a < 20000; a += 1000) {
    const { data, error } = await build(a, a + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}
const iso = (t: number) => new Date(t).toISOString()
const n = (v: any) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v))
const sum = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0)
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }
const median = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2 }
const has = (hay: any[], q: string) => { const s = q.toLowerCase(); return hay.some((h) => String(h ?? "").toLowerCase().includes(s)) }
const modeOf = (r: any) => (r.is_sea ? "Sea" : r.is_air ? "Air" : r.is_land ? "Land" : "")
const lane = (r: any) => {
  const o = r.origin_country || r.origin_city, d = r.destination_country || r.destination_city
  return o && d ? `${o} → ${d}` : ""
}
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null)

export interface Params { from: number; to: number; tz: number; f: Record<string, string> }

export async function runReport(admin: any, code: string, id: string, p: Params): Promise<ReportResult> {
  const def = reportById(id)
  if (!def) throw new Error("Unknown report")
  const { f } = p
  const fromIso = iso(p.from), toIso = iso(p.to)

  const requests = (extraFilter?: (q: any) => any) => all<any>((a, b) => {
    let q = admin.from("freight_requests").select("*").eq("client_code", code).order("received_at", { ascending: false })
    if (!def.snapshot) q = q.gte("received_at", fromIso).lt("received_at", toIso)
    return (extraFilter ? extraFilter(q) : q).range(a, b)
  })
  const reqFilter = (rows: any[]) => rows.filter((r) =>
    (!f.status || r.status === f.status) &&
    (!f.mode || modeOf(r).toLowerCase() === f.mode) &&
    (!f.source || (r.source || "Email") === f.source) &&
    (!f.intake || (r.intake_source === "manual" ? "manual" : "automatic") === f.intake) &&
    (!f.q || has([r.sender_name, r.sender_email, r.request_ref, r.origin_city, r.destination_city, r.origin_country, r.destination_country, r.cargo_type], f.q)))

  const quotationsInRange = () => all<any>((a, b) =>
    admin.from("quotations").select("*").eq("client_code", code).gte("created_at", fromIso).lt("created_at", toIso).order("created_at", { ascending: false }).range(a, b))
    .catch(() => [])

  const carrierNames = async (ids: any[]) => {
    const m = new Map<string, string>()
    const u = Array.from(new Set(ids.filter(Boolean)))
    if (u.length) { const { data } = await admin.from("carriers").select("id, carrier_name").in("id", u); for (const c of data ?? []) m.set(String(c.id), c.carrier_name) }
    return m
  }
  const refMap = async (ids: string[]) => {
    const m = new Map<string, any>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await admin.from("freight_requests").select("id, request_ref, sender_name, sender_email, origin_city, origin_country, destination_city, destination_country, status, received_at, is_sea, is_air, is_land").in("id", ids.slice(i, i + 200))
      for (const r of data ?? []) m.set(r.id, r)
    }
    return m
  }
  const cap = <T,>(rows: T[]) => ({ rows: rows.slice(0, CAP), truncated: rows.length > CAP })

  let columns: ColumnDef[] = [], rows: Record<string, any>[] = [], summary: ReportResult["summary"] = [], note: string | undefined

  switch (id) {
    case "requests": {
      const rs = reqFilter(await requests())
      columns = [
        { key: "ref", label: "Ref" }, { key: "received", label: "Received", type: "datetime" }, { key: "sender", label: "Sender" }, { key: "email", label: "Email" },
        { key: "origin", label: "Origin" }, { key: "destination", label: "Destination" }, { key: "mode", label: "Mode" }, { key: "cargo", label: "Cargo" },
        { key: "incoterm", label: "Incoterm" }, { key: "urgency", label: "Urgency" }, { key: "status", label: "Status" }, { key: "intake", label: "Intake" }]
      rows = rs.map((r) => ({
        ref: r.request_ref ?? "", received: r.received_at, sender: r.sender_name ?? "", email: r.sender_email ?? "",
        origin: [r.origin_city, r.origin_country].filter(Boolean).join(", "), destination: [r.destination_city, r.destination_country].filter(Boolean).join(", "),
        mode: modeOf(r), cargo: r.cargo_type ?? "", incoterm: r.incoterm ?? "", urgency: r.urgency ?? "", status: r.status ?? "",
        intake: r.intake_source === "manual" ? "Manual" : "Automatic" }))
      summary = [{ label: "Requests", value: rs.length, type: "num" }, { label: "Closed (dismissed)", value: rs.filter((r) => r.status === "Closed").length, type: "num" },
        { label: "Incomplete", value: rs.filter((r) => Array.isArray(r.missing_fields) && r.missing_fields.length).length, type: "num" },
        { label: "Manual intake", value: rs.filter((r) => r.intake_source === "manual").length, type: "num" }]
      break
    }
    case "pipeline": {
      const rs = reqFilter(await requests())
      const ids = new Set(rs.map((r) => r.id))
      const rfq = await all<any>((a, b) => admin.from("carrier_quote_requests").select("freight_request_id, freight_requests!inner(client_code)").eq("freight_requests.client_code", code).range(a, b)).catch(() => [])
      const cq = await all<any>((a, b) => admin.from("carrier_quotes").select("freight_request_id, freight_requests!freight_request_id!inner(client_code)").eq("freight_requests.client_code", code).range(a, b)).catch(() => [])
      const qu = await all<any>((a, b) => admin.from("quotations").select("freight_request_id, status").eq("client_code", code).eq("status", "sent").range(a, b)).catch(() => [])
      const st = (xs: any[]) => new Set(xs.filter((x) => ids.has(x.freight_request_id)).map((x) => x.freight_request_id)).size
      const stages = [["Received", rs.length], ["RFQ sent to carriers", st(rfq)], ["Carrier quote received", st(cq)], ["Quotation sent", st(qu)], ["Won", rs.filter((r) => r.outcome === "won").length]] as const
      columns = [{ key: "stage", label: "Stage" }, { key: "count", label: "Requests", type: "num" }, { key: "share", label: "% of received", type: "pct" }, { key: "step", label: "Conversion from previous stage", type: "pct" }, { key: "drop", label: "Dropped before this stage", type: "num" }]
      rows = stages.map(([stage, count], i) => ({ stage, count, share: pct(count, stages[0][1]), step: i ? pct(count, stages[i - 1][1]) : null, drop: i ? Math.max(0, stages[i - 1][1] - count) : null }))
      const byStatus = new Map<string, number>(); for (const r of rs) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1)
      summary = [{ label: "Requests", value: rs.length, type: "num" }, ...Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ label: k, value: v, type: "num" as const }))]
      break
    }
    case "activity": {
      const unit = f.group === "month" ? "month" : f.group === "week" ? "week" : "day"
      const rs = reqFilter(await requests())
      const ids = new Set(rs.map((r) => r.id))
      const key = (t: number) => {
        const d = new Date(t - p.tz * 60_000)
        d.setUTCHours(0, 0, 0, 0)
        if (unit === "week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
        if (unit === "month") d.setUTCDate(1)
        return d.toISOString().slice(0, 10)
      }
      const b = new Map<string, any>()
      const get = (k: string) => { if (!b.has(k)) b.set(k, { period: k, requests: 0, quotes: 0, quotations: 0, closed: 0, value: 0 }); return b.get(k) }
      for (const r of rs) { get(key(Date.parse(r.received_at))).requests++; if (r.status === "Closed") get(key(Date.parse(r.closed_at ?? r.updated_at ?? r.received_at))).closed++ }
      const cq = await all<any>((a, bb) => admin.from("carrier_quotes").select("freight_request_id, received_at, freight_requests!freight_request_id!inner(client_code)").eq("freight_requests.client_code", code).gte("received_at", fromIso).lt("received_at", toIso).range(a, bb)).catch(() => [])
      for (const q of cq) if (!f.mode || ids.has(q.freight_request_id)) get(key(Date.parse(q.received_at))).quotes++
      const qu = (await quotationsInRange()).filter((q) => q.status === "sent" && (!f.mode || ids.has(q.freight_request_id)))
      for (const q of qu) { const g = get(key(Date.parse(q.sent_at ?? q.created_at))); g.quotations++; g.value += n(q.final_price_usd) ?? 0 }
      columns = [{ key: "period", label: unit === "month" ? "Month starting" : unit === "week" ? "Week starting" : "Day", type: "date" }, { key: "requests", label: "Requests", type: "num" }, { key: "quotes", label: "Carrier quotes", type: "num" },
        { key: "quotations", label: "Quotations sent", type: "num" }, { key: "won", label: "Won", type: "num" }, { key: "value", label: "Quoted value (USD)", type: "money" }]
      rows = Array.from(b.values()).sort((a, c) => a.period.localeCompare(c.period))
      summary = [{ label: "Requests", value: sum(rows.map((r) => r.requests)), type: "num" }, { label: "Carrier quotes", value: sum(rows.map((r) => r.quotes)), type: "num" },
        { label: "Quotations sent", value: sum(rows.map((r) => r.quotations)), type: "num" }, { label: "Quoted value", value: sum(rows.map((r) => r.value)), type: "money" }]
      break
    }
    case "attention": {
      const rs = (await requests()).filter((r) => r.status !== "Closed" && r.status !== "Rejected")
      const now = Date.now(), minAge = n(f.minAge) ?? 0
      const out: any[] = []
      for (const r of rs) {
        const age = (now - Date.parse(r.received_at)) / DAY
        const issues: string[] = []
        if ((r.status === "Pending" || r.status === "Waiting for Approval" || r.status === "Sent to Carrier") && age >= 2) issues.push("stale")
        if (Array.isArray(r.missing_fields) && r.missing_fields.length) issues.push("missing")
        if (/^\s*(exw|ex[\s-]?works?)\b/i.test(r.incoterm || "") && !String(r.pickup_address || "").trim()) issues.push("exw")
        if (!issues.length || age < minAge || (f.issue && !issues.includes(f.issue))) continue
        out.push({ ref: r.request_ref ?? "", received: r.received_at, age: Math.round(age * 10) / 10, sender: r.sender_name ?? "", route: lane(r), status: r.status,
          issue: issues.map((i) => ({ stale: "Stale", missing: `Missing: ${(Array.isArray(r.missing_fields) ? r.missing_fields : []).join(", ")}`, exw: "EXW – no pickup address" }[i])).join(" · ") })
      }
      columns = [{ key: "ref", label: "Ref" }, { key: "received", label: "Received", type: "datetime" }, { key: "age", label: "Age (days)", type: "num" }, { key: "sender", label: "Sender" }, { key: "route", label: "Lane" }, { key: "status", label: "Status" }, { key: "issue", label: "Issue" }]
      rows = out.sort((a, b) => b.age - a.age)
      summary = [{ label: "Items", value: rows.length, type: "num" }, { label: "Oldest (days)", value: rows[0]?.age ?? null, type: "num" }]
      break
    }
    case "carrier_quotes": {
      const sel = (x: string) => all<any>((a, b) => admin.from("carrier_quotes")
        .select(`id, freight_request_id, carrier_id, rate_usd, transit_days, free_days, validity_date, received_at${x}, freight_requests!freight_request_id!inner(client_code, request_ref, origin_city, origin_country, destination_city, destination_country)`)
        .eq("freight_requests.client_code", code).gte("received_at", fromIso).lt("received_at", toIso).order("received_at", { ascending: false }).range(a, b))
      let qs: any[]; try { qs = await sel(", response_type") } catch { qs = await sel("") }
      qs = qs.filter((q) => !q.response_type || ["quote", "update", "counter_offer", "counter"].includes(q.response_type))
      const names = await carrierNames(qs.map((q) => q.carrier_id))
      const best = new Map<string, number>()
      for (const q of qs) { const v = n(q.rate_usd); if (v != null) best.set(q.freight_request_id, Math.min(best.get(q.freight_request_id) ?? Infinity, v)) }
      let list = qs.map((q) => ({ ...q, carrierName: names.get(String(q.carrier_id)) ?? `Carrier ${q.carrier_id}` }))
      if (f.carrier) list = list.filter((q) => String(q.carrier_id) === f.carrier)
      if (f.q) list = list.filter((q) => has([q.freight_requests?.request_ref], f.q))
      columns = [{ key: "ref", label: "Request" }, { key: "lane", label: "Lane" }, { key: "carrier", label: "Carrier" }, { key: "rate", label: "Rate (USD)", type: "money" }, { key: "transit", label: "Transit (days)", type: "num" },
        { key: "free", label: "Free days", type: "num" }, { key: "valid", label: "Valid until", type: "date" }, { key: "received", label: "Received", type: "datetime" }, { key: "best", label: "Lowest for request" }]
      rows = list.map((q) => ({ ref: q.freight_requests?.request_ref ?? "", lane: lane(q.freight_requests ?? {}), carrier: q.carrierName, rate: n(q.rate_usd), transit: n(q.transit_days), free: n(q.free_days),
        valid: q.validity_date, received: q.received_at, best: n(q.rate_usd) != null && n(q.rate_usd) === best.get(q.freight_request_id) ? "Yes" : "" }))
      const rates = rows.map((r) => r.rate)
      summary = [{ label: "Quotes", value: rows.length, type: "num" }, { label: "Requests quoted", value: new Set(list.map((q) => q.freight_request_id)).size, type: "num" },
        { label: "Average rate", value: avg(rates), type: "money" }, { label: "Lowest rate", value: rates.filter((x) => x != null).length ? Math.min(...(rates.filter((x) => x != null) as number[])) : null, type: "money" }]
      break
    }
    case "carrier_perf": {
      const rf = await all<any>((a, b) => admin.from("carrier_quote_requests").select("id, carrier_id, status, sent_at, responded_at, freight_requests!inner(client_code)").eq("freight_requests.client_code", code).gte("sent_at", fromIso).lt("sent_at", toIso).range(a, b)).catch(() => [])
      const cq = await all<any>((a, b) => admin.from("carrier_quotes").select("carrier_id, carrier_quote_request_id, rate_usd, received_at, freight_requests!freight_request_id!inner(client_code)").eq("freight_requests.client_code", code).gte("received_at", fromIso).lt("received_at", toIso).range(a, b)).catch(() => [])
      const names = await carrierNames([...rf, ...cq].map((x) => x.carrier_id))
      const ids = Array.from(new Set([...rf, ...cq].map((x) => String(x.carrier_id)))).filter((c) => !f.carrier || c === f.carrier)
      rows = ids.map((cid) => {
        const r = rf.filter((x) => String(x.carrier_id) === cid), q = cq.filter((x) => String(x.carrier_id) === cid)
        const resp = r.filter((x) => x.responded_at).map((x) => (Date.parse(x.responded_at) - Date.parse(x.sent_at)) / HOUR).filter((h) => h >= 0)
        return { carrier: names.get(cid) ?? `Carrier ${cid}`, rfqs: r.length, quotes: q.length, declined: r.filter((x) => x.status === "declined").length, expired: r.filter((x) => x.status === "expired").length,
          rate: pct(r.filter((x) => x.responded_at || x.status === "responded").length, r.length), avgRate: avg(q.map((x) => n(x.rate_usd))), avgHours: avg(resp) }
      }).sort((a, b) => b.quotes - a.quotes)
      columns = [{ key: "carrier", label: "Carrier" }, { key: "rfqs", label: "RFQs sent", type: "num" }, { key: "quotes", label: "Quotes received", type: "num" }, { key: "rate", label: "Response rate", type: "pct" },
        { key: "declined", label: "Declined", type: "num" }, { key: "expired", label: "Expired", type: "num" }, { key: "avgRate", label: "Average rate (USD)", type: "money" }, { key: "avgHours", label: "Avg time to respond", type: "hours" }]
      summary = [{ label: "Carriers", value: rows.length, type: "num" }, { label: "RFQs sent", value: sum(rows.map((r) => r.rfqs)), type: "num" }, { label: "Quotes received", value: sum(rows.map((r) => r.quotes)), type: "num" }, { label: "Avg time to respond", value: avg(rows.map((r) => r.avgHours)), type: "hours" }]
      break
    }
    case "quotations": {
      let qs = await quotationsInRange()
      if (f.qstatus) qs = qs.filter((q) => q.status === f.qstatus)
      const rm = await refMap(Array.from(new Set(qs.map((q) => q.freight_request_id))))
      if (f.q) qs = qs.filter((q) => has([rm.get(q.freight_request_id)?.sender_name, rm.get(q.freight_request_id)?.sender_email], f.q))
      columns = [{ key: "ref", label: "Request" }, { key: "sender", label: "Requester" }, { key: "lane", label: "Lane" }, { key: "base", label: "Carrier rate (USD)", type: "money" }, { key: "markup", label: "Markup (USD)", type: "money" },
        { key: "final", label: "Final price (USD)", type: "money" }, { key: "marginPct", label: "Margin %", type: "pct" }, { key: "status", label: "Status" }, { key: "created", label: "Created", type: "datetime" }, { key: "sent", label: "Sent", type: "datetime" }]
      rows = qs.map((q) => {
        const r = rm.get(q.freight_request_id) ?? {}, base = n(q.base_rate_usd), fin = n(q.final_price_usd)
        return { ref: r.request_ref ?? "", sender: r.sender_name ?? "", lane: lane(r), base, markup: base != null && fin != null ? fin - base : null, final: fin,
          marginPct: base != null && fin ? ((fin - base) / fin) * 100 : null, status: q.status === "sent" ? "Sent" : "Draft", created: q.created_at, sent: q.sent_at }
      })
      const sent = rows.filter((r) => r.status === "Sent")
      summary = [{ label: "Quotations", value: rows.length, type: "num" }, { label: "Sent", value: sent.length, type: "num" }, { label: "Quoted value (sent)", value: sum(sent.map((r) => r.final)), type: "money" },
        { label: "Margin (sent)", value: sum(sent.map((r) => r.markup)), type: "money" }, { label: "Avg margin %", value: avg(sent.map((r) => r.marginPct)), type: "pct" }]
      break
    }
    case "won_deals": {
      let rs = await all<any>((a, b) => admin.from("freight_requests").select("*").eq("client_code", code).eq("outcome", "won").gte("outcome_at", fromIso).lt("outcome_at", toIso).order("outcome_at", { ascending: false }).range(a, b))
      rs = rs.filter((r) => (!f.stage || wonStage(r) === f.stage) && (!f.mode || modeOf(r).toLowerCase() === f.mode) &&
        (!f.q || has([r.request_ref, r.sender_name, r.sender_email, r.won_carrier_name, r.booking_reference], f.q)))
      columns = [
        { key: "ref", label: "Ref" }, { key: "won", label: "Won on", type: "datetime" }, { key: "sender", label: "Requester" }, { key: "lane", label: "Lane" }, { key: "mode", label: "Mode" },
        { key: "carrier", label: "Carrier" }, { key: "stage", label: "Stage" }, { key: "booking", label: "Booking ref" }, { key: "booked", label: "Booked", type: "date" },
        { key: "invoiced", label: "Invoiced", type: "date" }, { key: "paid", label: "Paid", type: "date" },
        { key: "cost", label: "Carrier price (USD)", type: "money" }, { key: "sold", label: "Sold (USD)", type: "money" }, { key: "profit", label: "Profit (USD)", type: "money" }, { key: "margin", label: "Margin on cost", type: "pct" }]
      rows = rs.map((r) => {
        const cost = n(r.won_cost_usd), sold = n(r.won_sell_usd), profit = n(r.won_margin_usd)
        return { ref: r.request_ref ?? "", won: r.outcome_at, sender: r.sender_name || r.sender_email || "", lane: lane(r), mode: modeOf(r), carrier: r.won_carrier_name ?? "",
          stage: WON_STAGE_LABEL[wonStage(r)], booking: r.booking_reference ?? "", booked: r.booked_at, invoiced: r.invoiced_at, paid: r.paid_at,
          cost, sold, profit, margin: cost ? ((profit ?? 0) / cost) * 100 : null }
      })
      const sm = summarizeOutcomes(rs)
      summary = [{ label: "Won deals", value: sm.won, type: "num" }, { label: "Sold", value: sm.revenue, type: "money" }, { label: "Carrier cost", value: sm.cost, type: "money" },
        { label: "Profit (markup)", value: sm.profit, type: "money" }, { label: "Avg margin on cost", value: sm.cost ? (sm.profit / sm.cost) * 100 : null, type: "pct" },
        ...sm.stages.map((x) => ({ label: `${x.label} · profit`, value: x.profit, type: "money" as const })),
        { label: "Profit collected", value: sm.profitPaid, type: "money" }]
      if (sm.profitMissing) note = `${sm.profitMissing} won deal${sm.profitMissing > 1 ? "s have" : " has"} no carrier price, so no profit is counted for ${sm.profitMissing > 1 ? "them" : "it"}.`
      break
    }
    case "lost_deals": {
      let rs = await all<any>((a, b) => admin.from("freight_requests").select("*").eq("client_code", code).eq("outcome", "lost").gte("outcome_at", fromIso).lt("outcome_at", toIso).order("outcome_at", { ascending: false }).range(a, b))
      rs = rs.filter((r) => (!f.reason || r.outcome_reason === f.reason) && (!f.mode || modeOf(r).toLowerCase() === f.mode) && (!f.q || has([r.request_ref, r.sender_name, r.sender_email], f.q)))
      const ids = rs.map((r) => r.id)
      const best = new Map<string, number>()
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await admin.from("quotations").select("freight_request_id, final_price_usd, status").eq("client_code", code).in("freight_request_id", ids.slice(i, i + 200))
        for (const q of data ?? []) { const v = n(q.final_price_usd); if (v != null && q.status === "sent") best.set(q.freight_request_id, Math.max(best.get(q.freight_request_id) ?? 0, v)) }
      }
      columns = [{ key: "ref", label: "Ref" }, { key: "lost", label: "Lost on", type: "datetime" }, { key: "sender", label: "Requester" }, { key: "lane", label: "Lane" }, { key: "mode", label: "Mode" },
        { key: "reason", label: "Reason" }, { key: "quoted", label: "Quoted (USD)", type: "money" }, { key: "note", label: "Note" }, { key: "by", label: "Marked by" }]
      rows = rs.map((r) => ({ ref: r.request_ref ?? "", lost: r.outcome_at, sender: r.sender_name || r.sender_email || "", lane: lane(r), mode: modeOf(r),
        reason: LOST_REASON_LABEL[String(r.outcome_reason)] ?? "Not stated", quoted: best.get(r.id) ?? null, note: r.outcome_note ?? "", by: r.outcome_by ?? "" }))
      const sm = summarizeOutcomes(rs)
      summary = [{ label: "Lost deals", value: rows.length, type: "num" }, { label: "Quoted value lost", value: sum(rows.map((r) => r.quoted)), type: "money" },
        ...sm.lostReasons.slice(0, 5).map((x) => ({ label: x.label, value: x.value, type: "num" as const }))]
      break
    }
    case "lanes": {
      const rs = reqFilter(await requests())
      const ids = new Set(rs.map((r) => r.id))
      const qu = (await all<any>((a, b) => admin.from("quotations").select("freight_request_id, final_price_usd, status").eq("client_code", code).range(a, b)).catch(() => [])).filter((q) => ids.has(q.freight_request_id))
      const cq = (await all<any>((a, b) => admin.from("carrier_quotes").select("freight_request_id, rate_usd, freight_requests!freight_request_id!inner(client_code)").eq("freight_requests.client_code", code).range(a, b)).catch(() => [])).filter((q) => ids.has(q.freight_request_id))
      const g = new Map<string, any[]>(); for (const r of rs) { const l = lane(r) || "(unspecified)"; g.set(l, [...(g.get(l) ?? []), r]) }
      const minReq = n(f.minReq) ?? 1
      rows = Array.from(g.entries()).filter(([, v]) => v.length >= minReq).map(([l, v]) => {
        const s = new Set(v.map((r) => r.id))
        return { lane: l, requests: v.length, won: v.filter((r) => r.outcome === "won").length,
          avgCarrier: avg(cq.filter((q) => s.has(q.freight_request_id)).map((q) => n(q.rate_usd))), avgFinal: avg(qu.filter((q) => s.has(q.freight_request_id) && q.status === "sent").map((q) => n(q.final_price_usd))) }
      }).sort((a, b) => b.requests - a.requests)
      columns = [{ key: "lane", label: "Lane" }, { key: "requests", label: "Requests", type: "num" }, { key: "won", label: "Won", type: "num" }, { key: "avgCarrier", label: "Avg carrier rate (USD)", type: "money" }, { key: "avgFinal", label: "Avg quoted price (USD)", type: "money" }]
      summary = [{ label: "Lanes", value: rows.length, type: "num" }, { label: "Requests", value: sum(rows.map((r) => r.requests)), type: "num" }]
      break
    }
    case "customers": {
      const rs = reqFilter(await requests())
      const ids = new Set(rs.map((r) => r.id))
      const qu = (await all<any>((a, b) => admin.from("quotations").select("freight_request_id, final_price_usd, status").eq("client_code", code).range(a, b)).catch(() => [])).filter((q) => q.status === "sent" && ids.has(q.freight_request_id))
      const owner = new Map(rs.map((r) => [r.id, (r.sender_email || r.sender_name || "").toLowerCase()]))
      const g = new Map<string, any[]>(); for (const r of rs) { const k = (r.sender_email || r.sender_name || "").toLowerCase(); if (k) g.set(k, [...(g.get(k) ?? []), r]) }
      rows = Array.from(g.entries()).map(([k, v]) => {
        const mine = qu.filter((q) => owner.get(q.freight_request_id) === k)
        return { sender: v[0].sender_name || k, email: v[0].sender_email ?? "", requests: v.length, won: v.filter((r) => r.outcome === "won").length, quotations: mine.length, value: sum(mine.map((q) => n(q.final_price_usd))), last: v.map((r) => r.received_at).sort().pop() }
      }).sort((a, b) => b.requests - a.requests)
      columns = [{ key: "sender", label: "Requester" }, { key: "email", label: "Email" }, { key: "requests", label: "Requests", type: "num" }, { key: "quotations", label: "Quotations sent", type: "num" }, { key: "won", label: "Won", type: "num" }, { key: "value", label: "Quoted value (USD)", type: "money" }, { key: "last", label: "Last request", type: "datetime" }]
      summary = [{ label: "Requesters", value: rows.length, type: "num" }, { label: "Requests", value: sum(rows.map((r) => r.requests)), type: "num" }, { label: "Quoted value", value: sum(rows.map((r) => r.value)), type: "money" }]
      break
    }
    case "response_time": {
      const rs = reqFilter(await requests())
      const ids = new Set(rs.map((r) => r.id))
      const first = (xs: any[], tf: (x: any) => string) => { const m = new Map<string, number>(); for (const x of xs) { if (!ids.has(x.freight_request_id)) continue; const t = Date.parse(tf(x)); if (!m.has(x.freight_request_id) || t < m.get(x.freight_request_id)!) m.set(x.freight_request_id, t) } return m }
      const rf = first(await all<any>((a, b) => admin.from("carrier_quote_requests").select("freight_request_id, sent_at, freight_requests!inner(client_code)").eq("freight_requests.client_code", code).range(a, b)).catch(() => []), (x) => x.sent_at)
      const cq = first(await all<any>((a, b) => admin.from("carrier_quotes").select("freight_request_id, received_at, freight_requests!freight_request_id!inner(client_code)").eq("freight_requests.client_code", code).range(a, b)).catch(() => []), (x) => x.received_at)
      const qu = first(await all<any>((a, b) => admin.from("quotations").select("freight_request_id, created_at").eq("client_code", code).range(a, b)).catch(() => []), (x) => x.created_at)
      const h = (m: Map<string, number>, r: any) => { const t = m.get(r.id); const d = t != null ? (t - Date.parse(r.received_at)) / HOUR : null; return d != null && d >= 0 ? d : null }
      rows = rs.map((r) => ({ ref: r.request_ref ?? "", received: r.received_at, sender: r.sender_name ?? "", status: r.status, rfq: h(rf, r), quote: h(cq, r), quotation: h(qu, r) }))
      columns = [{ key: "ref", label: "Ref" }, { key: "received", label: "Received", type: "datetime" }, { key: "sender", label: "Sender" }, { key: "status", label: "Status" }, { key: "rfq", label: "To first RFQ", type: "hours" }, { key: "quote", label: "To first carrier quote", type: "hours" }, { key: "quotation", label: "To quotation", type: "hours" }]
      summary = [{ label: "Requests", value: rows.length, type: "num" }, { label: "Median to RFQ", value: median(rows.map((r) => r.rfq)), type: "hours" }, { label: "Median to carrier quote", value: median(rows.map((r) => r.quote)), type: "hours" }, { label: "Median to quotation", value: median(rows.map((r) => r.quotation)), type: "hours" }]
      break
    }
    case "approvals": {
      const rowsRaw = await all<any>((a, b) => admin.from("approval_requests")
        .select("id, request_id, sort_order, step_status, status, submitted_by, assigned_to, assigned_usernames, created_at, decided_at, notes, email_type, approval_cycles ( name ), approval_step_responses ( username, response, notes, created_at ), freight_requests!inner ( client_code, request_ref, sender_name, sender_email )")
        .eq("freight_requests.client_code", code).gte("created_at", fromIso).lt("created_at", toIso).order("created_at", { ascending: false }).range(a, b)).catch(() => [] as any[])
      // when each step became active: the previous step's decision (or the submission for the first step)
      const chainOf = new Map<string, any[]>()
      for (const r of rowsRaw) { const l = chainOf.get(r.request_id); l ? l.push(r) : chainOf.set(r.request_id, [r]) }
      for (const l of chainOf.values()) l.sort((x, y) => x.sort_order - y.sort_order)
      const ms = (v: unknown) => { const n = v ? Date.parse(String(v)) : NaN; return Number.isNaN(n) ? null : n }
      let list = rowsRaw.map((r) => {
        const chain = chainOf.get(r.request_id) ?? []
        const prev = chain.filter((x) => x.sort_order < r.sort_order).map((x) => ms(x.decided_at) ?? 0)
        const since = Math.max(ms(r.created_at) ?? 0, ...prev)
        const resp = (r.approval_step_responses ?? []) as any[]
        const rejected = resp.find((x) => x.response === "rejected")
        const approved = resp.find((x) => x.response === "approved")
        const outcome = r.step_status === "rejected" || rejected ? "Rejected" : r.step_status === "approved" || r.step_status === "skipped" ? "Approved" : r.step_status === "active" ? "Waiting" : "Not reached"
        const who = (rejected ?? approved)?.username ?? ""
        const decidedAt = ms(r.decided_at) ?? ms((rejected ?? approved)?.created_at)
        const names = (r.assigned_usernames?.length ? r.assigned_usernames : [r.assigned_to]).filter(Boolean)
        return {
          at: r.created_at, ref: r.freight_requests?.request_ref ?? "", requester: r.freight_requests?.sender_name || r.freight_requests?.sender_email || "",
          by: r.submitted_by ?? "", workflow: r.approval_cycles?.name ?? "", kind: r.email_type === "reply" ? "Reply" : "Carrier email", step: `Step ${r.sort_order + 1} of ${chain.length}`,
          approvers: names.join(", "), outcome, who, decided: decidedAt ? new Date(decidedAt).toISOString() : null,
          hours: decidedAt && since ? Math.round(((decidedAt - since) / 3600_000) * 10) / 10 : null, note: rejected?.notes ?? approved?.notes ?? r.notes ?? "",
        }
      })
      if (f.outcome === "approved") list = list.filter((r) => r.outcome === "Approved")
      else if (f.outcome === "rejected") list = list.filter((r) => r.outcome === "Rejected")
      else if (f.outcome === "pending") list = list.filter((r) => r.outcome === "Waiting")
      if (f.by) list = list.filter((r) => r.by.toLowerCase().includes(f.by.toLowerCase()))
      if (f.q) list = list.filter((r) => has([r.ref, r.requester], f.q))
      columns = [{ key: "at", label: "Submitted", type: "datetime" }, { key: "ref", label: "Request" }, { key: "requester", label: "Requester" }, { key: "kind", label: "Email" }, { key: "by", label: "Submitted by" }, { key: "workflow", label: "Workflow" },
        { key: "step", label: "Step" }, { key: "approvers", label: "Approvers" }, { key: "outcome", label: "Outcome" }, { key: "who", label: "Decided by" }, { key: "decided", label: "Decided", type: "datetime" }, { key: "hours", label: "Waited (h)", type: "hours" }, { key: "note", label: "Note" }]
      rows = list
      const done = list.filter((r) => r.hours != null).map((r) => r.hours as number).sort((a, b) => a - b)
      summary = [{ label: "Steps", value: list.length, type: "num" }, { label: "Approved", value: list.filter((r) => r.outcome === "Approved").length, type: "num" },
        { label: "Rejected", value: list.filter((r) => r.outcome === "Rejected").length, type: "num" }, { label: "Waiting", value: list.filter((r) => r.outcome === "Waiting").length, type: "num" },
        { label: "Median wait (h)", value: done.length ? done[Math.floor(done.length / 2)] : null, type: "hours" }]
      break
    }
    case "auto_reply": {
      let ls = await all<any>((a, b) => admin.from("auto_reply_logs").select("*").eq("client_code", code).gte("created_at", fromIso).lt("created_at", toIso).order("created_at", { ascending: false }).range(a, b)).catch(() => [])
      if (f.type) ls = ls.filter((l) => l.log_type === f.type)
      if (f.q) ls = ls.filter((l) => has([l.sender_email, l.sender_name], f.q))
      const T: Record<string, string> = { acknowledgement: "Acknowledgement", missing_fields: "Missing fields", carrier: "Carrier" }
      columns = [{ key: "at", label: "Sent", type: "datetime" }, { key: "type", label: "Type" }, { key: "sender", label: "Recipient" }, { key: "email", label: "Email" }, { key: "subject", label: "Subject" }]
      rows = ls.map((l) => ({ at: l.created_at, type: T[l.log_type] ?? l.log_type, sender: l.sender_name ?? "", email: l.sender_email, subject: l.subject ?? "" }))
      summary = [{ label: "Emails", value: rows.length, type: "num" }, ...Object.values(T).map((t) => ({ label: t, value: rows.filter((r) => r.type === t).length, type: "num" as const }))]
      break
    }
  }
  const c = cap(rows)
  return { title: def.title, columns, rows: c.rows, summary, note, truncated: c.truncated }
}
