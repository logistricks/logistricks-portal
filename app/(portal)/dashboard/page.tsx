"use client"

/**
 * app/(portal)/dashboard/page.tsx
 *
 * Fetches stats and recent requests from server-side API routes.
 * No direct Supabase calls — data comes via /api/stats and /api/requests,
 * which use the service role key and read clientCode from the session cookie.
 */
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
} from "lucide-react"
import { SourceBadge, StatusBadge } from "@/components/portal/badges"
import { currentUser } from "@/lib/portal-data"
import { type FreightRequest } from "@/lib/portal-data"
import { type DashboardStats } from "@/lib/supabase-queries"

// ─── Static data ──────────────────────────────────────────────────────────────

const periods = ["Today", "Yesterday", "This Week", "This Month"]

const weekActivity = [
  { day: "Mon", count: 3 },
  { day: "Tue", count: 5 },
  { day: "Wed", count: 4 },
  { day: "Thu", count: 8 },
  { day: "Fri", count: 6 },
  { day: "Sat", count: 2 },
  { day: "Today", count: 5 },
]

const activities = [
  { time: "09:06 AM", label: "Voice note parsed from Yousef Haddad",   sub: "Shanghai → Aqaba · Furniture · 40ft HC",      type: "ai"      },
  { time: "08:12 AM", label: "Rate request from Fadi Tamimi",           sub: "Amman → Dubai · Electronics · 2×40ft HC",    type: "email"   },
  { time: "06:40 AM", label: "WhatsApp inquiry — Gulf Cargo Co",        sub: "Aqaba → Fremantle · Spices · 20ft",          type: "whatsapp"},
  { time: "Yest. 4:05 PM", label: "Sent to Air Arabia Cargo",          sub: "DEL → Amman · Aircraft Engine · Urgent",     type: "sent"    },
  { time: "Yest. 3:20 PM", label: "Urgent air freight from Rania Khalil", sub: "Delhi → Amman · 2 engines · DGR",         type: "email"   },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, trend, color, icon: Icon,
}: {
  label: string; value: number | string; sub: string
  trend?: "up"; color: string; icon: React.ElementType
}) {
  return (
    <div className="relative overflow-hidden rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33]">
      <div className="absolute left-0 right-0 top-0 h-[3px]" style={{ backgroundColor: color }} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748B] dark:text-[#475569]">{label}</p>
            <p className="mt-2 text-[2.75rem] font-black leading-none tabular-nums text-[#0D1B2A] dark:text-[#E2E8F0]"
               style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>{value}</p>
            <p className={`mt-1.5 flex items-center gap-0.5 text-xs font-medium ${trend === "up" ? "text-emerald-500" : "text-[#64748B] dark:text-[#475569]"}`}>
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
        const pct = (d.count / max) * 100
        const isToday = d.day === "Today"
        return (
          <div key={d.day} className="group relative flex flex-1 flex-col items-center gap-1.5">
            <div className="pointer-events-none absolute bottom-full mb-2 flex -translate-x-1/2 left-1/2 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="whitespace-nowrap rounded bg-[#0D1B2A] px-2 py-1 text-[11px] font-bold text-white dark:bg-[#E2E8F0] dark:text-[#0D1B2A]">
                {d.count} req
              </span>
            </div>
            <div className="w-full flex-1 flex flex-col justify-end">
              <div className={`w-full rounded-t transition-all duration-500 ${isToday ? "" : "bg-[#CBD5E1] dark:bg-[#1E3A5F]"}`}
                style={{ height: `${pct}%`, minHeight: d.count > 0 ? 4 : 0, ...(isToday ? { backgroundColor: "#F97316" } : {}) }} />
            </div>
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
    email:    { bg: "bg-blue-100 dark:bg-blue-900/30",    text: "text-blue-500",    icon: Mail          },
    whatsapp: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-500", icon: MessageCircle },
    ai:       { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-500", icon: Zap            },
    sent:     { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-500", icon: Send           },
  }
  const s = map[type] ?? map.email
  const Icon = s.icon
  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${s.bg}`}>
      <Icon className={`h-3.5 w-3.5 ${s.text}`} />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [period, setPeriod] = useState("Today")
  const [stats, setStats]   = useState<DashboardStats | null>(null)
  const [recent, setRecent] = useState<FreightRequest[]>([])

  useEffect(() => {
    // Fetch stats and recent requests from server-side API routes.
    // The cookie is sent automatically — no clientCode needed client-side.
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})

    fetch("/api/requests")
      .then((r) => r.json())
      .then((rows: FreightRequest[]) => setRecent(Array.isArray(rows) ? rows.slice(0, 5) : []))
      .catch(() => {})
  }, [])

  const total       = stats?.total         ?? 0
  const pending     = stats?.pending       ?? 0
  const sentCount   = stats?.sentToCarrier ?? 0
  const quotedCount = stats?.quoted        ?? 0

  const pipeline = [
    { stage: "Received",        count: total,       color: "#475569" },
    { stage: "Pending",         count: pending,     color: "#F97316" },
    { stage: "Sent to Carrier", count: sentCount,   color: "#3B82F6" },
    { stage: "Quoted",          count: quotedCount, color: "#22C55E" },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0D1B2A] dark:text-[#E2E8F0]"
              style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
            {greeting()}, {currentUser.name.split(" ")[0]}
          </h2>
          <p className="mt-0.5 text-sm text-[#64748B] dark:text-[#475569]">
            Here&apos;s what&apos;s happening with your freight operations.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {periods.map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={`rounded px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                period === p
                  ? "bg-[#F97316] text-white"
                  : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#F97316]/40 dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#94A3B8]"
              }`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KPICard label="Total Requests"  value={total}       sub={stats?.todayDelta ?? "Loading…"} trend="up" color="#F97316" icon={Inbox}     />
        <KPICard label="Pending Action"  value={pending}     sub="Awaiting carrier outreach"                  color="#F97316" icon={Clock}     />
        <KPICard label="Sent to Carrier" value={sentCount}   sub="Awaiting quotes"                            color="#3B82F6" icon={Send}      />
        <KPICard label="Quoted"          value={quotedCount} sub="Ready to close"                             color="#22C55E" icon={TrendingUp} />
      </div>

      {/* Chart + Pipeline */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33] lg:col-span-3">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
            <div>
              <h3 className="font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">Weekly Activity</h3>
              <p className="text-xs text-[#64748B] dark:text-[#475569]">Requests received per day</p>
            </div>
            <span className="rounded bg-[#FFF7ED] px-2.5 py-1 text-xs font-semibold text-[#F97316] dark:bg-[#F97316]/10">
              33 total this week
            </span>
          </div>
          <div className="p-5"><BarChart data={weekActivity} /></div>
        </div>

        <div className="rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33] lg:col-span-2">
          <div className="border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
            <h3 className="font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">Request Pipeline</h3>
            <p className="text-xs text-[#64748B] dark:text-[#475569]">Conversion through stages</p>
          </div>
          <div className="space-y-4 p-5">
            {pipeline.map((p) => {
              const pct = pipeline[0].count ? Math.round((p.count / pipeline[0].count) * 100) : 0
              return (
                <div key={p.stage}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#475569] dark:text-[#64748B]">{p.stage}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: p.color }}>{pct}%</span>
                      <span className="text-sm font-black tabular-nums text-[#0D1B2A] dark:text-[#E2E8F0]">{p.count}</span>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-[#1E3A5F]">
                    <div className="h-full rounded-full transition-all duration-500"
                         style={{ width: `${pct}%`, backgroundColor: p.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Activity + Recent Requests */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33] lg:col-span-2">
          <div className="border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
            <h3 className="font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">Activity Feed</h3>
            <p className="text-xs text-[#64748B] dark:text-[#475569]">Latest events — today &amp; yesterday</p>
          </div>
          <ul className="divide-y divide-[#F1F5F9] dark:divide-[#1A2A40]">
            {activities.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3">
                <ActivityDot type={a.type} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">{a.label}</p>
                  <p className="truncate text-xs text-[#64748B] dark:text-[#94A3B8]">{a.sub}</p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-[#94A3B8] dark:text-[#475569]">{a.time}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33] lg:col-span-3">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
            <div>
              <h3 className="font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">Recent Requests</h3>
              <p className="text-xs text-[#64748B] dark:text-[#475569]">Latest incoming freight enquiries</p>
            </div>
            <Link href="/requests" className="text-xs font-semibold text-[#F97316] hover:underline">View All →</Link>
          </div>
          <ul className="divide-y divide-[#F1F5F9] dark:divide-[#1A2A40]">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href="/requests"
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#FFF7ED] dark:hover:bg-[#1A2A40]">
                  <SourceBadge source={r.source} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">{r.senderName}</p>
                    <p className="truncate text-xs text-[#64748B] dark:text-[#94A3B8]">
                      {r.originCity} → {r.destinationCity} · <span className="font-medium">{r.cargoType}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={r.status} />
                    <span className="text-[11px] tabular-nums text-[#94A3B8] dark:text-[#475569]">{r.receivedRelative}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
