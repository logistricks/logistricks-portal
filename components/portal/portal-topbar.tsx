"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Activity,
  Building2,
  CheckSquare,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  MailCheck,
  Plus,
  Settings,
  Users,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ThemeToggle } from "@/components/portal/theme-toggle"
import { NotificationBell } from "@/components/portal/notification-bell"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function PortalTopbar() {
  const pathname = usePathname()
  const router   = useRouter()

  const [pendingCount, setPendingCount]   = useState<number>(0)
  const [approvalCount, setApprovalCount] = useState<number>(0)
  const [displayName, setDisplayName]     = useState<string>("")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Username from sessionStorage ─────────────────────────────
  useEffect(() => {
    try {
      setDisplayName(sessionStorage.getItem("portal_username") ?? "")
    } catch { /* */ }
  }, [])

  // ── Badge counts — poll /api/stats every 30 s ─────────────────
  useEffect(() => {
    async function fetchCounts() {
      try {
        const res = await fetch("/api/stats")
        if (!res.ok) return
        const data = await res.json()
        setPendingCount(data.pending ?? 0)
        fetch("/api/approval-requests?view=mine")
          .then((r) => (r.ok ? r.json() : []))
          .then((rows: unknown[]) => setApprovalCount(rows.length))
          .catch(() => {})
      } catch { /* keep stale */ }
    }

    fetchCounts()
    pollRef.current = setInterval(fetchCounts, 30_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      sessionStorage.clear()
    } catch { /* */ }
    router.push("/login")
  }

  const nav = [
    { label: "Dashboard",       href: "/dashboard",        icon: LayoutDashboard },
    { label: "Requests",        href: "/requests",         icon: FileText,    badge: pendingCount },
    { label: "Carriers",        href: "/carriers",         icon: Building2 },
    { label: "Templates",       href: "/templates",        icon: Mail },
    { label: "Approvals",       href: "/approvals",        icon: CheckSquare, badge: approvalCount },
    { label: "Activity",        href: "/activity",         icon: Activity },
    { label: "Auto Reply",      href: "/auto-reply-logs",  icon: MailCheck },
    { label: "Users",           href: "/users",            icon: Users },
    { label: "Settings",        href: "/settings",         icon: Settings,    exact: true },
  ]

  const avatarInitials = displayName ? initials(displayName) : "—"

  return (
    <header
      className="sticky top-0 z-40 flex h-[60px] items-center justify-between px-4 md:px-6"
      style={{
        background: "linear-gradient(135deg, #0f1e36 0%, #1a3352 60%, #1e3d5c 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        fontFamily: "var(--font-sans), system-ui, sans-serif",
        boxShadow: "0 2px 8px rgba(15,30,54,0.25)",
      }}
    >
      {/* Logo */}
      <Link href="/dashboard" className="flex shrink-0 items-center gap-2 select-none">
        <div
          className="flex h-8 w-8 items-center justify-center rounded text-base font-black leading-none"
          style={{
            background: "rgba(232,130,26,0.15)",
            color: "#E8821A",
          }}
        >
          L
        </div>
        <span className="hidden text-[17px] font-black tracking-tight text-white sm:inline">
          Logis<span style={{ color: "#E8821A" }}>tricks</span>
        </span>
      </Link>

      {/* Nav links */}
      <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-center px-4">
        {nav.map((item) => {
          const active =
            item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/")
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors group"
              style={{
                background: active ? "rgba(232,130,26,0.18)" : "transparent",
                color: active ? "#ffffff" : "rgba(255,255,255,0.65)",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.07)"
                  ;(e.currentTarget as HTMLAnchorElement).style.color = "#ffffff"
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  ;(e.currentTarget as HTMLAnchorElement).style.background = "transparent"
                  ;(e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.65)"
                }
              }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{item.label}</span>
              {item.badge ? (
                <span
                  className="inline-flex h-4 min-w-[16px] items-center justify-center rounded px-1 text-[10px] font-bold"
                  style={{
                    background: active ? "rgba(255,255,255,0.25)" : "#E8821A",
                    color: "#ffffff",
                  }}
                >
                  {item.badge}
                </span>
              ) : null}
              {active && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t"
                  style={{ background: "#E8821A" }}
                />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Right actions */}
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/requests/new"
          className="hidden sm:flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-80"
          style={{ background: "#E8821A" }}
        >
          <Plus className="h-3.5 w-3.5" />
          New Request
        </Link>
        <ThemeToggle />
        <NotificationBell />
        {/* Avatar / user */}
        <div className="flex items-center gap-2 pl-1">
          <button
            onClick={handleLogout}
            title={`${displayName} — Log out`}
            className="group flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.1)" }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = "rgba(232,130,26,0.25)"
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"
            }}
          >
            {avatarInitials}
          </button>
          {displayName && (
            <span className="hidden text-sm font-medium text-[#e2e8f0] lg:block">
              {displayName}
            </span>
          )}
          <button
            onClick={handleLogout}
            aria-label="Log out"
            className="hidden sm:flex h-7 w-7 items-center justify-center rounded transition-colors"
            style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = "#f87171"
              ;(e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"
              ;(e.currentTarget as HTMLButtonElement).style.background = "transparent"
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
