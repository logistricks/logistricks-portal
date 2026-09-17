"use client"

import { usePathname } from "next/navigation"
import { Bell } from "lucide-react"
import { useEffect, useState } from "react"
import { currentUser } from "@/lib/portal-data"
import { ThemeToggle } from "@/components/portal/theme-toggle"

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/requests": "Requests",
  "/carriers": "Carriers",
  "/templates": "Templates",
  "/activity": "Activity Log",
  "/settings": "Settings",
}

function titleFor(pathname: string) {
  const key = Object.keys(titles).find((k) => pathname === k || pathname.startsWith(k + "/"))
  return key ? titles[key] : "Operations Portal"
}

export function PortalTopbar() {
  const pathname = usePathname()
  const [now, setNow] = useState<string>("")

  useEffect(() => {
    const update = () =>
      setNow(
        new Date().toLocaleString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      )
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#E2E8F0] bg-white px-4 dark:border-[#1E3A5F] dark:bg-[#0D1B2A] md:px-8">
      <h1 className="text-base font-bold tracking-tight text-[#0F172A] dark:text-[#E2E8F0]">{titleFor(pathname)}</h1>
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
            {currentUser.initials}
          </div>
          <span className="hidden text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0] lg:block">{currentUser.name}</span>
        </div>
      </div>
    </header>
  )
}
