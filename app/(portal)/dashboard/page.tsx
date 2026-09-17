"use client"

import Link from "next/link"
import { useState } from "react"
import { Clock, Inbox, Mail, MessageCircle, Plus } from "lucide-react"
import { SourceBadge, StatusBadge } from "@/components/portal/badges"
import { StatCard } from "@/components/portal/stat-card"
import { currentUser, dashboardStats, requests } from "@/lib/portal-data"

const periods = ["Today", "Yesterday", "This Week", "This Month", "Custom Range"]

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

const sourceBreakdown = [
  { label: "Email", count: dashboardStats.email, color: "bg-blue-500", text: "text-blue-600" },
  { label: "WhatsApp", count: dashboardStats.whatsapp, color: "bg-green-500", text: "text-green-600" },
  { label: "Voice Note", count: dashboardStats.voiceNote, color: "bg-purple-500", text: "text-purple-600" },
]

export default function DashboardPage() {
  const [period, setPeriod] = useState("Today")
  const total = dashboardStats.total
  const recent = requests.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-2xl font-bold text-[#0D1B2A]">
          {greeting()}, {currentUser.name.split(" ")[0]}
        </h2>
        <div className="flex flex-wrap gap-2">
          {periods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                period === p
                  ? "bg-[#F97316] text-white"
                  : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#F97316]/40"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="TOTAL REQUESTS TODAY"
          value={total}
          sub={dashboardStats.totalDelta}
          subClass="text-emerald-600 font-medium"
          icon={Inbox}
          iconClass="text-[#F97316]"
        />
        <StatCard
          label="EMAIL REQUESTS"
          value={dashboardStats.email}
          sub={`${Math.round((dashboardStats.email / total) * 100)}% of total`}
          icon={Mail}
          iconClass="text-blue-500"
        />
        <StatCard
          label="WHATSAPP MESSAGES"
          value={dashboardStats.whatsapp}
          sub={`${Math.round((dashboardStats.whatsapp / total) * 100)}% of total`}
          icon={MessageCircle}
          iconClass="text-green-500"
        />
        <StatCard
          label="AWAITING ACTION"
          value={dashboardStats.pending}
          sub="Requires carrier outreach"
          valueClass="text-[#F97316]"
          icon={Clock}
          iconClass="text-[#F97316]"
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Recent requests */}
        <div className="rounded-lg border border-[#E2E8F0] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] lg:col-span-3">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4">
            <h3 className="font-semibold text-[#0D1B2A]">Recent Requests</h3>
            <Link href="/requests" className="text-sm font-medium text-[#F97316] hover:underline">
              View All →
            </Link>
          </div>
          <ul className="divide-y divide-[#E2E8F0]">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href="/requests"
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[#F8FAFC]"
                >
                  <SourceBadge source={r.source} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#0F172A]">{r.senderName}</p>
                    <p className="truncate text-xs text-[#64748B]">
                      {r.originCity} → {r.destinationCity}
                    </p>
                  </div>
                  <span className="hidden text-xs tabular-nums text-[#94A3B8] sm:block">{r.receivedRelative}</span>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Source breakdown */}
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] lg:col-span-2">
          <h3 className="font-semibold text-[#0D1B2A]">Requests by Source</h3>
          <div className="mt-4 flex items-center gap-6">
            <DonutChart segments={sourceBreakdown} total={total} />
            <ul className="flex-1 space-y-3">
              {sourceBreakdown.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                  <span className="flex-1 text-sm text-[#0F172A]">{s.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-[#0D1B2A]">{s.count}</span>
                  <span className="w-10 text-right text-xs tabular-nums text-[#64748B]">
                    {total ? Math.round((s.count / total) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <h3 className="mb-4 font-semibold text-[#0D1B2A]">Quick Actions</h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/requests"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#EA580C] hover:scale-[1.01]"
          >
            <Clock className="h-4 w-4" /> View Pending Requests
          </Link>
          <Link
            href="/carriers"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#0F172A] transition-all duration-150 hover:border-[#F97316]/40 hover:scale-[1.01]"
          >
            <Plus className="h-4 w-4" /> Add New Carrier
          </Link>
          <Link
            href="/templates"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#0F172A] transition-all duration-150 hover:border-[#F97316]/40 hover:scale-[1.01]"
          >
            <Mail className="h-4 w-4" /> Create Template
          </Link>
        </div>
      </div>
    </div>
  )
}

function DonutChart({
  segments,
  total,
}: {
  segments: { label: string; count: number; color: string }[]
  total: number
}) {
  const colors: Record<string, string> = {
    "bg-blue-500": "#3b82f6",
    "bg-green-500": "#22c55e",
    "bg-purple-500": "#a855f7",
  }
  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const filtered = segments.filter((s) => s.count > 0)

  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#F0F4F8" strokeWidth="12" />
        {filtered.map((s) => {
          const fraction = total ? s.count / total : 0
          const dash = fraction * circumference
          const seg = (
            <circle
              key={s.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={colors[s.color]}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          )
          offset += dash
          return seg
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black tabular-nums text-[#0D1B2A]">{total}</span>
        <span className="text-[10px] uppercase tracking-wider text-[#64748B]">Total</span>
      </div>
    </div>
  )
}
