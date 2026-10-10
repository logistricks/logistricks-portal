"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Maximize2,
  MoreHorizontal,
  RefreshCw,
  Search,
} from "lucide-react"
import { SourceBadge, StatusBadge } from "@/components/portal/badges"
import { type FreightRequest } from "@/lib/portal-data"
import { type DashboardStats, formatRelative } from "@/lib/supabase-queries"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { BigDashboard, KpiTile, MainCharts, RangeFilter, useDashboard } from "@/components/portal/dashboard-parts"
import { makeRange, money, hours, type DashRange } from "@/lib/dashboard-range"
import { CHART_COLORS } from "@/components/portal/charts"
import { HeroChecklist, HeroChip, PageHero } from "@/components/portal/page-hero"

interface ActivityItem {
  id: number
  description: string
  created_at: string
  event_type: string
}

const STATUS_FILTER_TABS = ["All", "New", "Pending", "Sent", "Quoted", "Delivered"]

export default function DashboardPage() {
  const { error: toastError } = useToast()
  const [range, setRange] = useState<DashRange>(() => makeRange("month"))
  const [big, setBig] = useState(false)
  const { data: dash, loading: dashLoading, refreshing, error: dashError, reload } = useDashboard(range)
  const [recent, setRecent] = useState<FreightRequest[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("All")
  const [search, setSearch] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const [reqRes, activityRes] = await Promise.all([fetch("/api/requests"), fetch("/api/activity?limit=5")])
        if (!reqRes.ok) throw new Error("Failed to load requests")
        const reqData = await reqRes.json()
        setRecent(Array.isArray(reqData) ? reqData : [])
        if (activityRes.ok) {
          const activityData = await activityRes.json()
          setActivity(Array.isArray(activityData) ? activityData.slice(0, 5) : [])
        }
      } catch (e) {
        toastError("Dashboard failed to load", (e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, 30_000)
    return () => clearInterval(t)
  }, [toastError])

  useEffect(() => { if (dashError) toastError("Dashboard metrics failed", dashError) }, [dashError, toastError])

  const total = recent.length
  const [userName, setUserName] = useState("")
  useEffect(() => {
    try {
      const n = sessionStorage.getItem("portal_username") ?? ""
      setUserName(n ? n.charAt(0).toUpperCase() + n.slice(1) : "")
    } catch { /* */ }
  }, [])
  const hr = new Date().getHours()
  const greeting = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening"
  const inRange = useMemo(
    () => recent.filter((r) => { const t = Date.parse(r.receivedIso); return isNaN(t) || (t >= range.from && t < range.to) }),
    [recent, range.from, range.to],
  )
  const series = dash?.series ?? []
  const col = (k: "requests" | "quotes" | "value") => series.map((x) => Number(x[k]) || 0)

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const rows = [["Ref", "Sender", "Origin", "Destination", "Cargo", "Status", "Received"],
      ...filteredRecentAll.map((r) => [r.requestRef, r.senderName, r.originCity, r.destinationCity, r.cargoType, r.status, r.receivedIso])]
    const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob); a.download = `requests-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(a.href)
  }

  const filteredRecentAll = useMemo(() => {
    let rows = inRange
    if (activeTab !== "All") {
      rows = rows.filter((r) => {
        const s = r.status?.toLowerCase() ?? ""
        const t = activeTab.toLowerCase()
        if (t === "sent") return s.includes("sent") || s.includes("carrier")
        if (t === "delivered") return s.includes("closed")
        return s.includes(t)
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.senderName?.toLowerCase().includes(q) ||
          r.originCity?.toLowerCase().includes(q) ||
          r.destinationCity?.toLowerCase().includes(q) ||
          r.cargoType?.toLowerCase().includes(q)
      )
    }
    return rows
  }, [inRange, activeTab, search])
  const filteredRecent = useMemo(() => filteredRecentAll.slice(0, 8), [filteredRecentAll])

  return (
    <div className="portal-page p-6 space-y-5">
      {/* Greeting */}
      <PageHero
        eyebrow={<>{range.label}<RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /></>}
        title={<>{greeting}{userName ? <>, <span style={{ color: "var(--brand-accent)" }}>{userName}</span></> : null}</>}
        chips={dash ? (
          <>
            <HeroChip>{Math.round(dash.kpis.needsAttention.value ?? 0)} need attention</HeroChip>
            <HeroChip>{Math.round(dash.kpis.active.value ?? 0)} open right now</HeroChip>
          </>
        ) : null}
        aside={
          <HeroChecklist
            title="This period"
            items={dash ? [
              <><b>{Math.round(dash.kpis.requests.value ?? 0).toLocaleString("en-US")}</b> requests received</>,
              <><b>{Math.round(dash.kpis.carrierQuotes.value ?? 0).toLocaleString("en-US")}</b> carrier quotes in</>,
              <><b>{money(dash.kpis.quotedValue.value ?? 0)}</b> quoted</>,
            ] : ["Loading…"]}
          />
        }
      />

      {/* Range and actions */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <RangeFilter range={range} onChange={setRange} compact />
        <button type="button" onClick={() => setBig(true)}
          className="flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-bold transition"
          style={{ background: "var(--brand-accent)", color: "var(--brand-navy)", boxShadow: "0 12px 24px -12px rgb(var(--brand-accent-rgb) / .7)" }}>
          <Maximize2 className="h-3.5 w-3.5" />
          Full dashboard
        </button>
        <button type="button" onClick={exportCsv}
          className="flex items-center gap-2 rounded-xl border-[1.5px] px-6 py-3 text-[14px] font-bold transition"
          style={{ borderColor: "var(--brand-navy)", color: "var(--brand-navy)", background: "var(--card-bg)" }}>
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile loading={dashLoading && !dash} label="Requests received" kpi={dash?.kpis.requests} spark={col("requests")} />
        <KpiTile loading={dashLoading && !dash} label="Carrier quotes" kpi={dash?.kpis.carrierQuotes} spark={col("quotes")} color={CHART_COLORS[1]} />
        <KpiTile loading={dashLoading && !dash} label="Quoted value" kpi={dash?.kpis.quotedValue} format={money} spark={col("value")} color={CHART_COLORS[3]} hint="Sum of final prices on quotations sent" />
        <KpiTile loading={dashLoading && !dash} label="Median time to quote" kpi={dash?.kpis.hoursToQuote} format={hours} lowerIsBetter color={CHART_COLORS[2]} hint="Request received → first quotation prepared" />
      </div>

      {/* The 3 main charts */}
      <MainCharts data={dash} loading={dashLoading} />

      {/* Main grid: table left, sidebar right */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        {/* Freight Requests table card */}
        <div className="ds-card overflow-hidden">
          <div className="ds-card-header">
            <span className="font-display text-[20px] font-extrabold" style={{ color: "var(--text-primary)" }}>
              Freight Requests
            </span>
            <div className="flex items-center gap-2">
              {/* Filter tabs */}
              <div
                className="flex flex-wrap gap-1 rounded-full p-1"
                style={{ background: "var(--page-bg)" }}
              >
                {STATUS_FILTER_TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="rounded-full px-4 py-1.5 text-[13px] font-bold border-none cursor-pointer transition-all"
                    style={
                      activeTab === tab
                        ? { background: "var(--card-bg)", color: "var(--text-primary)", boxShadow: "0 1px 3px rgba(15,30,54,0.08)" }
                        : { background: "transparent", color: "var(--text-secondary)" }
                    }
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {/* Search */}
              <div
                className="flex items-center gap-1.5 rounded-[6px] border px-2.5 py-[5px]"
                style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}
              >
                <Search className="h-3 w-3 shrink-0" style={{ color: "var(--text-muted)" }} />
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-none outline-none bg-transparent text-[12.5px] w-[120px]"
                  style={{ color: "var(--text-primary)" }}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="ds-table w-full">
              <thead>
                <tr>
                  <th>Ref #</th>
                  <th>Sender</th>
                  <th>Route</th>
                  <th className="hidden lg:table-cell">Cargo</th>
                  <th>Status</th>
                  <th className="hidden md:table-cell">Received</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td><Skeleton h={14} w={56} /></td>
                      <td><Skeleton h={14} w={100} /></td>
                      <td><Skeleton h={14} w={130} /></td>
                      <td className="hidden lg:table-cell"><Skeleton h={14} w={70} /></td>
                      <td><Skeleton h={20} w={72} /></td>
                      <td className="hidden md:table-cell"><Skeleton h={12} w={60} /></td>
                      <td></td>
                    </tr>
                  ))
                ) : filteredRecent.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-sm" style={{ color: "var(--text-muted)" }}>
                      No requests found.
                    </td>
                  </tr>
                ) : (
                  filteredRecent.map((r) => (
                    <tr
                      key={r.id}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "" }}
                    >
                      <td>
                        <div className="font-semibold tabular-nums text-[13px] font-mono" style={{ color: "var(--text-primary)" }}>
                          {r.requestRef ?? (r.id ? `LT-${r.id}` : "")}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                          <SourceBadge source={r.source} />
                        </div>
                      </td>
                      <td>
                        <div className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                          {r.senderName}
                        </div>
                      </td>
                      <td>
                        <div className="text-[12.5px]" style={{ color: "var(--text-primary)" }}>
                          {r.originCity} → {r.destinationCity}
                        </div>
                      </td>
                      <td className="hidden lg:table-cell">
                        <div className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                          {r.cargoType}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="hidden md:table-cell">
                        <div className="text-[12px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {r.receivedRelative}
                        </div>
                      </td>
                      <td>
                        <MoreHorizontal className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: "1px solid var(--divider)" }}
          >
            <span className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
              {loading ? "Loading…" : `Showing ${filteredRecent.length} of ${filteredRecentAll.length} in this period (${total} total)`}
            </span>
            <Link
              href="/requests"
              className="text-[12px] font-semibold hover:underline"
              style={{ color: "var(--brand-accent)" }}
            >
              View All →
            </Link>
          </div>
        </div>

        {/* Sidebar: Chart + Recent Activity */}
        <div className="flex flex-col gap-5">
          {/* Recent Activity */}
          <div className="ds-card">
            <div className="ds-card-header">
              <span className="font-display text-[20px] font-extrabold" style={{ color: "var(--text-primary)" }}>
                Recent Activity
              </span>
              <Link
                href="/users?tab=activity"
                className="text-[12px] font-semibold hover:underline"
                style={{ color: "var(--brand-accent)" }}
              >
                View all
              </Link>
            </div>
            <div className="py-0.5">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} h={14} />)}
                </div>
              ) : activity.length === 0 ? (
                <p className="p-4 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  No recent activity.
                </p>
              ) : (
                activity.map((a) => (
                  <div
                    key={a.id}
                    className="flex gap-3 px-6 py-3.5 items-start"
                    style={{ borderBottom: "1px solid var(--divider)" }}
                  >
                    <div
                      className="h-2 w-2 rounded-full mt-[5px] shrink-0"
                      style={{ background: "var(--brand-accent)" }}
                    />
                    <div>
                      <div className="text-[14px] font-medium leading-[1.45]" style={{ color: "var(--text-primary)" }}>
                        {a.description}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {formatRelative(new Date(a.created_at))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      {big && (
        <BigDashboard range={range} onRange={setRange} data={dash} loading={dashLoading} refreshing={refreshing} onReload={reload} onClose={() => setBig(false)} />
      )}
    </div>
  )
}
