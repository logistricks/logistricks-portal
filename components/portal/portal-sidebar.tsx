"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Activity, Building2, CheckSquare, FileText, LayoutDashboard, LogOut, Mail, MailCheck, Pin, PinOff, Settings, Users } from "lucide-react"
import { useEffect, useRef, useState } from "react"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function PortalSidebar({
  expanded,
  pinned,
  onPin,
  onHover,
}: {
  expanded: boolean
  pinned: boolean
  onPin: (v: boolean) => void
  onHover: (v: boolean) => void
}) {
  const pathname = usePathname()
  const router   = useRouter()

  const [pendingCount, setPendingCount] = useState<number>(0)
  const [approvalCount, setApprovalCount] = useState<number>(0)
  const [displayName, setDisplayName]   = useState<string>("")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Username from sessionStorage ─────────────────────────────
  useEffect(() => {
    try {
      setDisplayName(sessionStorage.getItem("portal_username") ?? "")
    } catch { /* */ }
  }, [])

  // ── Pending count — poll /api/stats every 30 s ────────────────
  useEffect(() => {
    async function fetchPending() {
      try {
        const res = await fetch("/api/stats")
        if (!res.ok) return
        const data = await res.json()
        setPendingCount(data.pending ?? 0)
        // Fetch pending approvals for current user
        fetch("/api/approval-requests?view=mine")
          .then(r => r.ok ? r.json() : [])
          .then((rows: unknown[]) => setApprovalCount(rows.length))
          .catch(() => {})
      } catch { /* keep stale */ }
    }

    fetchPending()
    pollRef.current = setInterval(fetchPending, 30_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const nav = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Requests",  href: "/requests",  icon: FileText, badge: pendingCount },
    { label: "Carriers",  href: "/carriers",  icon: Building2 },
    { label: "Templates", href: "/templates", icon: Mail },
    { label: "Approvals",    href: "/approvals",  icon: CheckSquare, badge: approvalCount },
    { label: "Activity Log", href: "/activity", icon: Activity },
    { label: "Auto Reply Logs", href: "/auto-reply-logs", icon: MailCheck },
    { label: "Users",        href: "/users",    icon: Users },
    { label: "Settings",  href: "/settings",  icon: Settings },
  ]

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      sessionStorage.clear()
    } catch { /* */ }
    router.push("/login")
  }

  const avatarInitials = displayName ? initials(displayName) : "—"

  return (
    <aside
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`
        fixed inset-y-0 left-0 z-40
        hidden md:flex flex-col
        transition-[width] duration-200 ease-in-out
        ${expanded ? "w-60" : "w-14"}
      `}
      style={{
        background: "var(--brand-navy)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        fontFamily: "var(--font-sans), system-ui, sans-serif",
      }}
    >
      {/* Logo */}
      <div
        className="flex h-[60px] shrink-0 items-center px-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        {expanded ? (
          <>
            <Link href="/dashboard" className="flex flex-1 items-center gap-2 min-w-0">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-base font-black leading-none"
                style={{
                  background: "rgba(232,130,26,0.12)",
                  color: "var(--brand-accent)",
                  fontFamily: "var(--font-sans), system-ui, sans-serif",
                }}
              >
                L
              </div>
              <span
                className="whitespace-nowrap text-[18px] font-black tracking-tight text-white"
                style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              >
                Logis<span style={{ color: "var(--brand-accent)" }}>tricks</span>
              </span>
            </Link>
            <button
              onClick={() => onPin(!pinned)}
              aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
              className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors"
              style={{ color: "#475569" }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = "var(--brand-navy-mid)"
                ;(e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = "transparent"
                ;(e.currentTarget as HTMLButtonElement).style.color = "#475569"
              }}
            >
              {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
          </>
        ) : (
          <div className="flex w-full items-center justify-center">
            <Link href="/dashboard">
              <div
                className="flex h-8 w-8 items-center justify-center rounded text-base font-black leading-none"
                style={{
                  background: "rgba(232,130,26,0.12)",
                  color: "var(--brand-accent)",
                  fontFamily: "var(--font-sans), system-ui, sans-serif",
                }}
              >
                L
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!expanded ? item.label : undefined}
              className={`
                group relative flex items-center rounded py-3 text-sm font-medium transition-colors
                ${expanded ? "gap-3 px-3" : "justify-center px-0 w-full"}
              `}
              style={{
                background: active ? "var(--brand-accent)" : "transparent",
                color: active ? "#ffffff" : "#94a3b8",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  ;(e.currentTarget as HTMLAnchorElement).style.background = "var(--brand-navy-mid)"
                  ;(e.currentTarget as HTMLAnchorElement).style.color = "#e2e8f0"
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  ;(e.currentTarget as HTMLAnchorElement).style.background = "transparent"
                  ;(e.currentTarget as HTMLAnchorElement).style.color = "#94a3b8"
                }
              }}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />

              {expanded && (
                <span className="flex-1 tracking-tight truncate">{item.label}</span>
              )}

              {expanded && item.badge ? (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-[11px] font-bold"
                  style={{
                    background: active ? "rgba(255,255,255,0.2)" : "var(--brand-accent)",
                    color: "#ffffff",
                  }}
                >
                  {item.badge}
                </span>
              ) : null}

              {/* Tooltip — collapsed only */}
              {!expanded && (
                <span
                  className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded px-2.5 py-1 text-xs font-semibold shadow-lg group-hover:block"
                  style={{
                    background: "var(--brand-navy)",
                    color: "#e2e8f0",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontFamily: "var(--font-sans), system-ui, sans-serif",
                  }}
                >
                  {item.label}
                  {item.badge ? ` (${item.badge})` : ""}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div
        className="shrink-0 p-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        {expanded ? (
          <div className="flex items-center gap-3 rounded px-2 py-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold text-white"
              style={{ background: "var(--brand-navy-mid)" }}
            >
              {avatarInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-semibold text-[#e2e8f0]"
                style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              >
                {displayName || "—"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded transition-colors"
              style={{ color: "#475569" }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = "var(--brand-navy-mid)"
                ;(e.currentTarget as HTMLButtonElement).style.color = "#f87171"
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = "transparent"
                ;(e.currentTarget as HTMLButtonElement).style.color = "#475569"
              }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex w-full justify-center py-1">
            <button
              onClick={handleLogout}
              title={`${displayName} — Log out`}
              className="flex h-8 w-8 items-center justify-center rounded text-xs font-bold text-white transition-colors"
              style={{ background: "var(--brand-navy-mid)" }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = "rgba(232,130,26,0.2)"
                ;(e.currentTarget as HTMLButtonElement).style.color = "#f87171"
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = "var(--brand-navy-mid)"
                ;(e.currentTarget as HTMLButtonElement).style.color = "white"
              }}
            >
              {avatarInitials}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
