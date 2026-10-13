"use client"

import Link from "next/link"
import { DatePicker } from "@/components/portal/date-picker"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Calendar, RefreshCw, X } from "lucide-react"
import { makeRange, type DashRange, type RangeKey, money, hours, percent } from "@/lib/dashboard-range"
import { CHART_COLORS, CountUp, Donut, Funnel, HBars, Legend, Spark, TrendChart } from "@/components/portal/charts"
import { Skeleton } from "@/components/ui/skeleton"
import type { WinLossSummary } from "@/lib/win-loss"

export interface Kpi { value: number | null; prev: number | null }
export interface DashData {
  range: { from: number; to: number; unit: string }
  generatedAt: number
  kpis: Record<"requests" | "active" | "needsAttention" | "carrierQuotes" | "rfqs" | "quotationsSent" | "quotedValue" | "margin" | "closed" | "hoursToQuote" | "winRate" | "autoReplies" | "avgQuotation" | "won" | "lost" | "wonRevenue" | "profit" | "profitPaid", Kpi>
  series: { label: string; requests: number; quotes: number; quotations: number; closed: number; value: number; margin: number; won: number; lost: number; profit: number }[]
  sales: WinLossSummary
  statusPeriod: { label: string; value: number }[]
  statusSnapshot: { label: string; value: number }[]
  source: { label: string; value: number }[]
  lanes: { label: string; value: number }[]
  senders: { label: string; value: number }[]
  cargo: { label: string; value: number }[]
  incoterms: { label: string; value: number }[]
  urgency: { label: string; value: number }[]
  mode: { Sea: number; Air: number; Land: number }
  intake: { automatic: number; manual: number }
  flags: { aog: number; dgr: number; exw: number; incomplete: number }
  carriers: { name: string; rfqs: number; quotes: number; responseRate: number | null; avgRate: number | null }[]
  funnel: { label: string; value: number }[]
}

/** Live data: loads on change, polls every 30 s, refreshes when the tab regains focus. */
export function useDashboard(range: DashRange) {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const cache = useRef(new Map<string, DashData>())
  const hasData = useRef(false)

  const load = useCallback(async (silent = false) => {
    const id = ++seq.current
    const key = `${range.from}-${range.to}`
    const cached = cache.current.get(key)
    // Show a cached/previous result instantly while the fresh one loads
    if (cached) { setData(cached); hasData.current = true }
    silent || cached || hasData.current ? setRefreshing(true) : setLoading(true)
    try {
      const qs = new URLSearchParams({ from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString(), tz: String(new Date().getTimezoneOffset()) })
      const res = await fetch(`/api/dashboard?${qs}`, { cache: "no-store" })
      const json = await res.json()
      if (id !== seq.current) return
      if (!res.ok) throw new Error(json.error || "Failed to load")
      cache.current.set(key, json); hasData.current = true
      setData(json); setError(null)
    } catch (e) {
      if (id === seq.current) setError((e as Error).message)
    } finally {
      if (id === seq.current) { setLoading(false); setRefreshing(false) }
    }
  }, [range.from, range.to])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(true) }, 30_000)
    const vis = () => { if (!document.hidden) load(true) }
    document.addEventListener("visibilitychange", vis)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis) }
  }, [load])

  return { data, loading, refreshing, error, reload: () => load(true) }
}

/* ── Click-through targets (dashboard items open the matching page) ── */
const enc = encodeURIComponent
export const stageHref = (label: string) => `/requests?stage=${enc(label)}`
const FUNNEL_HREF: Record<string, string> = {
  "Received": "/requests?stage=all", "RFQ sent": "/requests?stage=Sent%20to%20Carrier", "Carrier quote": "/requests?stage=Quoted",
  "Quotation sent": "/requests?stage=Quoted", "Won": "/requests?outcome=won",
}
export const funnelHref = (label: string) => FUNNEL_HREF[label] ?? "/requests"
export const searchHref = (label: string) => `/requests?q=${enc(label)}&stage=all`
export const laneHref = (label: string) => searchHref(label.split(/\s*(?:→|->|-|–|to)\s*/)[0] || label)
export const toReports = () => "/reports"
export const toRequests = () => "/requests"

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" }, { key: "week", label: "This week" }, { key: "month", label: "This month" }, { key: "custom", label: "Custom" },
]
const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }

