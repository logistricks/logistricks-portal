"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ThemeToggle } from "@/components/portal/theme-toggle"
import { NotificationBell } from "@/components/portal/notification-bell"

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/requests":  "Requests",
  "/carriers":  "Carriers",
  "/templates": "Templates",
  "/activity":  "Activity Log",
  "/settings":  "Settings",
}

function titleFor(pathname: string) {
  const key = Object.keys(titles).find(
    (k) => pathname === k || pathname.startsWith(k + "/"),
  )
  return key ? titles[key] : "Operations Portal"
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function PortalTopbar() {
  const pathname = usePathname()
  const [now, setNow]                 = useState<string>("")
  const [displayName, setDisplayName] = useState<string>("")

  useEffect(() => {
    const update = () =>
      setNow(
        new Date().toLocaleString("en-GB", {
          weekday: "short",
          day:     "numeric",
          month:   "short",
          hour:    "2-digit",
          minute:  "2-digit",
        }),
      )
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    try {
      setDisplayName(sessionStorage.getItem("portal_username") ?? "")
    } catch {
      setDisplayName("")
    }
  }, [])

  const avatarInitials = displayName ? initials(displayName) : "—"

  return (
    <header
      className="sticky top-0 z-20 flex h-14 items-center justify-between px-4 md:px-8"
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "var(--brand-navy)",
        fontFamily: "var(--font-sans), system-ui, sans-serif",
      }}
    >
      {/* Left: current page label */}
      <h1
        className="hidden w-24 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] sm:block"
        style={{ color: "#475569", fontFamily: "var(--font-mono), monospace" }}
      >
        {titleFor(pathname)}
      </h1>

      {/* Center: Logistricks wordmark */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <Link href="/dashboard" className="flex items-center gap-2.5 select-none">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[22px] font-black leading-none"
            style={{
              background: "rgba(232,130,26,0.12)",
              color: "var(--brand-accent)",
              fontFamily: "var(--font-sans), system-ui, sans-serif",
            }}
          >
            L
          </div>
          <span
            className="hidden text-[17px] font-black tracking-tight text-white sm:inline"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            Logis<span style={{ color: "var(--brand-accent)" }}>tricks</span>
          </span>
        </Link>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <span
          className="hidden text-xs tabular-nums sm:block"
          style={{ color: "#475569", fontFamily: "var(--font-mono), monospace" }}
        >
          {now}
        </span>
        <ThemeToggle />
        <NotificationBell />
        <div className="flex items-center gap-2.5 pl-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold text-white"
            style={{ background: "var(--brand-navy-mid)" }}
          >
            {avatarInitials}
          </div>
          {displayName && (
            <span
              className="hidden text-sm font-medium text-[#e2e8f0] lg:block"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {displayName}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
