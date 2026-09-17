"use client"

import { usePathname } from "next/navigation"
import { Bell } from "lucide-react"
import { useEffect, useState } from "react"
import { currentUser } from "@/lib/portal-data"

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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#E2E8F0] bg-white px-4 md:px-8">
      <h1 className="text-lg font-bold text-[#0F172A]">{titleFor(pathname)}</h1>
      <div className="flex items-center gap-4">
        <span className="hidden text-sm tabular-nums text-[#64748B] sm:block">{now}</span>
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-lg p-2 text-[#64748B] transition-colors hover:bg-[#F0F4F8] hover:text-[#0F172A]"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#F97316]" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0D1B2A] text-xs font-semibold text-white">
            {currentUser.initials}
          </div>
          <span className="hidden text-sm font-medium text-[#0F172A] lg:block">{currentUser.name}</span>
        </div>
      </div>
    </header>
  )
}
