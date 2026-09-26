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
  label, value, sub, trend, color, icon: Icon, loading,
}: {
  label: string; value: number | string; sub: string
  trend?: "up"; color: string; icon: React.ElementType; loading?: boolean
}) {
  return (
    <div className="ds-card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px]"
          style={{ backgroundColor: color + "18" }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        {trend === "up" && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
            <ArrowUpRight className="h-3 w-3" />
            {loading ? "…" : sub}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton h={32} w={64} className="mb-1" />
      ) : (
        <p className="text-[28px] font-bold tabular-nums leading-tight mb-1" style={{ color: 'var(--text-primary)', letterSpacing: "-0.02em" }}>{value}</p>
      )}
      <p className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      {trend !== "up" && (
        <p className="mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{loading ? "…" : sub}</p>
      )}
    </div>
  )
}

function BarChart({ data, loading }: { data: DailyCount[]; loading?: boolean }) {
  const max = Math.max(...data.map((d) => d.count), 1)

  if (loading) {
    const placeholders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Today"]
    return (
      <div className="flex items-end gap-2" style={{ height: 120 }}>
        {placeholders.map((d, i) => (
          <div key={d} className="group relative flex flex-1 flex-col items-center gap-1.5">
            <div className="w-full flex-1 flex flex-col justify-end">
              <div className="w-full rounded-t animate-pulse" style={{ height: `${20 + (i * 12) % 70}%`, background: 'var(--card-border)' }} />
            </div>
            <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>{d}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2" style={{ height: 120 }}>
      {data.map((d) => {
        const pct = (d.count / max) * 100
        return (
          <div key={d.date} className="group relative flex flex-1 flex-col items-center gap-1.5">
            <div className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100 z-10">
              <span className="whitespace-nowrap rounded px-2 py-1 text-[11px] font-bold text-white" style={{ background: 'var(--brand-navy)' }}>
                {d.count} req · {d.shortDate}
              </span>
            </div>
            <div className="w-full flex-1 flex flex-col justify-end">
              <div
                className="w-full rounded-t transition-all duration-500"
                style={{
                  height: `${pct}%`,
                  minHeight: d.count > 0 ? 4 : 0,
                  backgroundColor: d.isToday ? 'var(--brand-accent)' : 'var(--card-border)',
                }}
              />
            </div>
            <span className="text-[10px] font-semibold" style={{ color: d.isToday ? 'var(--brand-accent)' : 'var(--text-muted)' }}>
              {d.date}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ActivityDot({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string; icon: React.ElementType }> = {
    email:    { bg: "rgba(59,130,246,0.12)",  color: "#3b82f6", icon: Mail },
    whatsapp: { bg: "rgba(34,197,94,0.12)",   color: "#22c55e", icon: MessageCircle },
    ai:       { bg: "rgba(139,92,246,0.12)",  color: "#8b5cf6", icon: Zap },
    sent:     { bg: "rgba(232,130,26,0.12)",  color: "var(--brand-accent)", icon: Send },
  }
  const s = map[type] ?? map.email
  const Icon = s.icon
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: s.bg }}>
      <Icon className="h-3.5 w-3.5" style={{ color: s.color }} />
    </div>
  )
}

export default function DashboardPage() {
  const { error: toastError } = useToast()
  const [stats, setStats]   = useState<ExtendedStats | null>(null)
  const [recent, setRecent] = useState<FreightRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, reqRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/requests"),
        ])
        if (!statsRes.ok) throw new Error("Failed to load stats")
        if (!reqRes.ok)   throw new Error("Failed to load requests")
        const statsData = await statsRes.json()
        const reqData   = await reqRes.json()
        setStats(statsData)
        setRecent(Array.isArray(reqData) ? reqData.slice(0, 5) : [])
      } catch (e) {
        toastError("Dashboard failed to load", (e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [toastError])

  const total           = stats?.total            ?? 0
  const pending         = stats?.pending          ?? 0
  const sentCount       = stats?.sentToCarrier    ?? 0
  const quotedCount     = stats?.quoted           ?? 0
  const weekTotal       = stats?.weekTotal        ?? 0
  const dailyCounts     = stats?.dailyCounts      ?? []
  const pendingRfqCount = stats?.pendingRfqCount  ?? 0

  const pipeline = [
    { stage: "Received",        count: total,       color: "#64748b" },
    { stage: "Pending",         count: pending,     color: "#E8821A" },
    { stage: "Sent to Carrier", count: sentCount,   color: "#3b82f6" },
    { stage: "Quoted",          count: quotedCount, color: "#22c55e" },
  ]

  return (
    <div className="portal-page space-y-5 p-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
            {greeting()}, {currentUser.name.split(" ")[0]}
          </h2>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Here&apos;s what&apos;s happening with your freight operations.
          </p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <KPICard loading={loading} label="Total Requests"         value={total}            sub={stats?.todayDelta ?? "—"} trend="up" color="#E8821A" icon={Inbox}      />
        <KPICard loading={loading} label="Pending Action"         value={pending}          sub="Awaiting carrier outreach"            color="#E8821A" icon={Clock}      />
        <KPICard loading={loading} label="Sent to Carrier"        value={sentCount}        sub="Awaiting quotes"                      color="#3b82f6" icon={Send}       />
        <KPICard loading={loading} label="Awaiting Carrier Reply" value={pendingRfqCount}  sub="RFQs with no response yet"            color="#8b5cf6" icon={Truck}      />
        <KPICard loading={loading} label="Quoted"                 value={quotedCount}      sub="Ready to close"                       color="#22c55e" icon={TrendingUp} />
      </div>

      {/* Chart + Pipeline */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Weekly bar chart */}
        <div className="ds-card lg:col-span-3">
          <div className="ds-card-header">
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Weekly Activity</h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Requests received — last 7 days</p>
            </div>
            {!loading && (
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(232,130,26,0.1)', color: 'var(--brand-accent)' }}>
                {weekTotal} this week
              </span>
            )}
            {loading && <Skeleton h={24} w={96} />}
          </div>
          <div className="p-5">
            <BarChart data={dailyCounts} loading={loading} />
          </div>
        </div>

        {/* Request Pipeline */}
        <div className="ds-card lg:col-span-2">
          <div className="ds-card-header">
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Request Pipeline</h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Conversion through stages</p>
            </div>
          </div>
          <div className="space-y-4 p-5">
            {loading ? (
              <>{[1,2,3,4].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between"><Skeleton h={12} w={100} /><Skeleton h={12} w={40} /></div>
                  <Skeleton h={8} />
                </div>
              ))}</>
            ) : (
              pipeline.map((p) => {
                const pct = pipeline[0].count ? Math.round((p.count / pipeline[0].count) * 100) : 0
                return (
                  <div key={p.stage}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{p.stage}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: p.color }}>{pct}%</span>
                        <span className="text-sm font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{p.count}</span>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--divider)' }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Recent Requests */}
      <div className="ds-card">
        <div className="ds-card-header">
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Requests</h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Latest incoming freight enquiries</p>
          </div>
          <Link href="/requests" className="text-xs font-semibold hover:underline" style={{ color: 'var(--brand-accent)' }}>
            View All →
          </Link>
        </div>
        {loading ? (
          <div>
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: '1px solid var(--divider)' }}>
                <Skeleton h={22} w={56} />
                <div className="min-w-0 flex-1 space-y-1.5"><Skeleton h={14} w="55%" /><Skeleton h={12} w="75%" /></div>
                <Skeleton h={20} w={72} />
              </div>
            ))}
          </div>
        ) : (
          <ul>
            {recent.length === 0 ? (
              <li className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No requests yet.</li>
            ) : (
              recent.map((r) => (
                <li key={r.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                  <Link
                    href="/requests"
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors"
                    style={{ color: 'inherit' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    <SourceBadge source={r.source} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.senderName}</p>
                      <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {r.originCity} → {r.destinationCity} · <span className="font-medium">{r.cargoType}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={r.status} />
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{r.receivedRelative}</span>
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