export function RangeFilter({ range, onChange, compact }: { range: DashRange; onChange: (r: DashRange) => void; compact?: boolean }) {
  const [cFrom, setCFrom] = useState(iso(range.from))
  const [cTo, setCTo] = useState(iso(range.to - 1))
  const apply = (f: string, t: string) => onChange(makeRange("custom", f, t))
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      <div className="range-seg" role="tablist" aria-label="Date range">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" role="tab" aria-selected={range.key === p.key}
            onClick={() => (p.key === "custom" ? apply(cFrom, cTo) : onChange(makeRange(p.key)))}
            className={`range-seg-btn ${range.key === p.key ? "is-on" : ""}`}>
            {p.key === "custom" && <Calendar className="h-3.5 w-3.5" />}
            {p.label}
          </button>
        ))}
      </div>
      {range.key === "custom" && (
        <div className="range-dates">
          <DatePicker label="From" value={cFrom} max={cTo} onChange={(v) => { setCFrom(v); apply(v, cTo) }} />
          <span>→</span>
          <DatePicker label="To" value={cTo} min={cFrom} onChange={(v) => { setCTo(v); apply(cFrom, v) }} />
        </div>
      )}
      {!compact && (
        <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          <Calendar className="h-3.5 w-3.5" />{range.label}
        </span>
      )}
    </div>
  )
}

function Delta({ cur, prev, lowerIsBetter }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean }) {
  if (cur == null || prev == null || (prev === 0 && cur === 0)) return null
  const ch = prev === 0 ? 100 : ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(ch) < 0.5) return <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>no change</span>
  const up = ch > 0, good = lowerIsBetter ? !up : up
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
      style={good ? { background: "rgba(22,163,74,.1)", color: "#16a34a" } : { background: "rgba(220,38,38,.1)", color: "#dc2626" }}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(Math.round(ch))}%
    </span>
  )
}

