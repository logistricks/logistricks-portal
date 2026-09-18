"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Activity, Building2, FileText, LayoutDashboard, LogOut, Mail, Pin, PinOff, Settings } from "lucide-react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"

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
  const [displayName, setDisplayName]   = useState<string>("")
  const [userEmail, setUserEmail]       = useState<string>("")

  // ── Username from sessionStorage ─────────────────────────────
  useEffect(() => {
    try {
      setDisplayName(sessionStorage.getItem("portal_username") ?? "")
    } catch { /* */ }
  }, [])

  // ── Auth email from Supabase session ─────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email)
    })
  }, [])

  // ── Live pending count ────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()

    async function fetchPending() {
      const { count } = await supabase
        .from("freight_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "Pending")
      setPendingCount(count ?? 0)
    }

    fetchPending()

    // Keep badge in sync with realtime inserts/updates
    const channel = supabase
      .channel("sidebar_pending")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "freight_requests" },
        () => { fetchPending() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const nav = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Requests",  href: "/requests",  icon: FileText, badge: pendingCount },
    { label: "Carriers",  href: "/carriers",  icon: Building2 },
    { label: "Templates", href: "/templates", icon: Mail },
    { label: "Activity Log", href: "/activity", icon: Activity },
    { label: "Settings",  href: "/settings",  icon: Settings },
  ]

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    try { sessionStorage.clear() } catch { /* */ }
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
        border-r border-white/5 bg-[#0D1B2A]
        transition-[width] duration-200 ease-in-out
        ${expanded ? "w-60" : "w-14"}
      `}
    >
      {/* Logo */}
      <div className="flex h-[60px] shrink-0 items-center border-b border-white/5 px-3">
        {expanded ? (
          <>
            <Link href="/dashboard" className="flex flex-1 items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#F97316]/10">
                <span className="text-base font-black leading-none text-[#F97316]"
                  style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>L</span>
              </div>
              <span
                className="whitespace-nowrap text-[18px] font-black tracking-tight text-white"
                style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
              >Logis</span>
              <span
                className="whitespace-nowrap text-[18px] font-black tracking-tight text-[#F97316] -ml-1"
                style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
              >tricks</span>
            </Link>
            <button
              onClick={() => onPin(!pinned)}
              aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
              className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#475569] transition-colors hover:bg-[#1E3A5F] hover:text-[#94A3B8]"
            >
              {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
          </>
        ) : (
          <div className="flex w-full items-center justify-center">
            <Link href="/dashboard">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-[#F97316]/10">
                <span className="text-base font-black leading-none text-[#F97316]"
                  style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>L</span>
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
                ${active
                  ? "bg-[#F97316] text-white"
                  : "text-[#94A3B8] hover:bg-[#1E3A5F] hover:text-[#E2E8F0]"}
              `}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />

              {expanded && (
                <span className="flex-1 tracking-tight truncate">{item.label}</span>
              )}

              {expanded && item.badge ? (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-[11px] font-bold ${
                    active ? "bg-white/20 text-white" : "bg-[#F97316] text-white"
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}

              {/* Tooltip — collapsed only */}
              {!expanded && (
                <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded bg-[#0D1B2A] px-2.5 py-1 text-xs font-semibold text-[#E2E8F0] shadow-lg group-hover:block border border-white/10">
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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#1E3A5F] text-xs font-bold text-white">
              {avatarInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#E2E8F0]">{displayName || "—"}</p>
              <p className="truncate text-xs text-[#475569]">{userEmail}</p>
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
          <div className="flex w-full justify-center py-1">
            <button
              onClick={handleLogout}
              title={`${displayName} — Log out`}
              className="flex h-8 w-8 items-center justify-center rounded bg-[#1E3A5F] text-xs font-bold text-white transition-colors hover:bg-[#F97316]/20 hover:text-red-400"
            >
              {avatarInitials}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
