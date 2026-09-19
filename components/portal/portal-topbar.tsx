"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, Plane, Ship, Truck } from "lucide-react"
import { useEffect, useState } from "react"
import { ThemeToggle } from "@/components/portal/theme-toggle"

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

/* Small icon badge positioned around the L logo */
function IconBadge({
  icon,
  animClass,
  style,
}: {
  icon: React.ReactNode
  animClass: string
  style: React.CSSProperties
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute flex h-[20px] w-[20px] items-center justify-center rounded-full bg-[#F97316] shadow-md ${animClass}`}
      style={style}
    >
      {icon}
    </div>
  )
}

export function PortalTopbar() {
  const pathname = usePathname()
  const [now, setNow]                 = useState<string>("")
  const [displayName, setDisplayName] = useState<string>("")
  const [animated, setAnimated]       = useState(false)

  /* Live clock */
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

  /* Display name from session */
  useEffect(() => {
    try {
      setDisplayName(sessionStorage.getItem("portal_username") ?? "")
    } catch {
      setDisplayName("")
    }
  }, [])

  /* Animate on every mount / refresh — no localStorage gate */
  useEffect(() => {
    setAnimated(true)
  }, [])

  const avatarInitials = displayName ? initials(displayName) : "—"

  return (
    <>
      {/* Always-present keyframe CSS */}
      <style>{`
        @keyframes lt-fly-ship {
          0%   { transform: translate(-220px, 220px) scale(7); opacity: 0; }
          12%  { opacity: 1; }
          100% { transform: translate(0, 0) scale(1); opacity: 1; }
        }
        @keyframes lt-fly-truck {
          0%   { transform: translate(220px, 220px) scale(7); opacity: 0; }
          12%  { opacity: 1; }
          100% { transform: translate(0, 0) scale(1); opacity: 1; }
        }
        @keyframes lt-fly-plane {
          0%   { transform: translate(220px, -220px) scale(7); opacity: 0; }
          12%  { opacity: 1; }
          100% { transform: translate(0, 0) scale(1); opacity: 1; }
        }
        .lt-ship-anim  { animation: lt-fly-ship  5s cubic-bezier(0.12, 0.95, 0.35, 1) 0s    both; }
        .lt-truck-anim { animation: lt-fly-truck 5s cubic-bezier(0.12, 0.95, 0.35, 1) 0.8s  both; }
        .lt-plane-anim { animation: lt-fly-plane 5s cubic-bezier(0.12, 0.95, 0.35, 1) 1.6s  both; }
      `}</style>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#E2E8F0] bg-white px-4 dark:border-[#1E3A5F] dark:bg-[#0D1B2A] md:px-8">
        {/* Left: current page label */}
        <h1 className="hidden w-24 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8] dark:text-[#475569] sm:block">
          {titleFor(pathname)}
        </h1>

        {/* Center: Logistricks wordmark */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <Link href="/dashboard" className="flex items-center gap-2.5 select-none">
            {/* L badge + icon satellites */}
            <div
              className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-[#0D1B2A] dark:bg-[#F97316]/10"
              style={{ overflow: "visible" }}
            >
              <span
                className="relative z-10 text-[22px] font-black leading-none text-[#F97316]"
                style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
              >L</span>

              {/* Ship — bottom-left */}
              <IconBadge
                animClass={animated ? "lt-ship-anim" : "opacity-0"}
                style={{ bottom: "-11px", left: "-12px" }}
                icon={<Ship className="h-[10px] w-[10px] text-white" strokeWidth={2} />}
              />

              {/* Truck — bottom-right */}
              <IconBadge
                animClass={animated ? "lt-truck-anim" : "opacity-0"}
                style={{ bottom: "-11px", right: "-12px" }}
                icon={<Truck className="h-[10px] w-[10px] text-white" strokeWidth={2} />}
              />

              {/* Plane — top-right */}
              <IconBadge
                animClass={animated ? "lt-plane-anim" : "opacity-0"}
                style={{ top: "-11px", right: "-12px" }}
                icon={<Plane className="h-[10px] w-[10px] text-white" strokeWidth={2} />}
              />
            </div>

            <span
              className="hidden text-[17px] font-black tracking-tight text-[#0D1B2A] dark:text-white sm:inline"
              style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
            >
              Logis<span className="text-[#F97316]">tricks</span>
            </span>
          </Link>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <span className="hidden text-xs tabular-nums text-[#94A3B8] sm:block">{now}</span>
          <ThemeToggle />
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded text-[#64748B] transition-colors hover:bg-[#F0F4F8] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#1E3A5F] dark:hover:text-white"
          >
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#F97316]" />
          </button>
          <div className="flex items-center gap-2.5 pl-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#0D1B2A] text-xs font-bold text-white dark:bg-[#1E3A5F]">
              {avatarInitials}
            </div>
            {displayName && (
              <span className="hidden text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0] lg:block">
                {displayName}
              </span>
            )}
          </div>
        </div>
      </header>
    </>
  )
}
