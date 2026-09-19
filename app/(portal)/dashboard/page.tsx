"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ArrowUpRight,
  Clock,
  Inbox,
  Mail,
  MessageCircle,
  Send,
  TrendingUp,
  Zap,
  Mic,
} from "lucide-react"
import { SourceBadge, StatusBadge } from "@/components/portal/badges"
import { type FreightRequest } from "@/lib/portal-data"
import { fetchRequests, fetchDashboardStats, subscribeToRequests, type DashboardStats } from "@/lib/supabase-queries"
import { createClient } from "@/lib/supabase"

// ─── Period helpers ────────────────────────────────────────────────────────

type Period = "Today" | "Yesterday" | "This Week" | "This Month"
const periods: Period[] = ["Today", "Yesterday", "This Week", "This Month"]

function periodBounds(period: Period): { from: Date; to: Date } {
  const now  = new Date()
  const sod  = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x }

  if (period === "Today") {
    return { from: sod(now), to: now }
  }
  if (period === "Yesterday") {
    const y = sod(now); y.setDate(y.getDate() - 1)
    const e = new Date(y); e.setHours(23,59,59,999)
    return { from: y, to: e }
  }
  if (period === "This Week") {
    const w = sod(now)
    w.setDate(w.getDate() - ((w.getDay() + 6) % 7)) // Monday
    return { from: w, to: now }
  }
  // This Month
  const m = sod(now); m.setDate(1)
  return { from: m, to: now }
}

function inPeriod(isoDate: string, period: Period): boolean {
  const d = new Date(isoDate)
  const { from, to } = periodBounds(period)
  return d >= from && d <= to
}

// ─── Weekly chart data from requests ──────────────────────────────────────

function buildWeekActivity(requests: FreightRequest[]): { day: string; count: number }[] {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const today = new Date(); today.setHours(0,0,0,0)
  const todayDay = today.getDay() // 0=Sun … 6=Sat
  const mondayOffset = (todayDay + 6) % 7  // days since Mon

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (mondayOffset - i))
    const nextD = new Date(d); nextD.setDate(d.getDate() + 1)
    const count = requests.filter(r => {
      const rd = new Date(r.receivedIso)
      return rd >= d && rd < nextD
    }).length
    const label = i === mondayOffset ? "Today" : days[i]
    return { day: label, count }
  })
}

// ─── Activity feed from requests ──────────────────────────────────────────

function requestToActivity(r: FreightRequest) {
  const sourceType = r.source === "WhatsApp" ? "whatsapp"
                   : r.source === "Voice Note" ? "ai"
                   : "email"
  const label = r.source === "Voice Note"
    ? `Voice note parsed from ${r.senderName}`
    : r.source === "WhatsApp"
    ? `WhatsApp inquiry — ${r.senderName}`
    : `Rate request from ${r.senderName}`

  const sub = `${r.originCity} → ${r.destinationCity} · ${r.cargoType} · ${r.equipment}`

  return { time: r.receivedExact.replace("Today, ", ""), label, sub, type: sourceType }
}

// ─── Greeting ─────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

// ─── Sub-components ───────────────────────────────────────────────────────

const GLOW = "transition-all duration-200 hover:shadow-[0_0_0_2px_rgba(249,115,22,0.18),0_4px_18px_rgba(249,115,22,0.09)] hover:border-[rgba(249,115,22,0.30)]"