export function KpiTile({ label, kpi, format, spark, color = "var(--brand-accent)", lowerIsBetter, hint, loading, href, newTab }:
  { href?: string; newTab?: boolean; label: string; kpi?: Kpi; format?: (n: number) => string; spark?: number[]; color?: string; lowerIsBetter?: boolean; hint?: string; loading?: boolean }) {
  const f = format ?? ((n: number) => Math.round(n).toLocaleString("en-US"))
  const cls = "ds-card kpi-card flex flex-col items-center p-6 text-center"
  const body = (<>
      <p className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>{label}</p>
      <div className="mt-3 flex justify-center">
        {loading || !kpi ? <Skeleton h={44} w={96} /> : (
          <p className="font-display text-[46px] font-extrabold leading-none tabular-nums" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
            <CountUp value={kpi.value} format={f} />
          </p>
        )}
      </div>
      <div className="mt-3">{!loading && kpi && <Delta cur={kpi.value} prev={kpi.prev} lowerIsBetter={lowerIsBetter} />}</div>
      <div className="mt-3 flex justify-center">{!loading && spark && <Spark values={spark} color={color} />}</div>
  </>)
  if (href) return <Link href={href} {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={`${cls} kpi-link`} title={hint}>{body}</Link>
  return <div className={cls} title={hint}>{body}</div>
}

export function Card({ title, sub, right, children, className = "" }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`ds-card ${className}`}>
      <div className="ds-card-header">
        <div>
          <span className="font-display text-[20px] font-extrabold" style={{ color: "var(--text-primary)" }}>{title}</span>
          {sub && <div className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

const ChartSkeleton = ({ h = 200 }: { h?: number }) => <Skeleton h={h} className="w-full" />

/* ───────────── Won / lost results and profit ───────────── */
const STAGE_COLOR: Record<string, string> = { won: "#16a34a", booked: "#0ea5e9", invoiced: "#8b5cf6", paid: "#059669" }
export function SalesResults({ data, loading }: { data: DashData | null; loading: boolean }) {
  const k = data?.kpis, sa = data?.sales
  const L = loading && !data
  const s = data?.series ?? []
  const col = (key: "won" | "lost" | "profit") => s.map((x) => Number(x[key]) || 0)
  const maxStage = Math.max(1, ...(sa?.stages ?? []).map((x) => x.count))
  return (
    <section className="space-y-5">
      <h3 className="text-center font-display text-[24px] font-extrabold" style={{ color: "var(--text-primary)" }}>Won &amp; lost</h3>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiTile loading={L} label="Won" kpi={k?.won} spark={col("won")} color="#16a34a" href="/requests?outcome=won" hint="Requests marked Won in this period" />
        <KpiTile loading={L} label="Lost" kpi={k?.lost} spark={col("lost")} color="#ef4444" lowerIsBetter href="/requests?outcome=lost" hint="Requests marked Lost in this period" />
        <KpiTile loading={L} label="Win rate" kpi={k?.winRate} format={percent} color="#16a34a" hint="Won ÷ (won + lost). Closed requests are dismissed and not counted." />
        <KpiTile loading={L} label="Won value" kpi={k?.wonRevenue} format={money} color={CHART_COLORS[3]} hint="What the won deals were sold for" />
        <KpiTile loading={L} label="Profit (markup)" kpi={k?.profit} format={money} spark={col("profit")} color="#16a34a" hint="Won price minus the carrier price, on won deals" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Won deals by stage" sub="Won in this period · count and profit">
          {L ? <ChartSkeleton h={160} /> : (
            <div className="space-y-3">
              {(sa?.stages ?? []).map((st) => (
                <div key={st.stage}>
                  <div className="mb-0.5 flex justify-between gap-2 text-[12.5px]">
                    <span style={{ color: "var(--text-primary)" }}>{st.label}</span>
                    <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>{st.count} · {money(st.profit)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--divider)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(st.count / maxStage) * 100}%`, background: STAGE_COLOR[st.stage], transition: "width .6s" }} />
                  </div>
                </div>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-3 text-center" style={{ borderColor: "var(--divider)" }}>
                <div><p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Profit invoiced</p><p className="text-[18px] font-extrabold tabular-nums" style={{ color: "var(--text-primary)" }}>{money(sa?.profitInvoiced ?? 0)}</p></div>
                <div><p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Profit collected</p><p className="text-[18px] font-extrabold tabular-nums" style={{ color: "#059669" }}>{money(sa?.profitPaid ?? 0)}</p></div>
              </div>
              {!!sa?.profitMissing && <p className="text-[11.5px]" style={{ color: "#b45309" }}>{sa.profitMissing} won deal{sa.profitMissing > 1 ? "s" : ""} without a carrier price — profit not counted for them.</p>}
            </div>
          )}
        </Card>
        <Card title="Why deals were lost" sub="Lost in this period"><HBars color="#ef4444" items={sa?.lostReasons ?? []} empty="No lost deals in this period." /></Card>
        <Card title="Profit by carrier" sub="Won deals, USD"><HBars color="#16a34a" format={money} items={sa?.profitByCarrier ?? []} empty="No won deals in this period." /></Card>
      </div>
      <Card title="Profit over time" sub="Markup on won deals (USD) and number won" right={<Legend items={[{ label: "Profit", color: "#16a34a" }, { label: "Won", color: CHART_COLORS[0] }, { label: "Lost", color: "#ef4444" }]} />}>
        {L ? <ChartSkeleton /> : <TrendChart data={s} format={(n) => (Number.isInteger(n) && n < 1000 ? String(n) : money(n))} series={[
          { key: "profit", label: "Profit", color: "#16a34a" }, { key: "won", label: "Won", color: CHART_COLORS[0], kind: "line" }, { key: "lost", label: "Lost", color: "#ef4444", kind: "line" }]} />}
      </Card>
    </section>
  )
}

/* ───────────── The three main cards ───────────── */
export function MainCharts({ data, loading }: { data: DashData | null; loading: boolean }) {
  const s = data?.series ?? []
  const status = data?.statusPeriod ?? []
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr_1.1fr]">
      <Card title="Request volume" sub="Requests received, carrier quotes and closed" right={<Legend items={[
        { label: "Requests", color: CHART_COLORS[0] }, { label: "Carrier quotes", color: CHART_COLORS[1] }, { label: "Closed (dismissed)", color: CHART_COLORS[2] }]} />}>
        {loading && !data ? <ChartSkeleton /> : (
          <TrendChart data={s} height={210} series={[
            { key: "requests", label: "Requests", color: CHART_COLORS[0] },
            { key: "quotes", label: "Carrier quotes", color: CHART_COLORS[1] },
            { key: "closed", label: "Closed", color: CHART_COLORS[2], kind: "line" },
          ]} />
        )}
      </Card>
      <Card title="Pipeline status" sub="Requests received in this period">
        {loading && !data ? <ChartSkeleton /> : <Donut hrefFor={stageHref} items={status.slice(0, 6)} centerValue={data?.kpis.requests.value ?? 0} centerLabel="Requests" />}
      </Card>
      <Card title="Conversion funnel" sub="From received to won">
        {loading && !data ? <ChartSkeleton /> : <Funnel hrefFor={funnelHref} steps={data?.funnel ?? []} />}
      </Card>
    </div>
  )
}

/* ───────────── Big dashboard popup ───────────── */
export function BigDashboard({ range, onRange, data, loading, refreshing, onReload, onClose }:
  { range: DashRange; onRange: (r: DashRange) => void; data: DashData | null; loading: boolean; refreshing: boolean; onReload: () => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", k)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = prev }
  }, [onClose])

  const k = data?.kpis
  const s = data?.series ?? []
  const col = (key: keyof DashData["series"][number]) => s.map((x) => Number(x[key]) || 0)
  const L = loading && !data
  const modeItems = data ? [{ label: "Sea", value: data.mode.Sea }, { label: "Air", value: data.mode.Air }, { label: "Land", value: data.mode.Land }].filter((x) => x.value > 0) : []
  const intakeItems = data ? [{ label: "Automatic", value: data.intake.automatic }, { label: "Manual", value: data.intake.manual }].filter((x) => x.value > 0) : []
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-2 backdrop-blur-[2px] sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-full w-full max-w-[1280px] flex-col overflow-hidden rounded-[22px] border shadow-2xl" style={{ background: "var(--page-bg)", borderColor: "var(--card-border)" }}>
        <div className="big-dash-head flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 sm:px-7"
          style={{ background: "linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-navy-mid) 60%, var(--brand-navy-light) 100%)" }}>
          <div className="min-w-0">
            <h3 className="font-display text-[22px] font-extrabold leading-tight text-white">Full dashboard</h3>
            <p className="mt-0.5 text-[12px]" style={{ color: "rgba(255,255,255,.66)" }}>
              {range.label} · vs previous equal period · live
              {data && <> · updated {new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <RangeFilter range={range} onChange={onRange} compact />
            <button type="button" onClick={onReload} title="Refresh" aria-label="Refresh" className="big-dash-icon">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close" className="big-dash-icon">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiTile href="/requests?stage=all" newTab loading={L} label="Requests" kpi={k?.requests} spark={col("requests")} />
            <KpiTile href="/requests" newTab loading={L} label="Open right now" kpi={k?.active} hint="All requests not Closed or Rejected (not period based)" />
            <KpiTile href="/requests?attention=1" newTab loading={L} label="Need attention" kpi={k?.needsAttention} color="#dc2626" hint="Pending or waiting for approval, received in this period" />
            <KpiTile href="/requests?stage=Sent%20to%20Carrier" newTab loading={L} label="RFQs sent" kpi={k?.rfqs} />
            <KpiTile href="/requests?stage=Quoted" newTab loading={L} label="Carrier quotes" kpi={k?.carrierQuotes} spark={col("quotes")} color={CHART_COLORS[1]} />
            <KpiTile href="/requests?stage=Quoted" newTab loading={L} label="Quotations sent" kpi={k?.quotationsSent} spark={col("quotations")} color={CHART_COLORS[3]} />
            <KpiTile href="/reports" newTab loading={L} label="Quoted value" kpi={k?.quotedValue} format={money} spark={col("value")} color={CHART_COLORS[3]} hint="Sum of final prices on quotations sent" />
            <KpiTile href="/reports" newTab loading={L} label="Margin" kpi={k?.margin} format={money} spark={col("margin")} color={CHART_COLORS[2]} hint="Final price minus carrier base rate, quotations sent" />
            <KpiTile href="/reports" newTab loading={L} label="Avg quotation" kpi={k?.avgQuotation} format={money} />
            <KpiTile href="/reports" newTab loading={L} label="Median time to quote" kpi={k?.hoursToQuote} format={hours} lowerIsBetter hint="Request received → first quotation prepared" />
            <KpiTile href="/requests?stage=Closed" newTab loading={L} label="Closed (dismissed)" kpi={k?.closed} spark={col("closed")} color={CHART_COLORS[2]} hint="Requests dismissed. Not a win or a loss." />
            <KpiTile href="/reports" newTab loading={L} label="Win rate" kpi={k?.winRate} format={percent} hint="Won ÷ (won + lost)" color="#16a34a" />
          </div>

          <SalesResults data={data} loading={L} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Request volume" right={<Legend items={[{ label: "Requests", color: CHART_COLORS[0] }, { label: "Carrier quotes", color: CHART_COLORS[1] }, { label: "Closed (dismissed)", color: CHART_COLORS[2] }]} />}>
              {L ? <ChartSkeleton /> : <TrendChart data={s} series={[
                { key: "requests", label: "Requests", color: CHART_COLORS[0] }, { key: "quotes", label: "Carrier quotes", color: CHART_COLORS[1] },
                { key: "closed", label: "Closed", color: CHART_COLORS[2], kind: "line" }]} />}
            </Card>
            <Card title="Quoted value & margin" sub="Quotations sent (USD)" right={<Legend items={[{ label: "Quoted value", color: CHART_COLORS[3] }, { label: "Margin", color: CHART_COLORS[2] }]} />}>
              {L ? <ChartSkeleton /> : <TrendChart data={s} format={money} series={[
                { key: "value", label: "Quoted value", color: CHART_COLORS[3] }, { key: "margin", label: "Margin", color: CHART_COLORS[2], kind: "line" }]} />}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card title="Pipeline status" sub="Received in this period"><Donut newTab hrefFor={stageHref} items={data?.statusPeriod.slice(0, 7) ?? []} centerValue={k?.requests.value ?? 0} centerLabel="Requests" /></Card>
            <Card title="Conversion funnel"><Funnel newTab hrefFor={funnelHref} steps={data?.funnel ?? []} /></Card>
            <Card title="All open requests" sub="Current status, any date"><Donut newTab hrefFor={stageHref} items={data?.statusSnapshot.slice(0, 7) ?? []} centerLabel="All time" /></Card>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <Card title="Transport mode"><Donut newTab hrefFor={toRequests} size={120} items={modeItems} centerLabel="Requests" /></Card>
            <Card title="Channel"><Donut newTab hrefFor={toRequests} size={120} items={data?.source ?? []} centerLabel="Requests" /></Card>
            <Card title="Intake"><Donut newTab hrefFor={toRequests} size={120} items={intakeItems} centerLabel="Requests" /></Card>
            <Card title="Needs attention flags">
              <HBars newTab hrefFor={() => "/requests?attention=1"} color="#dc2626" items={[
                { label: "Incomplete (missing fields)", value: data?.flags.incomplete ?? 0 },
                { label: "EXW", value: data?.flags.exw ?? 0 },
                { label: "AOG", value: data?.flags.aog ?? 0 },
                { label: "Dangerous goods", value: data?.flags.dgr ?? 0 },
              ].filter((x) => x.value > 0)} empty="Nothing flagged." />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card title="Top lanes"><HBars newTab hrefFor={laneHref} items={data?.lanes ?? []} /></Card>
            <Card title="Top requesters"><HBars newTab hrefFor={searchHref} color={CHART_COLORS[1]} items={data?.senders ?? []} /></Card>
            <Card title="Cargo types"><HBars newTab hrefFor={searchHref} color={CHART_COLORS[3]} items={data?.cargo ?? []} /></Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Card title="Carrier performance" sub="RFQs sent vs quotes received in this period">
              {data && data.carriers.length === 0 ? <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>No carrier activity in this period.</p> : (
                <div className="overflow-x-auto">
                  <table className="ds-table w-full">
                    <thead><tr><th>Carrier</th><th>RFQs</th><th>Quotes</th><th>Response</th><th>Avg rate</th></tr></thead>
                    <tbody>
                      {(data?.carriers ?? []).map((c) => (
                        <tr key={c.name} className="cursor-pointer" onClick={() => window.open("/settings?tab=carriers", "_blank", "noopener")}>
                          <td className="font-medium">{c.name}</td><td className="tabular-nums">{c.rfqs}</td><td className="tabular-nums">{c.quotes}</td>
                          <td className="tabular-nums">{percent(c.responseRate)}</td><td className="tabular-nums">{money(c.avgRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <div className="space-y-5">
              <Card title="Incoterms"><HBars color={CHART_COLORS[4]} items={data?.incoterms ?? []} /></Card>
              <Card title="Urgency"><HBars color={CHART_COLORS[5]} items={data?.urgency ?? []} /></Card>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
