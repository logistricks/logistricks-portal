"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Activity, Building2, FileText, LayoutDashboard, LogOut, Mail, Pin, PinOff, Settings } from "lucide-react"
import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { currentUser, requests } from "@/lib/portal-data"

const pendingCount = requests.filter((r) => r.status === "Pending").length

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Requests", href: "/requests", icon: FileText, badge: pendingCount },
  { label: "Carriers", href: "/carriers", icon: Building2 },
  { label: "Templates", href: "/templates", icon: Mail },
  { label: "Activity Log", href: "/activity", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings },
]

export function PortalSidebar({
  pinned,
  onPin,
}: {
  pinned: boolean
  onPin: (v: boolean) => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [hovered, setHovered] = useState(false)

  const expanded = pinned || hovered

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        fixed inset-y-0 left-0 z-40
        hidden md:flex flex-col
        border-r border-white/5 bg-[#0D1B2A]
        overflow-hidden
        transition-[width] duration-200 ease-in-out
        ${expanded ? "w-60" : "w-14"}
      `}
    >
      {/* Logo */}
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-white/5 px-3">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          {/* Icon mark — always visible */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#F97316]/10">
            <span className="text-base font-black leading-none text-[#F97316]"
              style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>L</span>
          </div>
          {/* Full wordmark — visible when expanded */}
          <div className={`overflow-hidden transition-[max-width,opacity] duration-200 ${expanded ? "max-w-[140px] opacity-100" : "max-w-0 opacity-0"}`}>
            <span className="whitespace-nowrap text-[18px] font-black tracking-tight text-white"
              style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>Logis</span>
            <span className="whitespace-nowrap text-[18px] font-black tracking-tight text-[#F97316]"
              style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>tricks</span>
          </div>
        </Link>

        {/* Pin button — only when expanded */}
        <button
          onClick={() => onPin(!pinned)}
          aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#475569] transition-all hover:bg-[#1E3A5F] hover:text-[#94A3B8] ${expanded ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto py-3 px-2">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={expanded ? undefined : item.label}
              className={`
                group relative flex items-center rounded py-3 text-sm font-medium transition-colors
                ${expanded ? "gap-3 px-3" : "justify-center px-0"}
                ${active
                  ? "bg-[#F97316] text-white"
                  : "text-[#94A3B8] hover:bg-[#1E3A5F] hover:text-[#E2E8F0]"}
              `}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />

              {/* Label */}
              <span className={`flex-1 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 tracking-tight ${expanded ? "max-w-[160px] opacity-100" : "max-w-0 opacity-0"}`}>
                {item.label}
              </span>

              {/* Badge */}
              {item.badge ? (
                <span
                  className={`
                    flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-[11px] font-bold
                    transition-[max-width,opacity] duration-200
                    ${expanded ? "max-w-[40px] opacity-100" : "max-w-0 opacity-0 overflow-hidden"}
                    ${active ? "bg-white/20 text-white" : "bg-[#F97316] text-white"}
                  `}
                >
                  {item.badge}
                </span>
              ) : null}

              {/* Tooltip (collapsed only) */}
              {!expanded && (
                <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded bg-[#0D1B2A] px-2.5 py-1 text-xs font-semibold text-[#E2E8F0] shadow-lg group-hover:block">
                  {item.label}
                  {item.badge ? ` (${item.badge})` : ""}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/5 p-2">
        {expanded ? (
          <div className="flex items-center gap-3 rounded px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#1E3A5F] text-sm font-semibold text-white">
              {currentUser.initials}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-sm font-semibold text-[#E2E8F0]">{currentUser.name}</p>
              <p className="truncate text-xs text-[#475569]">{currentUser.email}</p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[#475569] transition-colors hover:bg-[#1E3A5F] hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex justify-center py-1">
            <button
              onClick={handleLogout}
              title={`${currentUser.name} — Log out`}
              className="flex h-8 w-8 items-center justify-center rounded bg-[#1E3A5F] text-sm font-semibold text-white transition-colors hover:bg-[#F97316]/20 hover:text-red-400"
            >
              {currentUser.initials}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
