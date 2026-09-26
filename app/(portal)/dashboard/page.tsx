"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Clock,
  Download,
  Inbox,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Search,
  Send,
  TrendingUp,
  Truck,
  Zap,
} from "lucide-react"
import { SourceBadge, StatusBadge } from "@/components/portal/badges"
import { currentUser } from "@/lib/portal-data"
import { type FreightRequest } from "@/lib/portal-data"
import { type DashboardStats } from "@/lib/supabase-queries"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"

interface DailyCount {
  date: string
  shortDate: string
  count: number
  isToday: boolean
}

interface ExtendedStats extends DashboardStats {
  dailyCounts?: DailyCount[]
  weekTotal?: number
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

function KPICard({
  label, value, delta, deltaPositive, color, icon: Icon, loading,
}: {
  label: string
  value: number | string
  delta?: string
  deltaPositive?: boolean
  color: string
  icon: React.ElementType
  loading?: boolean
}) {
  return (
    <div className="ds-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px]"
          style={{ backgroundColor: color + "18" }}
        >
          <Icon className="h-[18px] w-[18px]" style={{ color }} />
        </div>
        {delta && !loading && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={
              deltaPositive
                ? { background: "rgba(22,163,74,0.1)", color: "#16a34a" }
                : { background: "rgba(220,38,38,0.1)", color: "#dc2626" }
            }
          >
            {deltaPositive
              ? <ArrowUpRight className="h-3 w-3" />
              : <ArrowDownRight className="h-3 w-3" />}
            {delta}
          </span>
        )}
        {delta && loading && <Skeleton h={20} w={48} />}
      </div>
      {loading ? (
        <Skeleton h={30} w={72} className="mb-1" />
      ) : (
        <p
          className="text-[28px] font-bold tabular-nums leading-tight mb-1"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          {value}
        </p>
      )}
      <p className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
    </div>
  )
}

