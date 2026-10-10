"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Suspense, useEffect, useRef, useState } from "react"
import { ThemeToggle } from "@/components/portal/theme-toggle"
import { useBranding } from "@/lib/use-branding"
import { NotificationBell } from "@/components/portal/notification-bell"
import { PortalNav } from "@/components/portal/portal-nav"
import { HOME_HREF } from "@/lib/portal-nav"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function PortalTopbar() {
  const router   = useRouter()

  const [pendingCount, setPendingCount]   = useState<number>(0)
  const [approvalCount, setApprovalCount] = useState<number>(0)
  const [unlinkedCount, setUnlinkedCount] = useState<number>(0)
  const [displayName, setDisplayName]     = useState<string>("")
  const [pinned, setPinned]               = useState(false)
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

  const avatarInitials = displayName ? initials(displayName) : "—"

  return (
    <>
      <header
        className="sticky top-0 z-40 flex h-[60px] items-center justify-between gap-1 px-3 sm:gap-2 md:px-6"
        style={{
          background: "linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-navy-mid) 60%, var(--brand-navy-light) 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          boxShadow: "0 2px 12px rgba(15,30,54,0.35)",
        }}
      >
        {/* Home — logo only */}
        <Link
          href={HOME_HREF}
          onClick={() => { try { sessionStorage.removeItem("portal_nav_pin") } catch { /* */ } }}
          aria-label="Home"
          title="Home"
          className="flex h-10 shrink-0 items-center justify-center rounded-xl select-none"
          style={{ background: branding.logo ? "#ffffff" : "var(--brand-accent)", minWidth: 40, padding: branding.logo ? "0 8px" : 0, boxShadow: "0 4px 14px -6px rgb(var(--brand-accent-rgb) / 0.7)" }}
        >
          {branding.logo ? (
            <img src={branding.logo} alt={branding.displayName || "Home"} className="max-h-7 max-w-[120px] object-contain" />
          ) : (
            <span className="text-[19px] font-extrabold leading-none text-white" style={{ fontFamily: "var(--font-display), var(--font-sans), system-ui, sans-serif" }}>L</span>
          )}
        </Link>

        <Suspense fallback={<div className="flex-1" />}>
          <PortalNav counts={{ pending: pendingCount, unlinked: unlinkedCount, approvals: approvalCount }} onPinned={setPinned} />
        </Suspense>

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
      {/* keeps page content below the sub bar while a page is pinned */}
      <div aria-hidden style={{ height: pinned ? 48 : 0, transition: "height .16s ease" }} />
    </>
  )
}
