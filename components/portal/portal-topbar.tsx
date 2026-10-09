"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ThemeToggle } from "@/components/portal/theme-toggle"
import { useBranding } from "@/lib/use-branding"
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
  const [unlinkedCount, setUnlinkedCount] = useState<number>(0)
  const [displayName, setDisplayName]     = useState<string>("")
  const branding = useBranding()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    try { setDisplayName(sessionStorage.getItem("portal_username") ?? "") } catch { /* */ }
  }, [])

  useEffect(() => {
    async function fetchCounts() {
      try {
        const res = await fetch("/api/stats")
        if (!res.ok) return
        const data = await res.json()
        setPendingCount(data.pending ?? 0)
        fetch("/api/carrier-quotes/unlinked?count=1")
          .then((r) => (r.ok ? r.json() : { count: 0 }))
          .then((d: { count?: number }) => setUnlinkedCount(d.count ?? 0))
          .catch(() => {})
        fetch("/api/approval-requests?view=mine")
          .then((r) => (r.ok ? r.json() : []))
          .then((rows: unknown[]) => setApprovalCount(rows.length))
          .catch(() => {})
      } catch { /* keep stale */ }
    }
    fetchCounts()
    pollRef.current = setInterval(fetchCounts, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); sessionStorage.clear() } catch { /* */ }
    router.push("/login")
  }

  const nav = [
    { label: "Dashboard",   href: "/dashboard",       exact: true },
    { label: "Requests",    href: "/requests",         badge: pendingCount },
    { label: "Non-linked Quotes", href: "/unlinked-quotes", badge: unlinkedCount },
    { label: "Approvals",   href: "/approvals",        badge: approvalCount },
    { label: "Auto Reply",  href: "/auto-reply-logs" },
    { label: "Users",       href: "/users" },
    { label: "Trial Leads", href: "/trial-leads" },
    { label: "Reports",     href: "/reports" },
    { label: "Settings",    href: "/settings",         exact: true },
  ]

  const avatarInitials = displayName ? initials(displayName) : "—"

  return (
    <>
      <header
        className="sticky top-0 z-40 flex h-[60px] items-center justify-between px-4 md:px-6"
        style={{
          background: "linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-navy-mid) 60%, var(--brand-navy-light) 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          boxShadow: "0 2px 12px rgba(15,30,54,0.35)",
        }}
      >
        {/* Logo */}
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 select-none">
          {branding.logo && (
            <span className="flex h-9 shrink-0 items-center rounded-md bg-white px-1.5">
              <img src={branding.logo} alt={branding.displayName || "Logo"} className="max-h-7 max-w-[120px] object-contain" />
            </span>
          )}
          <div>
            <div
              className="text-[17px] font-black tracking-tight text-white leading-none"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif", letterSpacing: "0.02em" }}
            >
              LOGIS<span style={{ color: "var(--brand-accent)" }}>TRICKS</span>
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Freight Portal
            </div>
          </div>
        </Link>

        {/* Nav links — text only, no icons */}
        <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-center px-6">
          {nav.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex items-center gap-1.5 rounded-md px-[14px] py-[6px] text-[13px] font-medium uppercase transition-all"
                style={{
                  background: active ? "rgba(255,255,255,0.14)" : "transparent",
                  color: active ? "#ffffff" : "rgba(255,255,255,0.72)",
                  fontFamily: "var(--font-sans), system-ui, sans-serif",
                  letterSpacing: "0.03em",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    ;(e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.1)"
                    ;(e.currentTarget as HTMLAnchorElement).style.color = "#ffffff"
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    ;(e.currentTarget as HTMLAnchorElement).style.background = "transparent"
                    ;(e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.72)"
                  }
                }}
              >
                <span className="whitespace-nowrap">{item.label}</span>
                {item.badge ? (
                  <span
                    className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                    style={{
                      background: active ? "rgba(255,255,255,0.25)" : "var(--brand-accent)",
                      color: "#ffffff",
                    }}
                  >
                    {item.badge}
                  </span>
                ) : null}

              </Link>
            )
          })}
        </nav>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <NotificationBell />
          <div className="flex items-center gap-1.5 pl-1">
            <button
              onClick={handleLogout}
              title={`${displayName} — Log out`}
              className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.1)", fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = "rgb(var(--brand-accent-rgb) / 0.25)" }}
              onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)" }}
            >
              {avatarInitials}
            </button>
            {displayName && (
              <span className="hidden text-[13px] font-semibold text-[#e2e8f0] lg:block" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
                {displayName}
              </span>
            )}
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="hidden sm:flex h-7 w-7 items-center justify-center rounded-md transition-colors"
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
    </>
  )
}