function BarChart({ data, loading }: { data: DailyCount[]; loading?: boolean }) {
  const max = Math.max(...data.map((d) => d.count), 1)

  if (loading) {
    const placeholders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Today"]
    return (
      <div className="flex items-end gap-1.5" style={{ height: 80 }}>
        {placeholders.map((d, i) => (
          <div key={d} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full flex-1 flex flex-col justify-end">
              <div
                className="w-full rounded-t animate-pulse"
                style={{ height: `${20 + (i * 12) % 70}%`, background: "var(--card-border)" }}
              />
            </div>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{d}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-end gap-1.5" style={{ height: 80 }}>
      {data.map((d) => {
        const pct = (d.count / max) * 100
        return (
          <div key={d.date} className="group relative flex flex-1 flex-col items-center gap-1">
            <div className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100 z-10">
              <span
                className="whitespace-nowrap rounded px-2 py-1 text-[11px] font-bold text-white"
                style={{ background: "var(--brand-navy)" }}
              >
                {d.count} · {d.shortDate}
              </span>
            </div>
            <div className="w-full flex-1 flex flex-col justify-end">
              <div
                className="w-full rounded-t transition-all duration-500"
                style={{
                  height: `${pct}%`,
                  minHeight: d.count > 0 ? 3 : 0,
                  backgroundColor: d.isToday ? "var(--brand-accent)" : "#0f1e3640",
                }}
              />
            </div>
            <span
              className="text-[10px] font-medium"
              style={{ color: d.isToday ? "var(--brand-accent)" : "var(--text-muted)" }}
            >
              {d.date}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const STATUS_FILTER_TABS = ["All", "New", "Pending", "Sent", "Quoted", "Delivered"]

export default function DashboardPage() {
  const { error: toastError } = useToast()
  const [stats, setStats] = useState<ExtendedStats | null>(null)
  const [recent, setRecent] = useState<FreightRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("All")
  const [search, setSearch] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, reqRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/requests"),
        ])
        if (!statsRes.ok) throw new Error("Failed to load stats")
        if (!reqRes.ok) throw new Error("Failed to load requests")
        const statsData = await statsRes.json()
        const reqData = await reqRes.json()
        setStats(statsData)
        setRecent(Array.isArray(reqData) ? reqData : [])
      } catch (e) {
        toastError("Dashboard failed to load", (e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [toastError])

  const total = stats?.total ?? 0
  const pending = stats?.pending ?? 0
  const sentCount = stats?.sentToCarrier ?? 0
  const quotedCount = stats?.quoted ?? 0
  const weekTotal = stats?.weekTotal ?? 0
  const dailyCounts = stats?.dailyCounts ?? []
  const pendingRfqCount = stats?.pendingRfqCount ?? 0

  const filteredRecent = useMemo(() => {
    let rows = recent
    if (activeTab !== "All") {
      rows = rows.filter((r) => {
        const s = r.status?.toLowerCase() ?? ""
        const t = activeTab.toLowerCase()
        if (t === "sent") return s.includes("sent") || s.includes("carrier")
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
    return rows.slice(0, 8)
  }, [recent, activeTab, search])

  const now = new Date()
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  return (
    <div className="portal-page p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            className="text-[22px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
          >
            {greeting()}, {currentUser.name.split(" ")[0]}
          </h2>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {monthLabel} · All active and recent freight
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="flex items-center gap-1.5 rounded-[7px] border px-3 py-[7px] text-[12.5px] font-medium transition-colors"
            style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)", background: "var(--card-bg)" }}
          >
            <Calendar className="h-3.5 w-3.5" />
            This month
          </button>
          <button
            className="flex items-center gap-1.5 rounded-[7px] border px-3 py-[7px] text-[12.5px] font-medium transition-colors"
            style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)", background: "var(--card-bg)" }}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* KPI Row — 4 tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          loading={loading}
          label="Total Requests"
          value={total}
          delta={stats?.todayDelta ?? undefined}
          deltaPositive
          color="#E8821A"
          icon={Inbox}
        />
        <KPICard
          loading={loading}
          label="Pending Action"
          value={pending}
          delta={pending > 0 ? "Needs attention" : undefined}
          deltaPositive={false}
          color="#dc2626"
          icon={Clock}
        />
        <KPICard
          loading={loading}
          label="Sent to Carrier"
          value={sentCount}
          color="#3b82f6"
          icon={Send}
        />
        <KPICard
          loading={loading}
          label="Quoted"
          value={quotedCount}
          delta={quotedCount > 0 ? "Ready to close" : undefined}
          deltaPositive
          color="#16a34a"
          icon={TrendingUp}
        />
      </div>

      {/* Main grid: table left, sidebar right */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        {/* Freight Requests table card */}
        <div className="ds-card overflow-hidden">
          <div className="ds-card-header">
            <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Freight Requests
            </span>
            <div className="flex items-center gap-2">
              {/* Filter tabs */}
              <div
                className="flex gap-0.5 rounded-[6px] p-0.5"
                style={{ background: "var(--page-bg)" }}
              >
                {STATUS_FILTER_TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="rounded-[4px] px-2.5 py-1 text-[12px] font-medium border-none cursor-pointer transition-all"
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
                  <th>Cargo</th>
                  <th>Status</th>
                  <th>Received</th>
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
                      <td><Skeleton h={14} w={70} /></td>
                      <td><Skeleton h={20} w={72} /></td>
                      <td><Skeleton h={12} w={60} /></td>
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
                        <div className="font-semibold tabular-nums text-[13px]" style={{ color: "var(--text-primary)" }}>
                          {r.id?.toString().padStart(4, "0") ? `LT-${r.id}` : r.id}
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
                      <td>
                        <div className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                          {r.cargoType}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>
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
              {loading ? "Loading…" : `Showing ${filteredRecent.length} of ${total} requests`}
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
          {/* Weekly volume chart */}
          <div className="ds-card">
            <div className="ds-card-header">
              <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Weekly Volume
              </span>
              {!loading && (
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "rgba(232,130,26,0.1)", color: "var(--brand-accent)" }}
                >
                  {weekTotal} this week
                </span>
              )}
              {loading && <Skeleton h={22} w={80} />}
            </div>
            <div className="p-4">
              <BarChart data={dailyCounts} loading={loading} />
            </div>
          </div>

          {/* Pipeline */}
          <div className="ds-card">
            <div className="ds-card-header">
              <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Pipeline
              </span>
            </div>
            <div className="p-4 space-y-3.5">
              {loading ? (
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <Skeleton h={11} w={80} />
                      <Skeleton h={11} w={32} />
                    </div>
                    <Skeleton h={6} />
                  </div>
                ))
              ) : (
                [
                  { stage: "Received", count: total, color: "#64748b" },
                  { stage: "Pending", count: pending, color: "#E8821A" },
                  { stage: "Sent to Carrier", count: sentCount, color: "#3b82f6" },
                  { stage: "Quoted", count: quotedCount, color: "#16a34a" },
                ].map((p) => {
                  const pct = total ? Math.round((p.count / total) * 100) : 0
                  return (
                    <div key={p.stage}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                          {p.stage}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold tabular-nums" style={{ color: p.color }}>{pct}%</span>
                          <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{p.count}</span>
                        </div>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--divider)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: p.color }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
