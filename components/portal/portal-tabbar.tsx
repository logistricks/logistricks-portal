"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Building2, FileText, LayoutDashboard, Mail } from "lucide-react"

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Requests", href: "/requests", icon: FileText },
  { label: "Carriers", href: "/carriers", icon: Building2 },
  { label: "Templates", href: "/templates", icon: Mail },
  { label: "Activity", href: "/activity", icon: Activity },
]

export function PortalTabbar() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[#E2E8F0] bg-white dark:bg-[#0D1B2A] md:hidden">
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/")
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
              active ? "text-[#F97316]" : "text-[#94A3B8]"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
