"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Calendar, RefreshCw, X } from "lucide-react"
import { makeRange, type DashRange, type RangeKey, money, hours, percent } from "@/lib/dashboard-range"
import { CHART_COLORS, CountUp, Donut, Funnel, HBars, Legend, Spark, TrendChart } from "@/components/portal/charts"
import { Skeleton } from "@/components/ui/skeleton"

export interface Kpi { value: number | null; prev: number | null }
export interface DashData {
  range: { from: number; to: number; unit: string }
  generatedAt: number
  kpis: Record<"requests" | "active" | "needsAttention" | "carrierQuotes" | "rfqs" | "quotationsSent" | "quotedValue" | "margin" | "closed" | "hoursToQuote" | "winRate" | "autoReplies" | "avgQuotation", Kpi>
  series: { label: string; requests: number; quotes: number; quotations: number; closed: number; value: number; margin: number }[]
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

  const load = useCallback(async (silent = false) => {
    const id = ++seq.current
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const qs = new URLSearchParams({ from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString(), tz: String(new Date().getTimezoneOffset()) })
      const res = await fetch(`/api/dashboard?${qs}`, { cache: "no-store" })
      const json = await res.json()
      if (id !== seq.current) return
      if (!res.ok) throw new Error(json.error || "Failed to load")
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

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" }, { key: "week", label: "This week" }, { key: "month", label: "This month" }, { key: "custom", label: "Custom" },
]
const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }

export function RangeFilter({ range, onChange, compact }: { range: DashRange; onChange: (r: DashRange) => void; compact?: boolean }) {
  const [cFrom, setCFrom] = useState(iso(range.from))
  const [cTo, setCTo] = useState(iso(range.to - 1))
  const apply = (f: string, t: string) => onChange(makeRange("custom", f, t))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-0.5 rounded-[7px] p-0.5" style={{ background: "var(--page-bg)", border: "1px solid var(--card-border)" }}>
        {PRESETS.map((p) => (
          <button key={p.key} type="button"
            onClick={() => (p.key === "custom" ? apply(cFrom, cTo) : onChange(makeRange(p.key)))}
            className="rounded-[5px] px-3 py-1 text-[12px] font-medium"
            style={range.key === p.key
              ? { background: "var(--brand-accent)", color: "#fff", boxShadow: "0 1px 4px var(--brand-accent-ring, rgba(232,130,26,.3))" }
              : { background: "transparent", color: "var(--text-secondary)" }}>
            {p.label}
          </button>
        ))}
      </div>
      {range.key === "custom" && (
        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          <input type="date" value={cFrom} max={cTo} onChange={(e) => { setCFrom(e.target.value); if (e.target.value) apply(e.target.value, cTo) }} className="ds-input !py-1 text-[12px]" />
          <span>to</span>
          <input type="date" value={cTo} min={cFrom} onChange={(e) => { setCTo(e.target.value); if (e.target.value) apply(cFrom, e.target.value) }} className="ds-input !py-1 text-[12px]" />
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

export function KpiTile({ label, kpi, format, spark, color = "var(--brand-accent)", lowerIsBetter, hint, loading }:
  { label: string; kpi?: Kpi; format?: (n: number) => string; spark?: number[]; color?: string; lowerIsBetter?: boolean; hint?: string; loading?: boolean }) {
  const f = format ?? ((n: number) => Math.round(n).toLocaleString("en-US"))
  return (
    <div className="ds-card p-4" title={hint}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>{label}</p>
        {!loading && kpi && <Delta cur={kpi.value} prev={kpi.prev} lowerIsBetter={lowerIsBetter} />}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        {loading || !kpi ? <Skeleton h={30} w={72} /> : (
          <p className="text-[26px] font-bold leading-tight tabular-nums" style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            <CountUp value={kpi.value} format={f} />
          </p>
        )}
        {!loading && spark && <Spark values={spark} color={color} />}
      </div>
    </div>
  )
}

export function Card({ title, sub, right, children, className = "" }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`ds-card ${className}`}>
      <div className="ds-card-header">
        <div>
          <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</span>
          {sub && <div className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

const ChartSkeleton = ({ h = 200 }: { h?: number }) => <Skeleton h={h} className="w-full" />

/* ───────────── The three main cards ───────────── */
export function MainCharts({ data, loading }: { data: DashData | null; loading: boolean }) {
  const s = data?.series ?? []
  const status = data?.statusPeriod ?? []
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr_1.1fr]">
      <Card title="Request volume" sub="Requests received, carrier quotes and closed" right={<Legend items={[
        { label: "Requests", color: CHART_COLORS[0] }, { label: "Carrier quotes", color: CHART_COLORS[1] }, { label: "Closed", color: CHART_COLORS[2] }]} />}>
        {loading && !data ? <ChartSkeleton /> : (
          <TrendChart data={s} height={210} series={[
            { key: "requests", label: "Requests", color: CHART_COLORS[0] },
            { key: "quotes", label: "Carrier quotes", color: CHART_COLORS[1] },
            { key: "closed", label: "Closed", color: CHART_COLORS[2], kind: "line" },
          ]} />
        )}
      </Card>
      <Card title="Pipeline status" sub="Requests received in this period">
        {loading && !data ? <ChartSkeleton /> : <Donut items={status.slice(0, 6)} centerValue={data?.kpis.requests.value ?? 0} centerLabel="Requests" />}
      </Card>
      <Card title="Conversion funnel" sub="From received to closed">
        {loading && !data ? <ChartSkeleton /> : <Funnel steps={data?.funnel ?? []} />}
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
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/55 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[1280px] rounded-xl border shadow-2xl" style={{ background: "var(--page-bg)", borderColor: "var(--card-border)" }}>
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b px-5 py-3.5" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
          <div>
            <h3 className="text-[17px] font-bold" style={{ color: "var(--text-primary)" }}>Full dashboard</h3>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {range.label} · compared with the previous equal period · live
              {data && <> · updated {new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <RangeFilter range={range} onChange={onRange} compact />
            <button type="button" onClick={onReload} title="Refresh" className="rounded-md border p-1.5" style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={onClose} title="Close (Esc)" className="rounded-md border p-1.5" style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiTile loading={L} label="Requests" kpi={k?.requests} spark={col("requests")} />
            <KpiTile loading={L} label="Open right now" kpi={k?.active} hint="All requests not Closed or Rejected (not period based)" />
            <KpiTile loading={L} label="Need attention" kpi={k?.needsAttention} color="#dc2626" hint="Pending or waiting for approval, received in this period" />
            <KpiTile loading={L} label="RFQs sent" kpi={k?.rfqs} />
            <KpiTile loading={L} label="Carrier quotes" kpi={k?.carrierQuotes} spark={col("quotes")} color={CHART_COLORS[1]} />
            <KpiTile loading={L} label="Quotations sent" kpi={k?.quotationsSent} spark={col("quotations")} color={CHART_COLORS[3]} />
            <KpiTile loading={L} label="Quoted value" kpi={k?.quotedValue} format={money} spark={col("value")} color={CHART_COLORS[3]} hint="Sum of final prices on quotations sent" />
            <KpiTile loading={L} label="Margin" kpi={k?.margin} format={money} spark={col("margin")} color={CHART_COLORS[2]} hint="Final price minus carrier base rate, quotations sent" />
            <KpiTile loading={L} label="Avg quotation" kpi={k?.avgQuotation} format={money} />
            <KpiTile loading={L} label="Median time to quote" kpi={k?.hoursToQuote} format={hours} lowerIsBetter hint="Request received → first quotation prepared" />
            <KpiTile loading={L} label="Closed" kpi={k?.closed} spark={col("closed")} color={CHART_COLORS[2]} />
            <KpiTile loading={L} label="Closed ÷ quotes sent" kpi={k?.winRate} format={percent} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Request volume" right={<Legend items={[{ label: "Requests", color: CHART_COLORS[0] }, { label: "Carrier quotes", color: CHART_COLORS[1] }, { label: "Closed", color: CHART_COLORS[2] }]} />}>
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
            <Card title="Pipeline status" sub="Received in this period"><Donut items={data?.statusPeriod.slice(0, 7) ?? []} centerValue={k?.requests.value ?? 0} centerLabel="Requests" /></Card>
            <Card title="Conversion funnel"><Funnel steps={data?.funnel ?? []} /></Card>
            <Card title="All open requests" sub="Current status, any date"><Donut items={data?.statusSnapshot.slice(0, 7) ?? []} centerLabel="All time" /></Card>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <Card title="Transport mode"><Donut size={120} items={modeItems} centerLabel="Requests" /></Card>
            <Card title="Channel"><Donut size={120} items={data?.source ?? []} centerLabel="Requests" /></Card>
            <Card title="Intake"><Donut size={120} items={intakeItems} centerLabel="Requests" /></Card>
            <Card title="Needs attention flags">
              <HBars color="#dc2626" items={[
                { label: "Incomplete (missing fields)", value: data?.flags.incomplete ?? 0 },
                { label: "EXW", value: data?.flags.exw ?? 0 },
                { label: "AOG", value: data?.flags.aog ?? 0 },
                { label: "Dangerous goods", value: data?.flags.dgr ?? 0 },
              ].filter((x) => x.value > 0)} empty="Nothing flagged." />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card title="Top lanes"><HBars items={data?.lanes ?? []} /></Card>
            <Card title="Top requesters"><HBars color={CHART_COLORS[1]} items={data?.senders ?? []} /></Card>
            <Card title="Cargo types"><HBars color={CHART_COLORS[3]} items={data?.cargo ?? []} /></Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Card title="Carrier performance" sub="RFQs sent vs quotes received in this period">
              {data && data.carriers.length === 0 ? <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>No carrier activity in this period.</p> : (
                <div className="overflow-x-auto">
                  <table className="ds-table w-full">
                    <thead><tr><th>Carrier</th><th>RFQs</th><th>Quotes</th><th>Response</th><th>Avg rate</th></tr></thead>
                    <tbody>
                      {(data?.carriers ?? []).map((c) => (
                        <tr key={c.name}>
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
  )
}