function KPICard({
  label,
  value,
  sub,
  trend,
  color,
  icon: Icon,
}: {
  label: string
  value: number | string
  sub: string
  trend?: "up"
  color: string
  icon: React.ElementType
}) {
  return (
    <div className={`relative overflow-hidden rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33] ${GLOW}`}>
      {/* Top accent bar */}
      <div className="absolute left-0 right-0 top-0 h-[3px]" style={{ backgroundColor: color }} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748B] dark:text-[#475569]">
              {label}
            </p>
            <p
              className="mt-2 text-[2.75rem] font-black leading-none tabular-nums text-[#0D1B2A] dark:text-[#E2E8F0]"
              style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
            >
              {value}
            </p>
            <p
              className={`mt-1.5 flex items-center gap-0.5 text-xs font-medium ${
                trend === "up" ? "text-emerald-500" : "text-[#64748B] dark:text-[#475569]"
              }`}
            >
              {trend === "up" && <ArrowUpRight className="h-3.5 w-3.5" />}
              {sub}
            </p>
          </div>
          <div className="shrink-0 rounded p-2.5" style={{ backgroundColor: color + "1a" }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function BarChart({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className="flex items-end gap-2" style={{ height: 120 }}>
      {data.map((d) => {
        const pct     = (d.count / max) * 100
        const isToday = d.day === "Today"
        return (
          <div key={d.day} className="group relative flex flex-1 flex-col items-center gap-1.5">
            {/* Hover tooltip */}
            <div className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="whitespace-nowrap rounded bg-[#0D1B2A] px-2 py-1 text-[11px] font-bold text-white dark:bg-[#E2E8F0] dark:text-[#0D1B2A]">
                {d.count} req
              </span>
            </div>
            {/* Bar */}
            <div className="w-full flex-1 flex flex-col justify-end">
              <div
                className={`w-full rounded-t transition-all duration-500 ${isToday ? "" : "bg-[#CBD5E1] dark:bg-[#1E3A5F]"}`}
                style={{
                  height: `${pct}%`,
                  minHeight: d.count > 0 ? 4 : 0,
                  ...(isToday ? { backgroundColor: "#F97316" } : {}),
                }}
              />
            </div>
            {/* Day label */}
            <span className={`text-[10px] font-semibold ${isToday ? "text-[#F97316]" : "text-[#94A3B8] dark:text-[#475569]"}`}>
              {d.day}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ActivityDot({ type }: { type: string }) {
  const map: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    email:    { bg: "bg-blue-100 dark:bg-blue-900/30",    text: "text-blue-500",    icon: Mail },
    whatsapp: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-500", icon: MessageCircle },
    ai:       { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-500",  icon: Zap },
    sent:     { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-500",  icon: Send },
    voice:    { bg: "bg-pink-100 dark:bg-pink-900/30",    text: "text-pink-500",    icon: Mic },
  }
  const s = map[type] ?? map.email
  const Icon = s.icon
  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${s.bg}`}>
      <Icon className={`h-3.5 w-3.5 ${s.text}`} />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [period, setPeriod]     = useState<Period>("Today")
  const [stats, setStats]       = useState<DashboardStats | null>(null)
  const [allRequests, setAllRequests] = useState<FreightRequest[]>([])
  const [username, setUsername] = useState<string>("")

  // Read username from sessionStorage
  useEffect(() => {
    try { setUsername(sessionStorage.getItem("portal_username") ?? "") } catch { /* ok */ }
  }, [])

  // Fetch data + subscribe to realtime
  useEffect(() => {
    const supabase = createClient()
    const clientCode = (() => { try { return sessionStorage.getItem("portal_client_code") ?? "" } catch { return "" } })()
    fetchDashboardStats(supabase, clientCode).then(setStats)
    fetchRequests(supabase, clientCode).then(setAllRequests)

    const unsub = subscribeToRequests(
      supabase,
      (newRow) => {
        setAllRequests((prev) => [newRow, ...prev])
        // Bump stats optimistically
        setStats((prev) => prev
          ? {
              ...prev,
              total: prev.total + 1,
              pending: newRow.status === "Pending" ? prev.pending + 1 : prev.pending,
              email:   newRow.source === "Email"   ? prev.email   + 1 : prev.email,
              whatsapp:newRow.source === "WhatsApp"? prev.whatsapp+ 1 : prev.whatsapp,
            }
          : prev,
        )
      },
      (updRow) => {
        setAllRequests((prev) => prev.map((r) => r.id === updRow.id ? updRow : r))
      },
      clientCode,
    )

    return unsub
  }, [])

  // Period-filtered views
  const filtered   = allRequests.filter((r) => inPeriod(r.receivedIso, period))
  const recentList = filtered.slice(0, 6)
  const activities = allRequests.slice(0, 6).map(requestToActivity)

  // KPIs — respect selected period for counts
  const periodTotal   = filtered.length
  const periodPending = filtered.filter((r) => r.status === "Pending").length
  const periodSent    = filtered.filter((r) => r.status === "Sent to Carrier").length
  const periodQuoted  = filtered.filter((r) => r.status === "Quoted").length

  // For all-time pipeline (pipeline funnel always shows full picture)
  const totalAll    = stats?.total         ?? 0
  const pendingAll  = stats?.pending       ?? 0
  const sentAll     = stats?.sentToCarrier ?? 0
  const quotedAll   = stats?.quoted        ?? 0

  const pipeline = [
    { stage: "Received",        count: totalAll,   color: "#475569" },
    { stage: "Pending",         count: pendingAll,  color: "#F97316" },
    { stage: "Sent to Carrier", count: sentAll,     color: "#3B82F6" },
    { stage: "Quoted",          count: quotedAll,   color: "#22C55E" },
  ]

  const weekData  = buildWeekActivity(allRequests)
  const weekTotal = weekData.reduce((s, d) => s + d.count, 0)

  const kpiSub = period === "Today" ? (stats?.todayDelta ?? "Loading…") : `${periodTotal} requests`

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight text-[#0D1B2A] dark:text-[#E2E8F0]"
            style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
          >
            {greeting()}{username ? `, ${username}` : ""}
          </h2>
          <p className="mt-0.5 text-sm text-[#64748B] dark:text-[#475569]">
            Here's what's happening with your freight operations.
          </p>
        </div>
        {/* Period selector */}
        <div className="flex flex-wrap gap-1.5">
          {periods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                period === p
                  ? "bg-[#F97316] text-white"
                  : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#F97316]/40 dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#94A3B8]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KPICard
          label="Total Requests"
          value={periodTotal}
          sub={kpiSub}
          trend="up"
          color="#F97316"
          icon={Inbox}
        />
        <KPICard
          label="Pending Action"
          value={periodPending}
          sub="Awaiting carrier outreach"
          color="#F97316"
          icon={Clock}
        />
        <KPICard
          label="Sent to Carrier"
          value={periodSent}
          sub="Awaiting quotes"
          color="#3B82F6"
          icon={Send}
        />
        <KPICard
          label="Quoted"
          value={periodQuoted}
          sub="Ready to close"
          color="#22C55E"
          icon={TrendingUp}
        />
      </div>

      {/* ── Chart + Pipeline ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Bar chart */}
        <div className={`rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33] lg:col-span-3 ${GLOW}`}>
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
            <div>
              <h3 className="font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">Weekly Activity</h3>
              <p className="text-xs text-[#64748B] dark:text-[#475569]">Requests received per day</p>
            </div>
            <span className="rounded bg-[#FFF7ED] px-2.5 py-1 text-xs font-semibold text-[#F97316] dark:bg-[#F97316]/10">
              {weekTotal} total this week
            </span>
          </div>
          <div className="p-5">
            <BarChart data={weekData} />
          </div>
        </div>

        {/* Pipeline funnel */}
        <div className={`rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33] lg:col-span-2 ${GLOW}`}>
          <div className="border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
            <h3 className="font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">Request Pipeline</h3>
            <p className="text-xs text-[#64748B] dark:text-[#475569]">All-time conversion through stages</p>
          </div>
          <div className="space-y-4 p-5">
            {pipeline.map((p) => {
              const pct = pipeline[0].count > 0 ? Math.round((p.count / pipeline[0].count) * 100) : 0
              return (
                <div key={p.stage}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#475569] dark:text-[#64748B]">
                      {p.stage}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: p.color }}>
                        {pct}%
                      </span>
                      <span className="text-sm font-black tabular-nums text-[#0D1B2A] dark:text-[#E2E8F0]">
                        {p.count}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-[#1E3A5F]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: p.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Activity + Recent Requests ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Activity feed */}
        <div className={`rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33] lg:col-span-2 ${GLOW}`}>
          <div className="border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
            <h3 className="font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">Activity Feed</h3>
            <p className="text-xs text-[#64748B] dark:text-[#475569]">Latest events from your requests</p>
          </div>
          {activities.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[#94A3B8]">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-[#F1F5F9] dark:divide-[#1A2A40]">
              {activities.map((a, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3">
                  <ActivityDot type={a.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">{a.label}</p>
                    <p className="truncate text-xs text-[#64748B] dark:text-[#94A3B8]">{a.sub}</p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-[#94A3B8] dark:text-[#475569]">
                    {a.time}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent requests */}
        <div className={`rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33] lg:col-span-3 ${GLOW}`}>
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
            <div>
              <h3 className="font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">Recent Requests</h3>
              <p className="text-xs text-[#64748B] dark:text-[#475569]">
                {period === "Today" ? "Today's incoming enquiries" : `${period} incoming enquiries`}
              </p>
            </div>
            <Link href="/requests" className="text-xs font-semibold text-[#F97316] hover:underline">
              View All →
            </Link>
          </div>
          {recentList.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[#94A3B8]">
              No requests in this period.
            </p>
          ) : (
            <ul className="divide-y divide-[#F1F5F9] dark:divide-[#1A2A40]">
              {recentList.map((r) => (
                <li key={r.id}>
                  <Link
                    href="/requests"
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#FFF7ED] dark:hover:bg-[#1A2A40]"
                  >
                    <SourceBadge source={r.source} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">
                        {r.senderName}
                      </p>
                      <p className="truncate text-xs text-[#64748B] dark:text-[#94A3B8]">
                        {r.originCity} → {r.destinationCity} ·{" "}
                        <span className="font-medium">{r.cargoType}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={r.status} />
                      <span className="text-[11px] tabular-nums text-[#94A3B8] dark:text-[#475569]">
                        {r.receivedRelative}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
