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
  MoreHorizontal,
  Search,
  DollarSign,
  PackageCheck,
} from "lucide-react"
import { SourceBadge, StatusBadge } from "@/components/portal/badges"
import { type FreightRequest } from "@/lib/portal-data"
import { type DashboardStats, formatRelative } from "@/lib/supabase-queries"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"

interface MonthlyCount {
  month: string
  shipments: number
  delivered: number
  isCurrent: boolean
}

interface ExtendedStats extends DashboardStats {
  monthlyCounts?: MonthlyCount[]
}

interface ActivityItem {
  id: number
  description: string
  created_at: string
  event_type: string
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

function MonthlyBarChart({ data, loading }: { data: MonthlyCount[]; loading?: boolean }) {
  const max = Math.max(...data.map((d) => Math.max(d.shipments, d.delivered)), 1)

  if (loading || data.length === 0) {
    const placeholders = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"]
    return (
      <div className="flex items-end gap-1.5" style={{ height: 76 }}>
        {placeholders.map((m, i) => (
          <div key={m} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full flex-1 flex flex-col justify-end">
              <div
                className="w-full rounded-t animate-pulse"
                style={{ height: `${20 + (i * 12) % 70}%`, background: "var(--card-border)" }}
              />
            </div>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{m}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-end gap-1.5" style={{ height: 76 }}>
      {data.map((d) => {
        const pShips = (d.shipments / max) * 100
        const pDel = (d.delivered / max) * 100
        return (
          <div key={d.month} className="group relative flex flex-1 gap-[3px] items-end">
            <div
              className="flex-1 rounded-t transition-all duration-500"
              style={{ height: `${pShips}%`, minHeight: d.shipments > 0 ? 3 : 0, background: "var(--brand-navy)", opacity: 0.8 }}
              title={`${d.shipments} shipments`}
            />
            <div
              className="flex-1 rounded-t transition-all duration-500"
              style={{ height: `${pDel}%`, minHeight: d.delivered > 0 ? 3 : 0, background: "var(--brand-accent)" }}
              title={`${d.delivered} delivered`}
            />
            <span
              className="absolute -bottom-[18px] left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap"
              style={{ color: d.isCurrent ? "var(--brand-accent)" : "var(--text-muted)" }}
            >
              {d.month}
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
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("All")
  const [search, setSearch] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, reqRes, activityRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/requests"),
          fetch("/api/activity?limit=5"),
        ])
        if (!statsRes.ok) throw new Error("Failed to load stats")
        if (!reqRes.ok) throw new Error("Failed to load requests")
        const statsData = await statsRes.json()
        const reqData = await reqRes.json()
        setStats(statsData)
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
  }, [toastError])

  const total = stats?.total ?? 0
  const pending = stats?.pending ?? 0
  const active = stats?.active ?? 0
  const deliveredThisMonth = stats?.deliveredThisMonth ?? 0
  const revenueThisMonthLabel = stats?.revenueThisMonthLabel ?? "$0"
  const monthlyCounts = stats?.monthlyCounts ?? []

  const filteredRecent = useMemo(() => {
    let rows = recent
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
    return rows.slice(0, 8)
  }, [recent, activeTab, search])

  const now = new Date()
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const dateRangeLabel = `${monthStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${monthEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`

  return (
    <div className="portal-page p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            className="text-[22px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
          >
            Shipment Overview
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
            {dateRangeLabel}
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
          label="Active Shipments"
          value={active}
          delta={stats?.todayDelta ?? undefined}
          deltaPositive
          color="#E8821A"
          icon={Inbox}
        />
        <KPICard
          loading={loading}
          label="Pending Quotes"
          value={pending}
          delta={pending > 0 ? "Needs attention" : undefined}
          deltaPositive={false}
          color="#dc2626"
          icon={Clock}
        />
        <KPICard
          loading={loading}
          label="Delivered This Month"
          value={deliveredThisMonth}
          color="#16a34a"
          icon={PackageCheck}
        />
        <KPICard
          loading={loading}
          label="Revenue This Month"
          value={revenueThisMonthLabel}
          color="#7c3aed"
          icon={DollarSign}
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
                        <div className="font-semibold tabular-nums text-[13px] font-mono" style={{ color: "var(--text-primary)" }}>
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
          {/* Monthly volume chart */}
          <div className="ds-card">
            <div className="ds-card-header">
              <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Monthly Volume
              </span>
            </div>
            <div className="px-5 pt-3.5 pb-2">
              <div className="flex gap-4 mb-3">
                <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--brand-navy)", opacity: 0.8 }} />
                  Shipments
                </span>
                <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--brand-accent)" }} />
                  Delivered
                </span>
              </div>
              <MonthlyBarChart data={monthlyCounts} loading={loading} />
            </div>
          </div>

          {/* Recent Activity */}
          <div className="ds-card">
            <div className="ds-card-header">
              <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Recent Activity
              </span>
              <Link
                href="/activity"
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
                    className="flex gap-2.5 px-5 py-2.5 items-start"
                    style={{ borderBottom: "1px solid var(--divider)" }}
                  >
                    <div
                      className="h-2 w-2 rounded-full mt-[5px] shrink-0"
                      style={{ background: "var(--brand-accent)" }}
                    />
                    <div>
                      <div className="text-[12.5px] leading-[1.45]" style={{ color: "var(--text-primary)" }}>
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
    </div>
  )
}
