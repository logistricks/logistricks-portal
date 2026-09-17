"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Building2, FileText, LayoutDashboard, LogOut, Mail, Settings } from "lucide-react"
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

export function PortalSidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[#0D1B2A] md:flex">
      <div className="px-6 py-5">
        <Link href="/dashboard" className="block">
          <span className="text-xl font-black tracking-tight text-white">Logi</span>
          <span className="text-xl font-black tracking-tight text-[#F97316]">tricks</span>
        </Link>
        <p className="mt-0.5 text-xs text-[#64748B]">Operations Portal</p>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-2">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-[#F97316] text-white" : "text-[#94A3B8] hover:bg-[#1E3A5F] hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                    active ? "bg-white/25 text-white" : "bg-[#F97316] text-white"
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1E3A5F] text-sm font-semibold text-white">
            {currentUser.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{currentUser.name}</p>
            <p className="truncate text-xs text-[#64748B]">{currentUser.email}</p>
          </div>
          <Link href="/login" aria-label="Log out" className="text-[#94A3B8] transition-colors hover:text-red-400">
            <LogOut className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </div>
    </aside>
  )
}
